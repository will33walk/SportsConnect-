// Youth sports play-ups (Will, 2026-10-04). Families register in the
// player's correct age group, pay that league's fee, and tick a box saying
// they're interested in playing up ONE age group. A director decides after
// evaluation day and the family is told in-app and by email. If the league
// has a play-up fee they're invoiced for it, and the player moves to the
// higher league once it's paid (straight away when there's no fee). No
// play-downs.

export type PlayUpStatus = 'requested' | 'approved' | 'denied';

// The standard rules list. A league can replace it with its own wording
// (programs.play_up_rules, one rule per line).
export const PLAY_UP_RULES = [
  'Sign up and pay for your player’s own age group first.',
  'Every player who wants to play up is evaluated at evaluation day.',
  'No play-up is approved without the league director’s or recreation director’s approval.',
  'If there is a play-up fee, your player moves up once it’s paid.',
  'Players can play up one age group only, and can’t play down.',
];

// A league's own rules (one per line) or the standard list.
export function playUpRulesFor(custom: string | null | undefined): string[] {
  const lines = (custom ?? '').split(/\r?\n/).map((l) => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
  return lines.length > 0 ? lines : PLAY_UP_RULES;
}

export const PLAY_UP_STATUS_LABEL: Record<PlayUpStatus, string> = {
  requested: 'Play-up requested · waiting for evaluation',
  approved: 'Play-up approved',
  denied: 'Play-up not approved',
};

export function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

// Push + inbox text for the family once a director decides.
export function playUpDecisionNotice(input: {
  approved: boolean;
  playerName: string;
  leagueTitle: string;
  targetTitle: string | null;
  feeDueCents: number;
  note: string | null;
}): { title: string; body: string; url: string } {
  const note = input.note?.trim() ? ` ${input.note.trim()}` : '';
  if (!input.approved) {
    return { title: `Play-up not approved for ${input.playerName}`, body: `${input.playerName} stays in ${input.leagueTitle}.${note}`, url: '/me/registrations' };
  }
  const where = input.targetTitle ? ` to ${input.targetTitle}` : '';
  const body =
    input.feeDueCents > 0
      ? `${input.playerName} is approved to play up${where}. The play-up fee is ${dollars(input.feeDueCents)}; an invoice is on its way to your email, and ${input.playerName} moves up once it’s paid.`
      : `${input.playerName} is approved to play up${where}. There is no extra fee.`;
  return {
    title: `Play-up approved for ${input.playerName}`,
    body: `${body}${note}`,
    url: '/me/registrations',
  };
}

// Report: how many families asked to play up, by the league they signed up
// for, and what happened.
export interface PlayUpSummaryRow {
  leagueId: string;
  league: string;
  requested: number; // still waiting
  approved: number;
  denied: number;
  total: number;
  differenceBilledCents: number;
  differencePaidCents: number;
}

export function summarizePlayUps(
  requests: { fromProgramId: string; fromTitle: string; status: PlayUpStatus; feeDueCents: number | null; paidAt: string | null }[],
): PlayUpSummaryRow[] {
  const byLeague = new Map<string, PlayUpSummaryRow>();
  for (const r of requests) {
    const row = byLeague.get(r.fromProgramId) ?? { leagueId: r.fromProgramId, league: r.fromTitle, requested: 0, approved: 0, denied: 0, total: 0, differenceBilledCents: 0, differencePaidCents: 0 };
    row[r.status] += 1;
    row.total += 1;
    if (r.status === 'approved' && r.feeDueCents) {
      row.differenceBilledCents += r.feeDueCents;
      if (r.paidAt) row.differencePaidCents += r.feeDueCents;
    }
    byLeague.set(r.fromProgramId, row);
  }
  return [...byLeague.values()].sort((a, b) => a.league.localeCompare(b.league));
}
