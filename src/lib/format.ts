// Legacy-imported bookings store only a date, not a real time of day --
// start_at lands on midnight UTC as a placeholder. Rendered through a
// non-UTC local timezone that shifts the calendar day back (the classic
// "stored as UTC midnight, displayed a day early" bug) and, if a clock time
// were shown, fabricates a time nothing actually confirms. So date parts
// always read in UTC, and a time is only shown when start_at actually has
// one (anything other than that midnight placeholder).

const CENTRAL_TIME_ZONE = "America/Chicago";
const DATE_ONLY_TIME_ZONE = "UTC";

function hasRealTime(d: Date): boolean {
  return d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
}

export function formatDayBadge(iso: string): { day: string; month: string } {
  const d = new Date(iso);
  // A real time is read in Central (a 7 PM CT start is already the next
  // day in UTC); a date-only placeholder stays in UTC.
  const timeZone = hasRealTime(d) ? CENTRAL_TIME_ZONE : DATE_ONLY_TIME_ZONE;
  return {
    day: d.toLocaleDateString("en-US", { day: "numeric", timeZone }),
    month: d.toLocaleDateString("en-US", { month: "short", timeZone }).toUpperCase(),
  };
}

export function formatEventDateTime(iso: string): string {
  const d = new Date(iso);
  if (!hasRealTime(d)) {
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: DATE_ONLY_TIME_ZONE });
  }
  const date = d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: CENTRAL_TIME_ZONE });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: CENTRAL_TIME_ZONE });
  return `${date} · ${time} CT`;
}

export function formatTime(iso: string): string | null {
  const d = new Date(iso);
  if (!hasRealTime(d)) return null;
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: CENTRAL_TIME_ZONE });
  return `${time} CT`;
}

export function formatLongDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
