import Stripe from 'stripe';

// Stripe Connect, not a single merchant account.
//
// The system this code came from used Square with one SQUARE_ACCESS_TOKEN and
// one SQUARE_LOCATION_ID in the environment -- correct for a city collecting
// its own money, impossible for a platform collecting on behalf of many
// leagues. Here every organization is a connected account, and registration
// money lands in the league's own balance and pays out to the league's own
// bank. We are never the merchant of record for a parent's registration fee.
//
// That also means we never hold their money, which matters for a product
// selling to volunteer boards: the most common objection to league software
// is "where does our money sit and when do we get it," and the honest answer
// here is "your Stripe account, on your payout schedule."

let client: Stripe | null = null;

/**
 * The platform's own Stripe client. Throws rather than returning a dud if the
 * key is missing: a payment path that silently no-ops when misconfigured is
 * worse than one that refuses to start.
 */
export function stripe(): Stripe {
  if (client) return client;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set.');

  client = new Stripe(key, {
    // Pinned. An unpinned version means Stripe can change response shapes
    // under a deployment that hasn't been touched in months.
    apiVersion: '2025-09-30.clover',
    appInfo: { name: 'SportsConnect' },
  });
  return client;
}

export const stripeConfigured = (): boolean => Boolean(process.env.STRIPE_SECRET_KEY);

/**
 * What a league can currently do. `chargesEnabled` is the only one that
 * matters for taking registrations -- an account can exist, and look
 * connected, while Stripe is still waiting on identity documents.
 */
export interface ConnectStatus {
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  /** Stripe is waiting on these. Shown to the league verbatim is useless, so
   *  callers summarise; the count is what drives the nudge. */
  requirementsDue: string[];
}

export async function connectStatus(accountId: string): Promise<ConnectStatus | null> {
  try {
    const account = await stripe().accounts.retrieve(accountId);
    return {
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requirementsDue: [
        ...(account.requirements?.currently_due ?? []),
        ...(account.requirements?.past_due ?? []),
      ],
    };
  } catch {
    // A deleted or rejected account 404s here. Treating that as "not
    // connected" lets the league start over instead of staring at an error.
    return null;
  }
}

/**
 * Create the league's connected account. `controller` rather than the legacy
 * `type: 'express'`: Stripe handles the dashboard and takes on loss liability,
 * and the league deals with Stripe directly for disputes -- which is what we
 * want, because a volunteer treasurer should not be routing a chargeback
 * through us.
 */
export async function createConnectedAccount(params: {
  orgName: string;
  orgSlug: string;
  email?: string;
}): Promise<string> {
  const account = await stripe().accounts.create({
    controller: {
      losses: { payments: 'stripe' },
      fees: { payer: 'account' },
      stripe_dashboard: { type: 'express' },
    },
    business_profile: {
      name: params.orgName,
      product_description: 'Youth sports league registration',
    },
    email: params.email,
    metadata: { org_slug: params.orgSlug },
  });
  return account.id;
}

/** A one-time link into Stripe's hosted onboarding. These expire in minutes. */
export async function onboardingLink(
  accountId: string,
  returnTo: string,
): Promise<string> {
  const link = await stripe().accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    refresh_url: returnTo,
    return_url: returnTo,
  });
  return link.url;
}

/** A link into the league's own Stripe dashboard, once onboarding is done. */
export async function dashboardLink(accountId: string): Promise<string> {
  const link = await stripe().accounts.createLoginLink(accountId);
  return link.url;
}
