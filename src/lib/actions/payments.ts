'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { safeAction } from '@/lib/safe-action';
import { assertOrgRole } from '@/lib/auth';
import { getOrgBilling, getOrgBySlug } from '@/lib/org-data';
import { adminFetch } from '@/lib/supabase/admin-fetch';
import {
  createConnectedAccount,
  dashboardLink,
  onboardingLink,
  stripeConfigured,
} from '@/lib/stripe';

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

/**
 * Start or resume Stripe onboarding for a league, then send them to Stripe.
 *
 * Admin and above only: this decides where the league's registration money
 * lands, which is not something a coach or a league manager should be able to
 * repoint.
 */
async function _startStripeOnboarding(orgSlug: string): Promise<never> {
  await assertOrgRole(orgSlug, 'admin');
  if (!stripeConfigured()) throw new Error('Payments aren’t set up on this deployment yet.');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const billing = await getOrgBilling(org.id);
  let accountId = billing?.stripeAccountId ?? null;

  if (!accountId) {
    accountId = await createConnectedAccount({ orgName: org.name, orgSlug: org.slug });

    // organization_billing has no write policy by design, so this goes
    // through the service role -- after assertOrgRole above has established
    // that the caller is an admin of this league. adminFetch throws on a
    // non-2xx, which is what we want here: see below.
    try {
      await adminFetch(
        `/rest/v1/organization_billing?organization_id=eq.${encodeURIComponent(org.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            stripe_account_id: accountId,
            updated_at: new Date().toISOString(),
          }),
        },
      );
    } catch {
      // Save before redirecting. If this write fails we would hand them an
      // onboarding link for an account we have forgotten about -- they would
      // finish it, and next time we would create a second one, leaving an
      // orphaned account holding their bank details. Fail here instead and
      // let them retry cleanly.
      throw new Error('Couldn’t save the Stripe connection. Try again.');
    }
  }

  const link = await onboardingLink(accountId, `${await origin()}/manage/${orgSlug}/payments`);
  redirect(link);
}

/** Into the league's own Stripe dashboard — their payouts, their disputes. */
async function _openStripeDashboard(orgSlug: string): Promise<never> {
  await assertOrgRole(orgSlug, 'admin');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const billing = await getOrgBilling(org.id);
  if (!billing?.stripeAccountId) throw new Error('Connect Stripe first.');

  redirect(await dashboardLink(billing.stripeAccountId));
}

export const startStripeOnboarding = safeAction(_startStripeOnboarding);
export const openStripeDashboard = safeAction(_openStripeDashboard);
