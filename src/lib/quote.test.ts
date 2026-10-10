import { describe, expect, it } from 'vitest';
import {
  buildQuote,
  grossUpForFee,
  money,
  processingFee,
  promoProblem,
  type QuoteInput,
} from './quote';

const tier = { id: 't1', label: 'Full season', amountCents: 9000 }; // $90

const base: QuoteInput = {
  tier,
  childNumber: 1,
  sibling: null,
  promo: null,
  feePolicy: 'league_absorbs',
};

const total = (i: Partial<QuoteInput>) => buildQuote({ ...base, ...i }).totalCents;

describe('processingFee', () => {
  it('is Stripe’s published US card rate', () => {
    // 2.9% + 30c
    expect(processingFee(10000)).toBe(320);
    expect(processingFee(9000)).toBe(291);
  });

  it('is zero on a free registration', () => {
    expect(processingFee(0)).toBe(0);
    expect(processingFee(-500)).toBe(0);
  });
});

describe('grossUpForFee', () => {
  it('produces a charge that nets the target after the fee', () => {
    for (const target of [500, 2500, 9000, 12345, 50000]) {
      const gross = grossUpForFee(target);
      expect(gross - processingFee(gross)).toBeGreaterThanOrEqual(target);
      // And never overshoots by more than a cent of rounding.
      expect(gross - processingFee(gross)).toBeLessThanOrEqual(target + 2);
    }
  });
});

describe('buildQuote', () => {
  it('charges the tier price when there is nothing else going on', () => {
    expect(total({})).toBe(9000);
  });

  it('never charges a platform cut', () => {
    const q = buildQuote({ ...base, promo: { id: 'p', code: 'X', discountType: 'percent', discountValue: 10 } });
    expect(q.platformFeeCents).toBe(0);
  });

  it('applies the sibling discount without a code, from the second child on', () => {
    const sibling = { enabled: true, type: 'percent' as const, rate: 50 };
    expect(total({ sibling, childNumber: 1 })).toBe(9000);
    expect(total({ sibling, childNumber: 2 })).toBe(4500);
    expect(total({ sibling, childNumber: 3 })).toBe(4500);
  });

  it('says in the line that the family discount applied itself', () => {
    const q = buildQuote({
      ...base,
      childNumber: 2,
      sibling: { enabled: true, type: 'percent', rate: 25 },
    });
    const line = q.lines.find((l) => l.label.startsWith('Family discount'));
    expect(line?.note).toMatch(/don’t need a code/);
  });

  it('honours a flat sibling discount', () => {
    expect(total({ sibling: { enabled: true, type: 'flat', rate: 2000 }, childNumber: 2 })).toBe(7000);
  });

  it('stacks sibling then promo against the running subtotal, not the base', () => {
    // 50% sibling takes $90 to $45; then 50% promo takes it to $22.50 --
    // not to zero, which is what two independent 50%s off the base would do.
    const q = buildQuote({
      ...base,
      childNumber: 2,
      sibling: { enabled: true, type: 'percent', rate: 50 },
      promo: { id: 'p', code: 'half', discountType: 'percent', discountValue: 50 },
    });
    expect(q.totalCents).toBe(2250);
  });

  it('never discounts below zero, however generous the codes are', () => {
    const q = buildQuote({
      ...base,
      childNumber: 2,
      sibling: { enabled: true, type: 'flat', rate: 20000 },
      promo: { id: 'p', code: 'free', discountType: 'flat', discountValue: 50000 },
    });
    expect(q.totalCents).toBe(0);
    expect(q.leagueNetCents).toBe(0);
    expect(q.processingFeeCents).toBe(0);
  });

  it('takes 100% off to exactly free', () => {
    expect(total({ promo: { id: 'p', code: 'comp', discountType: 'percent', discountValue: 100 } })).toBe(0);
  });

  it('leaves the league short by the fee when the league absorbs it', () => {
    const q = buildQuote({ ...base, feePolicy: 'league_absorbs' });
    expect(q.totalCents).toBe(9000);
    expect(q.leagueNetCents).toBe(9000 - processingFee(9000));
  });

  it('nets the league the full price when the family covers the fee', () => {
    const q = buildQuote({ ...base, feePolicy: 'family_pays' });
    expect(q.totalCents).toBeGreaterThan(9000);
    expect(q.leagueNetCents).toBeGreaterThanOrEqual(9000);
    const feeLine = q.lines.find((l) => l.label === 'Card processing');
    expect(feeLine?.note).toMatch(/not to the league/);
  });

  it('adds no fee line to a free registration', () => {
    const q = buildQuote({
      ...base,
      feePolicy: 'family_pays',
      promo: { id: 'p', code: 'comp', discountType: 'percent', discountValue: 100 },
    });
    expect(q.totalCents).toBe(0);
    expect(q.lines.some((l) => l.label === 'Card processing')).toBe(false);
  });

  it('lines always sum to the total', () => {
    const cases: Partial<QuoteInput>[] = [
      {},
      { childNumber: 2, sibling: { enabled: true, type: 'percent', rate: 30 } },
      { promo: { id: 'p', code: 'x', discountType: 'flat', discountValue: 1500 } },
      { feePolicy: 'family_pays' },
      {
        childNumber: 2,
        sibling: { enabled: true, type: 'percent', rate: 20 },
        promo: { id: 'p', code: 'y', discountType: 'percent', discountValue: 10 },
        feePolicy: 'family_pays',
      },
    ];

    for (const c of cases) {
      const q = buildQuote({ ...base, ...c });
      const summed = q.lines.reduce((n, l) => n + l.amountCents, 0);
      expect(summed).toBe(q.totalCents);
    }
  });

  it('ignores a disabled sibling rule', () => {
    expect(total({ sibling: { enabled: false, type: 'percent', rate: 50 }, childNumber: 3 })).toBe(9000);
  });
});

