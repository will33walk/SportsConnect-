// Lineup rules. Pure, so they're unit-testable -- see lineup.test.ts.
//
// The positions below are baseball's. When the second sport lands, this moves
// under src/lib/sports/<sport>/ alongside that sport's engine rather than
// growing into a union of every sport's positions.
//
// publicPlayerName() is the function here that matters beyond convenience:
// public pages show "Wyatt D." rather than a child's full name. Anything
// rendering a roster or a play-by-play to people outside the league goes
// through it.

export const LINEUP_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'EH', 'DH', 'BN'] as const;
export type LineupPosition = (typeof LINEUP_POSITIONS)[number];

export function isLineupPosition(value: string): value is LineupPosition {
  return (LINEUP_POSITIONS as readonly string[]).includes(value);
}

export interface LineupRow {
  teamMemberId: string;
  battingOrder: number | null;
  position: string | null;
}

// What gets published: only players in the batting order, in order. The
// snapshot is exactly this shape (snake_case, stored as jsonb).
export interface LineupSnapshotEntry {
  team_member_id: string;
  batting_order: number;
  position: string | null;
}

export function snapshotLineup(rows: LineupRow[]): LineupSnapshotEntry[] {
  return rows
    .filter((r): r is LineupRow & { battingOrder: number } => r.battingOrder != null)
    .sort((a, b) => a.battingOrder - b.battingOrder)
    .map((r) => ({ team_member_id: r.teamMemberId, batting_order: r.battingOrder, position: r.position }));
}

// Returns an error for the coach, or null when the lineup can be submitted.
// Leagues that keep stats (14U etc.) need a position for everyone batting and
// exactly one pitcher -- live tracking and pitching stats depend on it.
// T-ball (no stats) only needs a batting order.
export function validateLineupForSubmit(rows: LineupRow[], statsLeague: boolean): string | null {
  const batting = snapshotLineup(rows);
  if (batting.length === 0) return 'Put at least one player in the batting order first.';
  if (!statsLeague) return null;
  const missing = batting.filter((b) => !b.position).length;
  if (missing > 0) return `Give every batter a position (${missing} still ${missing === 1 ? 'needs' : 'need'} one).`;
  const pitchers = rows.filter((r) => r.position === 'P').length;
  if (pitchers !== 1) return pitchers === 0 ? 'Pick who is pitching (position P).' : 'Only one player can be the starting pitcher (P).';
  return null;
}

export type LineupStatus = 'none' | 'draft' | 'submitted' | 'changed';

// none: nothing set. draft: set but never submitted. submitted: public copy
// matches what's being edited. changed: submitted, then edited again -- the
// public page still shows the old one until the coach resubmits.
export function lineupStatus(rows: LineupRow[], published: LineupSnapshotEntry[] | null): LineupStatus {
  const current = snapshotLineup(rows);
  if (!published) return current.length === 0 ? 'none' : 'draft';
  const same =
    current.length === published.length &&
    current.every((c, i) => c.team_member_id === published[i].team_member_id && c.batting_order === published[i].batting_order && (c.position ?? null) === (published[i].position ?? null));
  return same ? 'submitted' : 'changed';
}

export const LINEUP_STATUS_LABEL: Record<LineupStatus, string> = {
  none: 'Lineup not set',
  draft: 'Draft · not submitted',
  submitted: 'Lineup submitted',
  changed: 'Changes not submitted',
};

// Kids' names on public pages: first name + last initial, never the full
// name ("Johnny W.").
export function publicPlayerName(firstName: string, lastName: string | null | undefined): string {
  const initial = lastName?.trim()?.[0];
  return initial ? `${firstName.trim()} ${initial.toUpperCase()}.` : firstName.trim();
}
