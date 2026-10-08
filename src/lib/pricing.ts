// Whether an early-bird or last-chance pricing tier is currently available.
//
// Pure and synchronous on purpose: the date-window and capacity rule is the
// part worth testing, and keeping it out of the registration query means it
// can be tested without a database.
//
// A tier outside its own availability window, or already at its own cap, is
// unavailable -- and callers filter it out of what a parent sees entirely
// rather than showing it greyed out. Showing someone a price they cannot have
// is worse than not showing it at all.

export interface TierAvailability {
  available: boolean;
  spotsRemaining: number | null;
}

export function computeTierAvailability(
  now: Date,
  validFrom: string | null,
  validUntil: string | null,
  maxRegistrants: number | null,
  usedCount: number
): TierAvailability {
  const withinWindow = (!validFrom || new Date(validFrom) <= now) && (!validUntil || new Date(validUntil) >= now);
  if (!withinWindow) return { available: false, spotsRemaining: null };
  if (maxRegistrants == null) return { available: true, spotsRemaining: null };
  const spotsRemaining = Math.max(0, maxRegistrants - usedCount);
  return { available: spotsRemaining > 0, spotsRemaining };
}
