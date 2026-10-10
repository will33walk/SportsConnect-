import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

/**
 * A league as anyone may see it. No billing fields: `anon` has the SELECT
 * grant on those columns revoked (0005_public_read.sql), so asking for them
 * on a public page would fail the query outright rather than leak them.
 */
export interface Org {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  logoUrl: string | null;
  brandPrimary: string | null;
  brandAccent: string | null;
}

/** Billing state. Admin-only, in its own table. */
export interface OrgBilling {
  stripeAccountId: string | null;
  chargesEnabled: boolean;
  subscriptionStatus: string;
  plan: 'league' | 'unlimited';
}

/**
 * One league by its address. Null when it doesn't exist OR when the caller
 * can't see it -- the same answer on purpose, so nobody can enumerate which
 * league addresses are taken.
 *
 * `cache` dedupes within a render: the layout needs this for theming and the
 * page needs it for content, and that should be one query.
 */
export const getOrgBySlug = cache(async (slug: string): Promise<Org | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('organizations')
    .select('id, slug, name, timezone, logo_url, brand_primary, brand_accent')
    .eq('slug', slug)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    timezone: data.timezone,
    logoUrl: data.logo_url,
    brandPrimary: data.brand_primary,
    brandAccent: data.brand_accent,
  };
});

/**
 * Billing state for a league. Lives in its own admin-only table, so a
 * non-admin gets null here rather than a value they shouldn't have -- the
 * separation is structural, not a matter of remembering which columns to
 * leave out of a select.
 */
export const getOrgBilling = cache(async (orgId: string): Promise<OrgBilling | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('organization_billing')
    .select('stripe_account_id, charges_enabled, subscription_status, plan')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!data) return null;
  return {
    stripeAccountId: data.stripe_account_id,
    chargesEnabled: data.charges_enabled,
    subscriptionStatus: data.subscription_status,
    plan: data.plan,
  };
});

/**
 * The org's plan, readable by any member rather than only an admin.
 *
 * A league manager needs to know whether divisions are available to them, and
 * `organization_billing` is admin-only on purpose. This goes through the
 * security-definer function, which returns the plan and nothing else about
 * the league's money.
 */
export async function getOrgPlan(orgId: string): Promise<'league' | 'unlimited'> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('org_plan_of', { org: orgId });
  return data === 'unlimited' ? 'unlimited' : 'league';
}

/** How many seasons currently count against a League plan's one-at-a-time. */
export async function getActiveSeasonCount(orgId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('active_season_count', { org: orgId });
  return typeof data === 'number' ? data : 0;
}
