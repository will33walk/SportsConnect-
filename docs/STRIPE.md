# Stripe setup

Registration money goes to the league, not through us. Each organization is a
Stripe Connect account, and we take no percentage — the league pays a flat
monthly price instead. Everything below follows from that.

## Platform setup, once

1. Enable Connect in the Stripe dashboard. Choose the `controller` shape this
   code creates (see `src/lib/stripe.ts`): Stripe carries loss liability and
   each league gets its own Express dashboard, so a volunteer treasurer
   handles their own disputes and payouts without routing anything through us.
2. Create a webhook endpoint pointing at `/api/webhooks/stripe`, and **tick
   "Listen to events on connected accounts."** Registration checkouts happen
   on the league's account, so `checkout.session.completed` arrives as a
   connected-account event. Without that box, payments succeed and no
   registration is ever confirmed — the single most likely way to deploy this
   broken.
3. Subscribe to: `account.updated`, `checkout.session.completed`,
   `charge.refunded`.
4. Put the signing secret in `STRIPE_WEBHOOK_SECRET`. The route returns 500
   when it's unset rather than accepting unverified bodies.

## What confirms a registration

The webhook, not the browser coming back from checkout.

A registration row is created *before* checkout, in `pending`, holding its
spot. Stripe's event is what promotes it to `confirmed`. That ordering is
what makes all three of these behave:

- A parent who pays and closes the tab is still registered.
- A parent who reaches the success URL without paying is not.
- A parent who double-taps gets their existing row back, not a second charge.

Pending rows hold a spot for 30 minutes, then
`/api/cron/release-spots` frees them (scheduled in `vercel.json`, guarded by
`CRON_SECRET`).

Promo redemptions are counted when payment confirms, not when the code is
typed, so an abandoned checkout doesn't burn one of a limited run. The
webhook uses `Prefer: return=representation` to tell "I just confirmed this"
from "it was already confirmed", because Stripe retries and a replay must not
count twice.

## Who pays the card fee

Per program, `programs.fee_policy`:

- `league_absorbs` (default) — the sticker price is what the family pays, and
  Stripe's fee comes out of the league's side.
- `family_pays` — added at checkout as its own named line, and **grossed up**
  so the league receives the full sticker price. You cannot simply add the fee
  to the total; the fee applies to the larger amount too. `grossUpForFee()` in
  `src/lib/quote.ts` inverts it.

Either way the breakdown names the fee with its real number. "Fees may apply"
is the thing we are competing against.

## Testing

Use a test-mode connected account and Stripe's CLI to forward events:

```bash
stripe listen --forward-connect-to localhost:3000/api/webhooks/stripe
```

`--forward-connect-to`, not `--forward-to` — connect events are the ones that
matter here.
