'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { safeAction } from '@/lib/safe-action';
import { currentUserId } from '@/lib/auth';
import { getOrgBySlug, getOrgBilling } from '@/lib/org-data';
import { checkRateLimit } from '@/lib/rate-limit';
import { stripe, stripeConfigured } from '@/lib/stripe';
import { buildQuote, promoProblem, type PromoCode } from '@/lib/quote';
import {
  getProgramForRegistration,
  listAvailableTiers,
  listQuestions,
  siblingsAlreadyIn,
} from '@/lib/registration-data';

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

/**
 * Check a promo code.
 *
 * Rate-limited on IP: this is an unauthenticated-ish endpoint that says
 * whether a string is a valid code, which is exactly the shape of thing
 * someone would sit and guess at.
 */
async function _checkPromoCode(
  orgSlug: string,
  programId: string,
  code: string,
): Promise<{ promo: PromoCode } | { problem: string }> {
  const h = await headers();
  const ip = h.get('x-forwarded-for') ?? 'unknown';

  const allowed = await checkRateLimit(`promo:${ip}`, { max: 20, windowMinutes: 10 });
  if (!allowed) return { problem: 'Too many tries. Give it a few minutes.' };

  const supabase = await createClient();
  const { data } = await supabase.rpc('lookup_promo_code', {
    p_program_id: programId,
    p_code: code,
  });

  const row = Array.isArray(data) ? data[0] : null;

  const problem = promoProblem(
    row
      ? {
          isActive: row.is_active,
          startsAt: row.starts_at,
          expiresAt: row.expires_at,
          maxRedemptions: row.max_redemptions,
          redeemedCount: row.redeemed_count,
          programId: row.program_id,
        }
      : null,
    programId,
    new Date(),
  );

  if (problem || !row) return { problem: problem ?? 'That code isn’t recognised.' };

  return {
    promo: {
      id: row.id,
      code: row.code,
      discountType: row.discount_type as 'percent' | 'flat',
      discountValue: Number(row.discount_value),
    },
  };
}

/**
 * Register a player.
 *
 * The order here is the whole point. The row is created first, in 'pending',
 * holding the spot; then Stripe Checkout is opened against it. So:
 *
 *   - a parent who abandons checkout has a pending row that
 *     release_stale_registrations() frees after 30 minutes
 *   - a parent who pays but closes the tab is still registered, because the
 *     webhook confirms the row, not the browser coming back
 *   - a parent who double-taps gets their existing row back, not a second one
 *
 * The price is computed server-side from the same buildQuote() the browser
 * showed them, so the two can't disagree -- and nothing the client sends about
 * money is trusted. The posted form carries which tier and which code, never
 * an amount.
 */
