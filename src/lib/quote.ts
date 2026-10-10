// What a family actually pays, and what the league actually keeps.
//
// This is the most consequential screen in the product. A volunteer board
// switches league software because the last one was expensive and confusing,
// so the quote a parent sees has to be complete, in order, and arithmetically
// obvious -- and the number the league nets has to be stated rather than
// discovered on a statement six weeks later.
//
// Three commitments encoded here, which are the whole pitch:
//
//   1. NO PLATFORM CUT. We charge the league a flat monthly price. We do not
//      take a percentage of a registration. `platformFeeCents` is always 0;
//      it exists as a line so the breakdown can say so out loud rather than
//      leave a parent wondering.
//
//   2. DISCOUNTS APPLY THEMSELVES. A sibling discount a family qualifies for
//      is applied without anyone asking for it. Making a parent email the
//      registrar to claim a discount the system already knows about is a way
//      of keeping money that isn't ours.
//
//   3. THE CARD FEE IS NAMED. Stripe's processing fee is real and someone
//      pays it. Whoever that is, the breakdown says so, with the actual
//      numbers -- not "fees may apply".
//
// Pure and synchronous: every input is passed in, nothing is fetched. The
// same function runs on the server to compute what to charge and in the
// browser to show the parent the total updating as they tick boxes, which is
// the only way those two can be guaranteed to agree.

/** Who absorbs Stripe's processing fee. The league chooses, per program. */
export type FeePolicy = 'league_absorbs' | 'family_pays';

export interface Tier {
  id: string;
  label: string;
  amountCents: number;
}

export interface SiblingRule {
  enabled: boolean;
  type: 'percent' | 'flat';
  /** Percent as 0-100, or an amount in cents when type is 'flat'. */
  rate: number;
}

export interface PromoCode {
  id: string;
  code: string;
  discountType: 'percent' | 'flat';
  /** Percent as 0-100, or an amount in cents when type is 'flat'. */
  discountValue: number;
}

export interface QuoteInput {
  tier: Tier;
  /**
   * How many children from this household are already being registered for
   * this program in this sitting, INCLUDING this one. 1 means no sibling
   * discount; 2 means this is the second child and the discount applies.
   */
  childNumber: number;
  sibling: SiblingRule | null;
  promo: PromoCode | null;
  feePolicy: FeePolicy;
}

export interface QuoteLine {
  /** A short label a parent reads, not a system term. */
  label: string;
  /** Signed: negative for a discount. */
  amountCents: number;
  /** Set when the line deserves a word of explanation under it. */
  note?: string;
}

export interface Quote {
  lines: QuoteLine[];
  /** What the family is charged. Never negative. */
  totalCents: number;
  /** Stripe's cut of that charge. Informational, never added twice. */
  processingFeeCents: number;
  /** What lands in the league's account. */
  leagueNetCents: number;
  /** Always 0. See commitment 1 above. */
  platformFeeCents: number;
}

// Stripe's US card pricing. Named constants rather than magic numbers so
// there's one place to change if it ever moves, and so the test can assert
// against the real published rate.
const STRIPE_PERCENT = 2.9;
const STRIPE_FIXED_CENTS = 30;

/** Stripe's fee on a charge of this size. Zero on a zero charge. */
export function processingFee(amountCents: number): number {
  if (amountCents <= 0) return 0;
  return Math.round((amountCents * STRIPE_PERCENT) / 100) + STRIPE_FIXED_CENTS;
}

/**
 * The charge that nets `target` after Stripe takes its cut.
 *
 * Used when the league passes the fee to the family: you cannot just add the
 * fee to the total, because the fee is charged on the larger amount too. This
 * inverts it, so the league receives exactly the sticker price.
 */
export function grossUpForFee(targetCents: number): number {
  if (targetCents <= 0) return 0;
  return Math.ceil((targetCents + STRIPE_FIXED_CENTS) / (1 - STRIPE_PERCENT / 100));
}