describe('promoProblem', () => {
  const now = new Date('2027-04-01T12:00:00Z');
  const ok = {
    isActive: true,
    startsAt: null,
    expiresAt: null,
    maxRedemptions: null,
    redeemedCount: 0,
    programId: null,
  };

  it('accepts a usable code', () => {
    expect(promoProblem(ok, 'prog1', now)).toBeNull();
  });

  it('rejects an unknown code without hinting that others exist', () => {
    expect(promoProblem(null, 'prog1', now)).toMatch(/isn’t recognised/);
  });

  it('rejects inactive, unstarted, expired and exhausted codes', () => {
    expect(promoProblem({ ...ok, isActive: false }, 'prog1', now)).toBeTruthy();
    expect(promoProblem({ ...ok, startsAt: '2027-05-01T00:00:00Z' }, 'prog1', now)).toMatch(/yet/);
    expect(promoProblem({ ...ok, expiresAt: '2027-03-01T00:00:00Z' }, 'prog1', now)).toMatch(/expired/);
    expect(
      promoProblem({ ...ok, maxRedemptions: 10, redeemedCount: 10 }, 'prog1', now),
    ).toMatch(/fully used/);
  });

  it('rejects a code scoped to another program', () => {
    expect(promoProblem({ ...ok, programId: 'other' }, 'prog1', now)).toMatch(/different program/);
  });

  it('accepts a code scoped to this program', () => {
    expect(promoProblem({ ...ok, programId: 'prog1' }, 'prog1', now)).toBeNull();
  });

  it('allows the last redemption', () => {
    expect(promoProblem({ ...ok, maxRedemptions: 10, redeemedCount: 9 }, 'prog1', now)).toBeNull();
  });
});

describe('money', () => {
  it('formats cents as dollars', () => {
    expect(money(9000)).toBe('$90.00');
    expect(money(0)).toBe('$0.00');
    expect(money(-4500)).toBe('-$45.00');
    expect(money(291)).toBe('$2.91');
  });
});
