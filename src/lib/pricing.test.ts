import { describe, it, expect } from 'vitest';
import { computeTierAvailability } from './pricing';

const NOW = new Date('2026-06-15T12:00:00Z');

describe('computeTierAvailability', () => {
  it('is always available with unlimited spots when neither a window nor a cap is set', () => {
    expect(computeTierAvailability(NOW, null, null, null, 0)).toEqual({ available: true, spotsRemaining: null });
  });

  it('is unavailable before its valid_from date', () => {
    const result = computeTierAvailability(NOW, '2026-07-01T00:00:00Z', null, null, 0);
    expect(result).toEqual({ available: false, spotsRemaining: null });
  });

  it('is available on and after its valid_from date', () => {
    const result = computeTierAvailability(NOW, '2026-06-15T12:00:00Z', null, null, 0);
    expect(result.available).toBe(true);
  });

  it('is unavailable after its valid_until date ("early bird" that has ended)', () => {
    const result = computeTierAvailability(NOW, null, '2026-06-01T00:00:00Z', null, 0);
    expect(result).toEqual({ available: false, spotsRemaining: null });
  });

  it('is available up to and including its valid_until date', () => {
    const result = computeTierAvailability(NOW, null, '2026-06-15T12:00:00Z', null, 0);
    expect(result.available).toBe(true);
  });

  it('is available inside a valid_from..valid_until window', () => {
    const result = computeTierAvailability(NOW, '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z', null, 0);
    expect(result.available).toBe(true);
  });

  it('is unavailable once max_registrants is reached ("first 20 registrants" that is full)', () => {
    const result = computeTierAvailability(NOW, null, null, 20, 20);
    expect(result).toEqual({ available: false, spotsRemaining: 0 });
  });

  it('is unavailable if usage somehow exceeds the cap, clamping spotsRemaining at 0 rather than negative', () => {
    const result = computeTierAvailability(NOW, null, null, 20, 25);
    expect(result).toEqual({ available: false, spotsRemaining: 0 });
  });

  it('reports the correct remaining count while under a capacity cap', () => {
    const result = computeTierAvailability(NOW, null, null, 20, 15);
    expect(result).toEqual({ available: true, spotsRemaining: 5 });
  });

  it('is unavailable when a date window has passed even if capacity would otherwise allow it', () => {
    // A "last chance" tier: capacity is wide open but the window already closed.
    const result = computeTierAvailability(NOW, null, '2026-06-01T00:00:00Z', 100, 1);
    expect(result.available).toBe(false);
  });

  it('combines a date window and a capacity cap correctly ("$40 until July 1 or the first 60, whichever comes first")', () => {
    const withinWindowUnderCap = computeTierAvailability(NOW, null, '2026-07-01T00:00:00Z', 60, 59);
    expect(withinWindowUnderCap).toEqual({ available: true, spotsRemaining: 1 });

    const withinWindowAtCap = computeTierAvailability(NOW, null, '2026-07-01T00:00:00Z', 60, 60);
    expect(withinWindowAtCap.available).toBe(false);
  });
});
