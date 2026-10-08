// Live draft rules (Will, 2026-10-04). Pure and tested: whose pick it is,
// what happens when nobody picks, and when the draft is over. The server
// action asks decideNext() what to do; the screens use pickSlot() to show
// the board.

import { nextAutoPick } from '@/lib/draft-list';

export type DraftFormat = 'snake' | 'linear';
export type DraftStatus = 'setup' | 'live' | 'paused' | 'done';
export type PickSource = 'coach' | 'staff' | 'auto' | 'keeper';

export interface PickSlot {
  round: number; // 1-based
  teamIndex: number; // index into the draft's team order
}

// Snake: 1-2-3, 3-2-1, 1-2-3... Linear: 1-2-3 every round.
export function pickSlot(pickIndex: number, teamCount: number, format: DraftFormat): PickSlot {
  const round = Math.floor(pickIndex / teamCount) + 1;
  const position = pickIndex % teamCount;
  const reversed = format === 'snake' && round % 2 === 0;
  return { round, teamIndex: reversed ? teamCount - 1 - position : position };
}

// A coach's own kid, placed on their team in a round staff chose. It costs
// that team's pick in that round.
export interface Keeper {
  teamId: string;
  registrationId: string;
  round: number;
}

export interface DraftSituation {
  teamOrder: string[];
  format: DraftFormat;
  pickIndex: number;
  // Everyone in the league, best-evaluated first (the empty-list fallback).
  poolBestFirst: string[];
  draftedIds: Set<string>;
  keepers: Keeper[];
  // Each team's draft list, in their order.
  lists: Map<string, string[]>;
  // Teams with auto-select on: they pick the moment they're up.
  autoTeams: Set<string>;
  clockExpired: boolean;
}

export type DraftDecision =
  | { type: 'done' }
  | { type: 'wait'; teamId: string; round: number }
  | { type: 'pick'; teamId: string; round: number; registrationId: string; source: 'auto' | 'keeper' };

// What should happen at the current pick.
// - No undrafted, unreserved players left: place any keepers still waiting,
//   then the draft is done.
// - The team on the clock has a keeper for this round: that's their pick.
// - Their auto-select is on, or the clock ran out: their list picks (first
//   player still available), else the best-evaluated player left.
// - Otherwise wait for someone to pick.
export function decideNext(s: DraftSituation): DraftDecision {
  if (s.teamOrder.length === 0) return { type: 'done' };
  const pendingKeepers = s.keepers.filter((k) => !s.draftedIds.has(k.registrationId));
  const reserved = new Set(pendingKeepers.map((k) => k.registrationId));
  const unavailable = new Set([...s.draftedIds, ...reserved]);
  const anyoneAvailable = s.poolBestFirst.some((id) => !unavailable.has(id));
  const { round, teamIndex } = pickSlot(s.pickIndex, s.teamOrder.length, s.format);
  const teamId = s.teamOrder[teamIndex];

  if (!anyoneAvailable) {
    // Only reserved kids remain: seat them (lowest round first) and finish.
    const next = [...pendingKeepers].sort((a, b) => a.round - b.round)[0];
    return next ? { type: 'pick', teamId: next.teamId, round, registrationId: next.registrationId, source: 'keeper' } : { type: 'done' };
  }

  const keeper = pendingKeepers.find((k) => k.teamId === teamId && k.round === round);
  if (keeper) return { type: 'pick', teamId, round, registrationId: keeper.registrationId, source: 'keeper' };

  if (s.autoTeams.has(teamId) || s.clockExpired) {
    const choice = nextAutoPick(s.lists.get(teamId) ?? [], unavailable, s.poolBestFirst.map((registrationId) => ({ registrationId })));
    if (choice) return { type: 'pick', teamId, round, registrationId: choice, source: 'auto' };
  }
  return { type: 'wait', teamId, round };
}

// Can this player be taken by this team right now?
export function canPick(s: Pick<DraftSituation, 'poolBestFirst' | 'draftedIds' | 'keepers'>, teamId: string, registrationId: string): boolean {
  if (!s.poolBestFirst.includes(registrationId) || s.draftedIds.has(registrationId)) return false;
  const keeper = s.keepers.find((k) => k.registrationId === registrationId);
  return !keeper || keeper.teamId === teamId;
}

export function secondsLeft(clockStartedAt: string | null, pickSeconds: number, now: number): number | null {
  if (!clockStartedAt || pickSeconds <= 0) return null;
  return Math.max(0, Math.ceil(pickSeconds - (now - new Date(clockStartedAt).getTime()) / 1000));
}

// "Round 2, pick 3 (11th overall)"
export function pickLabel(pickIndex: number, teamCount: number): string {
  if (teamCount === 0) return '';
  const round = Math.floor(pickIndex / teamCount) + 1;
  return `Round ${round}, pick ${(pickIndex % teamCount) + 1}`;
}