async function _register(
  orgSlug: string,
  programId: string,
  formData: FormData,
): Promise<never> {
  const userId = await currentUserId();
  if (!userId) {
    redirect(`/signin?next=${encodeURIComponent(`/l/${orgSlug}/register/${programId}`)}`);
  }

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const program = await getProgramForRegistration(org.id, programId);
  if (!program) throw new Error('That program isn’t available.');

  const supabase = await createClient();

  // --- who is being registered ---------------------------------------------

  let dependentId: string | null = null;
  const dependentChoice = String(formData.get('dependent_id') ?? '');

  if (program.involvesMinors) {
    if (dependentChoice === 'new') {
      const firstName = String(formData.get('child_first_name') ?? '').trim();
      const lastName = String(formData.get('child_last_name') ?? '').trim();
      const dob = String(formData.get('child_dob') ?? '').trim();

      if (!firstName || !lastName) throw new Error('Enter the player’s name.');

      // One household per adult per league; create it on first registration
      // rather than making them fill in a separate "family" screen first.
      const { data: household } = await supabase
        .from('households')
        .upsert(
          { organization_id: org.id, primary_contact_id: userId },
          { onConflict: 'organization_id,primary_contact_id' },
        )
        .select('id')
        .single();

      if (!household) throw new Error('Couldn’t set up your family record.');

      const { data: dependent, error } = await supabase
        .from('dependents')
        .insert({
          household_id: household.id,
          organization_id: org.id,
          first_name: firstName,
          last_name: lastName,
          date_of_birth: dob || null,
        })
        .select('id')
        .single();

      if (error || !dependent) throw new Error('Couldn’t add that player.');
      dependentId = dependent.id;
    } else {
      if (!dependentChoice) throw new Error('Choose who you’re registering.');
      dependentId = dependentChoice;
    }
  }

  // --- price ---------------------------------------------------------------

  const tierId = String(formData.get('pricing_tier_id') ?? '');
  const tiers = await listAvailableTiers(programId);
  // Matched against what's actually available rather than taken on trust, so
  // a stale page or a edited form can't buy last month's early-bird price.
  const tier = tiers.find((t) => t.id === tierId) ?? (tiers.length === 1 ? tiers[0] : null);
  if (!tier) throw new Error('Choose an option.');

  let promo: PromoCode | null = null;
  const codeInput = String(formData.get('promo_code') ?? '').trim();
  if (codeInput) {
    const result = await _checkPromoCode(orgSlug, programId, codeInput);
    // A bad code at this point is an error, not a silent drop: they typed it
    // expecting it to work and must not be charged full price quietly.
    if ('problem' in result) throw new Error(result.problem);
    promo = result.promo;
  }

  const alreadyIn = await siblingsAlreadyIn(programId, org.id, userId);

  const quote = buildQuote({
    tier,
    childNumber: alreadyIn + 1,
    sibling: program.sibling,
    promo,
    feePolicy: program.feePolicy,
  });

  // --- answers -------------------------------------------------------------

  const questions = await listQuestions(programId);
  const answers: Record<string, string | string[]> = {};

  for (const q of questions) {
    const raw =
      q.fieldType === 'multi_select'
        ? formData.getAll(`q_${q.id}`).map(String)
        : String(formData.get(`q_${q.id}`) ?? '');

    const empty = Array.isArray(raw) ? raw.length === 0 : raw.trim() === '';
    if (q.required && empty && q.fieldType !== 'checkbox') {
      throw new Error(`${q.label} is required.`);
    }
    if (!empty) answers[q.id] = raw;
  }

  // --- claim the spot ------------------------------------------------------

  const { data: claim, error: claimError } = await supabase.rpc('claim_registration_spot', {
    p_program_id: programId,
    p_dependent_id: dependentId,
    p_registrant_id: dependentId ? null : userId,
    p_pricing_tier_id: tier.id,
    p_promo_code_id: promo?.id ?? null,
    p_amount_due_cents: quote.totalCents,
    p_net_cents: quote.leagueNetCents,
    p_fee_policy: program.feePolicy,
    p_child_number: alreadyIn + 1,
    p_quote_lines: quote.lines,
    p_answers: answers,
  });

  if (claimError) throw new Error(claimError.message || 'Couldn’t complete that registration.');

  const row = Array.isArray(claim) ? claim[0] : null;
  if (!row) throw new Error('Couldn’t complete that registration.');

  if (row.result === 'closed') throw new Error('Registration isn’t open for this program.');

  if (row.result === 'duplicate' || row.result === 'full') {
    redirect(`/l/${orgSlug}/register/${programId}/done?r=${row.registration_id}`);
  }

  // --- free, or pay --------------------------------------------------------

  if (quote.totalCents === 0) {
    // Nothing to charge, so confirm immediately rather than sending someone
    // to a checkout for zero dollars.
    await supabase
      .from('registrations')
      .update({ status: 'confirmed', amount_paid_cents: 0 })
      .eq('id', row.registration_id);

    revalidatePath(`/l/${orgSlug}`);
    redirect(`/l/${orgSlug}/register/${programId}/done?r=${row.registration_id}`);
  }

  if (!stripeConfigured()) throw new Error('This league can’t take payments yet.');

  const billing = await getOrgBilling(org.id);
  if (!billing?.stripeAccountId || !billing.chargesEnabled) {
    throw new Error('This league hasn’t finished setting up payments yet.');
  }

  const base = await origin();
  const playerLabel = dependentId ? 'Player registration' : program.title;

  const session = await stripe().checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: quote.totalCents,
            product_data: {
              name: program.title,
              description: playerLabel,
            },
          },
        },
      ],
      // The webhook reads this to confirm the right row.
      metadata: { registration_id: row.registration_id },
      // Carried onto the PaymentIntent too, so a Stripe-side investigation
      // starting from a charge can find the registration.
      payment_intent_data: { metadata: { registration_id: row.registration_id } },
      success_url: `${base}/l/${orgSlug}/register/${programId}/done?r=${row.registration_id}`,
      cancel_url: `${base}/l/${orgSlug}/register/${programId}`,
    },
    // On the league's own account. The money never touches ours, and we take
    // no application fee -- the league pays us a flat monthly price instead.
    { stripeAccount: billing.stripeAccountId },
  );

  if (!session.url) throw new Error('Couldn’t open checkout.');

  await supabase
    .from('registrations')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', row.registration_id);

  redirect(session.url);
}

export const checkPromoCode = safeAction(_checkPromoCode);
export const register = safeAction(_register);
