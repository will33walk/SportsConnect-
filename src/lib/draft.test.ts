import { describe, expect, it } from 'vitest';
import { canPick, decideNext, pickLabel, pickSlot, secondsLeft, type DraftSituation } from './draft';

describe('pickSlot', () => {
  it('snakes: 1-2-3, 3-2-1, 1-2-3', () => {
    const order = Array.from({ length: 9 }, (_, i) => pickSlot(i, 3, 'snake'));
    expect(order.map((s) => s.teamIndex)).toEqual([0, 1, 2, 2, 1, 0, 0, 1, 2]);
    expect(order.map((s) => s.round)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3]);
  });
  it('linear repeats the same order', () => {
    expect(Array.from({ length: 6 }, (_, i) => pickSlot(i, 3, 'linear').teamIndex)).toEqual([0, 1, 2, 0, 1, 2]);
  });
});

const base = (o: Partial<DraftSituation> = {}): DraftSituation => ({
  teamOrder: ['T1', 'T2', 'T3'],
  format: 'snake',
  pickIndex: 0,
  poolBestFirst: ['a', 'b', 'c', 'd', 'e', 'f'],
  draftedIds: new Set(),
  keepers: [],
  lists: new Map(),
  autoTeams: new Set(),
  clockExpired: false,
  ...o,
});

describe('decideNext', () => {
  it('waits for the team on the clock', () => {
    expect(decideNext(base())).toEqual({ type: 'wait', teamId: 'T1', round: 1 });
    expect(decideNext(base({ pickIndex: 3 }))).toEqual({ type: 'wait', teamId: 'T3', round: 2 });
  });
  it('picks from the team’s list when the clock runs out, skipping drafted players', () => {
    const s = base({ clockExpired: true, lists: new Map([['T1', ['c', 'e']]]), draftedIds: new Set(['c']) });
    expect(decideNext(s)).toEqual({ type: 'pick', teamId: 'T1', round: 1, registrationId: 'e', source: 'auto' });
  });
  it('takes the best-evaluated player left when the list is empty', () => {
    expect(decideNext(base({ clockExpired: true, draftedIds: new Set(['a']) }))).toMatchObject({ type: 'pick', registrationId: 'b', source: 'auto' });
  });
  it('auto-select teams pick at once, without waiting for the clock', () => {
    expect(decideNext(base({ autoTeams: new Set(['T1']), lists: new Map([['T1', ['d']]]) }))).toMatchObject({ type: 'pick', teamId: 'T1', registrationId: 'd', source: 'auto' });
    expect(decideNext(base({ autoTeams: new Set(['T2']) }))).toEqual({ type: 'wait', teamId: 'T1', round: 1 });
  });
  it('seats a coach’s kid in the round staff chose, and keeps them off everyone else’s board', () => {
    const keepers = [{ teamId: 'T2', registrationId: 'a', round: 2 }];
    // Round 1: T1's clock runs out with an empty list -> best AVAILABLE is b, not the reserved a.
    expect(decideNext(base({ keepers, clockExpired: true }))).toMatchObject({ registrationId: 'b' });
    // Round 2 snakes T3, T2, T1: pick index 4 is T2's -> the keeper, no waiting.
    expect(decideNext(base({ keepers, pickIndex: 4, draftedIds: new Set(['b', 'c', 'd', 'e']) }))).toEqual({ type: 'pick', teamId: 'T2', round: 2, registrationId: 'a', source: 'keeper' });
    expect(canPick(base({ keepers }), 'T1', 'a')).toBe(false);
    expect(canPick(base({ keepers }), 'T2', 'a')).toBe(true);
  });
  it('finishes when everyone is drafted, seating any kids still reserved first', () => {
    const everyone = new Set(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(decideNext(base({ pickIndex: 6, draftedIds: everyone }))).toEqual({ type: 'done' });
    const keepers = [{ teamId: 'T3', registrationId: 'f', round: 9 }];
    expect(decideNext(base({ pickIndex: 5, keepers, draftedIds: new Set(['a', 'b', 'c', 'd', 'e']) }))).toMatchObject({ type: 'pick', teamId: 'T3', registrationId: 'f', source: 'keeper' });
  });
  it('never drafts someone twice or someone outside the league', () => {
    expect(canPick(base({ draftedIds: new Set(['a']) }), 'T1', 'a')).toBe(false);
    expect(canPick(base(), 'T1', 'zzz')).toBe(false);
    expect(canPick(base(), 'T1', 'b')).toBe(true);
  });
});

describe('clock and labels', () => {
  it('counts down from the pick clock', () => {
    const start = '2026-10-04T12:00:00.000Z';
    const at = (s: number) => new Date(start).getTime() + s * 1000;
    expect(secondsLeft(start, 30, at(0))).toBe(30);
    expect(secondsLeft(start, 30, at(12.2))).toBe(18);
    expect(secondsLeft(start, 30, at(45))).toBe(0);
    expect(secondsLeft(start, 0, at(5))).toBeNull();
    expect(secondsLeft(null, 30, at(5))).toBeNull();
  });
  it('names the pick', () => {
    expect(pickLabel(0, 4)).toBe('Round 1, pick 1');
    expect(pickLabel(6, 4)).toBe('Round 2, pick 3');
  });
});