function applyDiscount(
  baseCents: number,
  type: 'percent' | 'flat',
  value: number,
): number {
  const raw = type === 'percent' ? Math.round((baseCents * value) / 100) : Math.round(value);
  // Never discount more than the thing costs, and never into negative money.
  return Math.min(Math.max(raw, 0), baseCents);
}

/**
 * Build the quote.
 *
 * Order of operations, which matters and is deliberate: the sibling discount
 * comes off first, then the promo code applies to what's left. Both are taken
 * against the running subtotal rather than independently against the base, so
 * two 50% discounts make something 75% off rather than free. That is the
 * convention that doesn't let a league accidentally give away a season, and
 * it is the one every parent's intuition agrees with when they see the lines
 * stacked up.
 */
export function buildQuote(input: QuoteInput): Quote {
  const { tier, childNumber, sibling, promo, feePolicy } = input;

  const lines: QuoteLine[] = [
    { label: tier.label, amountCents: tier.amountCents },
  ];

  let subtotal = tier.amountCents;

  // Sibling discount, applied without being asked for.
  if (sibling?.enabled && childNumber > 1 && subtotal > 0) {
    const off = applyDiscount(subtotal, sibling.type, sibling.rate);
    if (off > 0) {
      lines.push({
        label:
          sibling.type === 'percent'
            ? `Family discount (${trimNumber(sibling.rate)}% off)`
            : 'Family discount',
        amountCents: -off,
        note: 'Applied automatically — you don’t need a code.',
      });
      subtotal -= off;
    }
  }

  if (promo && subtotal > 0) {
    const off = applyDiscount(subtotal, promo.discountType, promo.discountValue);
    if (off > 0) {
      lines.push({ label: `Code ${promo.code.toUpperCase()}`, amountCents: -off });
      subtotal -= off;
    }
  }

  // The card fee. Either the league eats it out of the sticker price, or the
  // family covers it on top -- and if they cover it, the charge is grossed up
  // so the league receives the full sticker price rather than sticker minus
  // the fee on the fee.
  let total = subtotal;
  if (feePolicy === 'family_pays' && subtotal > 0) {
    const gross = grossUpForFee(subtotal);
    const added = gross - subtotal;
    lines.push({
      label: 'Card processing',
      amountCents: added,
      note: 'Goes to the card processor, not to the league.',
    });
    total = gross;
  }

  const fee = processingFee(total);

  return {
    lines,
    totalCents: Math.max(0, total),
    processingFeeCents: fee,
    // When the family covers the fee the league nets the subtotal exactly;
    // otherwise the fee comes out of what the league receives.
    leagueNetCents: Math.max(0, total - fee),
    platformFeeCents: 0,
  };
}

/** Trims a trailing ".0" so 50 shows as "50" and 12.5 stays "12.5". */
function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/** Cents to "$45.00". The only place money becomes a string. */
export function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

/**
 * Validate a promo code against its own rules.
 *
 * Returns null when it applies, or a message for the parent. Separate from
 * buildQuote because a code can be real but not usable -- expired, used up,
 * or for a different program -- and that needs saying rather than silently
 * producing a quote with no discount on it.
 */
export function promoProblem(
  promo: {
    isActive: boolean;
    startsAt: string | null;
    expiresAt: string | null;
    maxRedemptions: number | null;
    redeemedCount: number;
    programId: string | null;
  } | null,
  programId: string,
  now: Date,
): string | null {
  if (!promo) return 'That code isn’t recognised.';
  if (!promo.isActive) return 'That code is no longer active.';
  if (promo.programId && promo.programId !== programId) {
    return 'That code is for a different program.';
  }
  if (promo.startsAt && new Date(promo.startsAt) > now) return 'That code isn’t active yet.';
  if (promo.expiresAt && new Date(promo.expiresAt) < now) return 'That code has expired.';
  if (promo.maxRedemptions !== null && promo.redeemedCount >= promo.maxRedemptions) {
    return 'That code has been fully used.';
  }
  return null;
}
