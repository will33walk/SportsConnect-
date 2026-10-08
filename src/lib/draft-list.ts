// Draft lists (Will, 2026-10-04): each team's coaches order the players the
// way they'd draft them, saved (hearted) players on top. Pure and tested;
// the list page uses it now and the live draft's auto-pick will use
// nextAutoPick.

export interface DraftPlayer {
  registrationId: string;
  name: string;
  age: number | null;
  // Average of this team's coaches' overall scores; null = not scored.
  overall: number | null;
  // Hearted by any coach on this team.
  hearted: boolean;
  // The team that already drafted them, if any.
  draftedBy: string | null;
}

// Hearted first, then by the team's average score, unscored last, names as
// the tie-break -- the order players are suggested in.
export function rankForDraft<T extends Pick<DraftPlayer, 'name' | 'overall' | 'hearted'>>(players: T[]): T[] {
  return [...players].sort((a, b) => Number(b.hearted) - Number(a.hearted) || (b.overall ?? -1) - (a.overall ?? -1) || a.name.localeCompare(b.name));
}

// A starting list: the team's hearted players, best first.
export function starterList(players: DraftPlayer[]): string[] {
  return rankForDraft(players.filter((p) => p.hearted && !p.draftedBy)).map((p) => p.registrationId);
}

// Keeps a saved list honest against the current pool: drops players who
// left the league, removes duplicates, keeps the coaches' order.
export function cleanList(order: string[], poolIds: Set<string>): string[] {
  const seen = new Set<string>();
  return order.filter((id) => poolIds.has(id) && (seen.has(id) ? false : (seen.add(id), true)));
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

// Who a team takes when it's on the clock and nobody picks: the first
// undrafted player on its list, else the best-evaluated player left (Will:
// "if someone has an empty list, they get the person who had the next
// highest eval"). null when nobody is left.
export function nextAutoPick(list: string[], draftedIds: Set<string>, poolBestFirst: { registrationId: string }[]): string | null {
  const fromList = list.find((id) => !draftedIds.has(id));
  if (fromList) return fromList;
  return poolBestFirst.find((p) => !draftedIds.has(p.registrationId))?.registrationId ?? null;
}
