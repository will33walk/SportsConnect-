import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { adminFetch } from '@/lib/supabase/admin-fetch';

// Stripe's own events, verified by signature.
//
// This runs with the service role and no user session, so the signature check
// IS the authentication. An unsigned or badly signed request is rejected
// before anything is read out of the body.

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  // Fail closed. A webhook route that accepts unverified bodies because the
  // secret happens to be unset is a way to write arbitrary rows into the
  // database from the open internet.
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set');
    return new NextResponse('Not configured', { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return new NextResponse('Missing signature', { status: 400 });

  // The raw body, not the parsed one: signature verification is over the
  // exact bytes Stripe sent.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(payload, signature, secret);
  } catch {
    return new NextResponse('Invalid signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        await syncAccount(account);
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await confirmRegistration(session);
        break;
      }

      default:
        // Everything else is acknowledged and ignored. Returning a non-2xx
        // for an event we simply don't handle makes Stripe retry it for days.
        break;
    }
  } catch (err) {
    // A 500 tells Stripe to retry, which is what we want for a transient
    // failure. Handlers below are written to be safe to run twice.
    console.error('[stripe-webhook] handler failed', event.type, err);
    return new NextResponse('Handler failed', { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Mirror the one fact about a connected account we act on.
 *
 * `charges_enabled` is the difference between a league that can open
 * registration and one that can't, and it needs to be readable on a page load
 * without calling Stripe. Everything else about the account stays Stripe's;
 * copying it here would only go stale.
 */
async function syncAccount(account: Stripe.Account) {
  await adminFetch(
    `/rest/v1/organization_billing?stripe_account_id=eq.${encodeURIComponent(account.id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        charges_enabled: account.charges_enabled,
        updated_at: new Date().toISOString(),
      }),
    },
  );
}

/**
 * Mark a registration paid once Stripe says the money arrived.
 *
 * This, and not the browser returning from checkout, is what confirms a
 * registration: a parent closing the tab before the redirect must still end
 * up registered, and a parent who reaches the success page without paying
 * must not.
 *
 * Idempotent by filter: it only moves rows still in `pending`, so Stripe
 * replaying this event doesn't double-count anything.
 */
async function confirmRegistration(session: Stripe.Checkout.Session) {
  const registrationId = session.metadata?.registration_id;
  if (!registrationId) return;
  if (session.payment_status !== 'paid') return;

  await adminFetch(
    `/rest/v1/registrations?id=eq.${encodeURIComponent(registrationId)}&status=eq.pending`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'confirmed',
        amount_paid_cents: session.amount_total ?? 0,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id:
          typeof session.payment_intent === 'string' ? session.payment_intent : null,
      }),
    },
  );
}
