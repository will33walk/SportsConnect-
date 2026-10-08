// Wall-clock time in a league's zone -> a UTC instant.
//
// Games are scheduled the way people talk about them: "Tuesdays at six."
// That is a wall-clock time at the field, and it stays six o'clock when the
// clocks change halfway through the season. Storing it correctly means
// resolving it against the league's own zone, not the server's and not the
// browser's.
//
// Done with Intl rather than a date library: one function doesn't justify a
// dependency, and the two-pass correction below handles the only case naive
// arithmetic gets wrong -- a time within a few hours of a daylight-saving
// change, where the offset at the guessed instant differs from the offset at
// the real one.

/** The zone's UTC offset, in milliseconds, at a given instant. */
function offsetAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - instant.getTime();
}

/**
 * @param localStart "YYYY-MM-DDTHH:MM" — wall clock, no zone suffix.
 * @param timeZone   an IANA zone, e.g. "America/Indiana/Indianapolis".
 * @returns an ISO instant in UTC.
 *
 * During the hour that repeats when clocks go back, a wall-clock time is
 * genuinely ambiguous; this resolves to the first occurrence, which is the
 * convention most scheduling software follows. Nothing in a rec league gets
 * played at 1:30am, so the choice is academic -- but silently picking one is
 * better than pretending there is no question.
 */
export function zonedToUtc(localStart: string, timeZone: string): string {
  const naive = new Date(`${localStart}:00Z`);
  if (Number.isNaN(naive.getTime())) {
    throw new Error(`Not a local date-time: ${localStart}`);
  }

  const firstGuess = new Date(naive.getTime() - offsetAt(naive, timeZone));
  return new Date(naive.getTime() - offsetAt(firstGuess, timeZone)).toISOString();
}
