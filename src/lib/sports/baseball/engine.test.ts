import { describe, it, expect } from 'vitest';
import {
  replay,
  defaultMoves,
  deriveStats,
  currentBatter,
  recorderAllowed,
  sanitizeEvent,
  formatInnings,
  inningsPitched,
  type GameLineups,
  type LiveEvent,
  type PitchResult,
  type PlateResult,
  type RunnerMove,
} from './engine';

// Away bats first. a1..a9 / h1..h9; a9 and h9 pitch.
const slot = (prefix: string, n: number) => ({ battingOrder: n, playerId: `${prefix}${n}`, position: n === 9 ? 'P' : 'CF' });
const lineups: GameLineups = {
  away: Array.from({ length: 9 }, (_, i) => slot('a', i + 1)),
  home: Array.from({ length: 9 }, (_, i) => slot('h', i + 1)),
};

// Tiny event builder so tests read like a scorebook.
function game() {
  const events: LiveEvent[] = [];
  let seq = 0;
  const api = {
    start: () => (events.push({ seq: ++seq, kind: 'game_start' }), api),
    pitch: (...results: PitchResult[]) => (results.forEach((result) => events.push({ seq: ++seq, kind: 'pitch', result })), api),
    pa: (result: PlateResult, moves?: RunnerMove[], rbi?: number) => {
      const { state } = replay(events, lineups);
      events.push({ seq: ++seq, kind: 'plate_appearance', result, moves: moves ?? defaultMoves(result, state.bases), rbi });
      return api;
    },
    steal: (from: 1 | 2 | 3, to: 2 | 3 | 'home' | 'out', play: 'stolen_base' | 'caught_stealing' = 'stolen_base') => (events.push({ seq: ++seq, kind: 'runner', play, from, to }), api),
    pitchingChange: (side: 'home' | 'away', pitcherId: string) => (events.push({ seq: ++seq, kind: 'pitching_change', side, pitcherId }), api),
    sub: (side: 'home' | 'away', battingOrder: number, playerId: string) => (events.push({ seq: ++seq, kind: 'substitution', side, battingOrder, playerId }), api),
    threeUpThreeDown: () => api.pa('groundout').pa('flyout').pa('lineout'),
    end: () => (events.push({ seq: ++seq, kind: 'game_end' }), api),
    events,
    result: () => replay(events, lineups),
  };
  return api;
}

describe('the count', () => {
  it('four balls is a walk', () => {
    const { state, stats } = game().start().pitch('ball', 'ball', 'ball', 'ball').result();
    expect(state.bases[0]).toBe('a1');
    expect(state.balls).toBe(0);
    expect(stats.get('a1')?.bb).toBe(1);
    expect(stats.get('a1')?.ab).toBe(0); // a walk isn't an at-bat
    expect(stats.get('h9')?.bb_pitching).toBe(1);
  });

  it('three strikes is a strikeout, fouls can’t be strike three', () => {
    const { state, stats } = game().start().pitch('called_strike', 'foul', 'foul', 'foul', 'swinging_strike').result();
    expect(state.outs).toBe(1);
    expect(state.strikes).toBe(0);
    expect(stats.get('a1')).toMatchObject({ ab: 1, k: 1 });
    expect(stats.get('h9')).toMatchObject({ k_pitching: 1, outsPitched: 1 });
  });

  it('a 3-2 count shows before the next pitch', () => {
    const { state } = game().start().pitch('ball', 'ball', 'ball', 'called_strike', 'swinging_strike').result();
    expect([state.balls, state.strikes]).toEqual([3, 2]);
    expect(currentBatter(state, lineups)).toBe('a1');
  });
});

describe('runners and runs', () => {
  it('a bases-loaded walk forces in a run and an RBI', () => {
    const { state, stats } = game().start().pa('single').pa('single').pa('single').pa('walk').result();
    expect(state.score.away).toBe(1);
    expect(state.bases).toEqual(['a4', 'a3', 'a2']);
    expect(stats.get('a4')).toMatchObject({ bb: 1, rbi: 1, ab: 0 });
    expect(stats.get('a1')?.r).toBe(1);
    expect(stats.get('h9')?.er).toBe(1);
  });

  it('a walk only moves forced runners', () => {
    // Runner on 2nd, walk: 2nd isn't forced, so they stay.
    const { state } = game().start().pa('double').pa('walk').result();
    expect(state.bases).toEqual(['a2', 'a1', null]);
  });

  it('a grand slam scores four, all driven in', () => {
    const { state, stats } = game().start().pa('walk').pa('walk').pa('walk').pa('home_run').result();
    expect(state.score.away).toBe(4);
    expect(state.bases).toEqual([null, null, null]);
    expect(stats.get('a4')).toMatchObject({ h: 1, rbi: 4, r: 1 });
  });

  it('runs on an error score but are unearned and no RBI', () => {
    const { state, stats } = game().start().pa('triple').pa('error').result();
    expect(state.score.away).toBe(1);
    expect(stats.get('a2')?.rbi).toBe(0);
    expect(stats.get('h9')?.er).toBe(0);
    expect(state.errors.home).toBe(1);
  });

  it('a stolen base moves the runner and credits SB; caught stealing is an out', () => {
    const { state, stats } = game().start().pa('single').steal(1, 2).result();
    expect(state.bases).toEqual([null, 'a1', null]);
    expect(stats.get('a1')?.sb).toBe(1);
    const cs = game().start().pa('single').steal(1, 'out', 'caught_stealing').result();
    expect(cs.state.outs).toBe(1);
    expect(cs.state.bases).toEqual([null, null, null]);
  });

  it('a sac fly scores the runner from third, no at-bat', () => {
    const { state, stats } = game().start().pa('triple').pa('sac_fly').result();
    expect(state.score.away).toBe(1);
    expect(state.outs).toBe(1);
    expect(stats.get('a2')).toMatchObject({ ab: 0, rbi: 1 });
  });

  it('a double play is two outs and no RBI', () => {
    const { state, stats } = game().start().pa('single').pa('double_play').result();
    expect(state.outs).toBe(2);
    expect(state.bases).toEqual([null, null, null]);
    expect(stats.get('a2')?.rbi).toBe(0);
  });
});

describe('innings', () => {
  it('the third out ends the half and clears the bases', () => {
    const { state } = game().start().pa('single').threeUpThreeDown().result();
    expect([state.inning, state.half, state.outs]).toEqual([1, 'bottom', 0]);
    expect(state.bases).toEqual([null, null, null]);
    expect(state.lineScore.away).toEqual([0]);
  });

  it('the lineup keeps its place across innings and wraps around', () => {
    // Top 1: a1..a3 out. Bottom 1: h1..h3 out. Top 2: a4 leads off.
    const g = game().start().threeUpThreeDown().threeUpThreeDown();
    const { state } = g.result();
    expect([state.inning, state.half]).toEqual([2, 'top']);
    expect(currentBatter(state, lineups)).toBe('a4');
    expect(currentBatter(state, lineups, 1)).toBe('a5'); // on deck
  });

  it('keeps a line score by inning', () => {
    const { state } = game().start().pa('home_run').threeUpThreeDown().pa('home_run').pa('home_run').threeUpThreeDown().result();
    expect(state.lineScore).toEqual({ away: [1], home: [2] });
    expect(state.score).toEqual({ away: 1, home: 2 });
  });

  it('counts innings pitched from outs', () => {
    const { stats } = game().start().threeUpThreeDown().pa('groundout').pa('groundout').result();
    expect(stats.get('h9')?.outsPitched).toBe(3);
    expect(stats.get('a9')?.outsPitched).toBe(2);
    expect(inningsPitched(2)).toBe(0.67);
    expect(formatInnings(7)).toBe('2.1');
  });
});

describe('pitching and pitch counts', () => {
  it('a pitching change credits the new pitcher from then on', () => {
    const { stats, state } = game().start().pitchingChange('home', 'h8').pa('strikeout').result();
    expect(state.pitcher.home).toBe('h8');
    expect(stats.get('h8')?.k_pitching).toBe(1);
    expect(stats.get('h9')?.k_pitching ?? 0).toBe(0);
  });

  it('counts pitches thrown', () => {
    const { state } = game().start().pitch('ball', 'called_strike', 'foul').pa('single').result();
    expect(state.pitchCounts.h9).toBe(4);
  });
});

describe('undo is just replaying fewer events', () => {
  it('dropping the last event restores the previous state', () => {
    const g = game().start().pa('single').pa('double');
    const before = replay(g.events.slice(0, -1), lineups).state;
    expect(before.bases).toEqual(['a1', null, null]);
    expect(g.result().state.bases).toEqual([null, 'a2', 'a1']);
  });

  it('never changes the lineups it was given (substitutions work on a copy)', () => {
    const { stats } = game().start().sub('away', 1, 'sub').pa('single').result();
    expect(stats.get('sub')?.h).toBe(1); // the sub batted in slot 1
    expect(lineups.away[0].playerId).toBe('a1'); // the caller's lineup is untouched
  });
});

describe('final', () => {
  it('nothing counts after the game ends', () => {
    const { state } = game().start().pa('home_run').end().pa('home_run').result();
    expect(state.status).toBe('final');
    expect(state.score.away).toBe(1);
  });
});

describe('deriveStats', () => {
  it('keeps only the categories the league takes', () => {
    const { stats } = game().start().pa('single').pa('home_run').result();
    const derived = deriveStats(stats, ['h', 'rbi']);
    expect(derived.get('a2')).toEqual({ h: 1, rbi: 2 });
    expect(derived.get('a2')).not.toHaveProperty('ab');
  });

  it('reports innings pitched as true thirds so season totals add up', () => {
    const { stats } = game().start().pa('groundout').pa('groundout').result();
    expect(deriveStats(stats, ['ip']).get('h9')).toEqual({ ip: 0.67 });
  });
});

describe('who may record what', () => {
  const live = game().start().result().state; // top 1st: away batting

  it('only the batting team records the at-bats', () => {
    expect(recorderAllowed({ kind: 'pitch' }, live, 'away')).toBeNull();
    expect(recorderAllowed({ kind: 'pitch' }, live, 'home')).toMatch(/other team is batting/);
  });

  it('only the fielding team changes its pitcher', () => {
    expect(recorderAllowed({ kind: 'pitching_change', side: 'home' }, live, 'home')).toBeNull();
    expect(recorderAllowed({ kind: 'pitching_change', side: 'away' }, live, 'away')).toMatch(/in the field/);
  });

  it('start and end rules', () => {
    const pregame = game().result().state;
    expect(recorderAllowed({ kind: 'game_start' }, pregame, 'home')).toBeNull();
    expect(recorderAllowed({ kind: 'pitch' }, pregame, 'away')).toMatch(/Start the game/);
    expect(recorderAllowed({ kind: 'game_start' }, live, 'home')).toMatch(/already started/);
    const final = game().start().end().result().state;
    expect(recorderAllowed({ kind: 'pitch' }, final, 'away')).toMatch(/over/);
  });
});

describe('sanitizeEvent (untrusted input)', () => {
  const roster = new Set(['h8', 'h9']);
  const live = game().start().pa('single').result().state; // runner a1 on first, away batting

  it('rebuilds a clean play from known fields only', () => {
    expect(sanitizeEvent({ kind: 'pitch', result: 'ball', extra: 'x' }, live, lineups, 'away', roster)).toEqual({ kind: 'pitch', result: 'ball' });
  });

  it('rejects runners from empty bases and base collisions', () => {
    expect(sanitizeEvent({ kind: 'plate_appearance', result: 'single', moves: [{ from: 'batter', to: 1 }, { from: 2, to: 3 }] }, live, lineups, 'away', roster)).toMatch(/no runner/);
    expect(sanitizeEvent({ kind: 'plate_appearance', result: 'single', moves: [{ from: 'batter', to: 1 }] }, live, lineups, 'away', roster)).toMatch(/same base/);
    expect(sanitizeEvent({ kind: 'plate_appearance', result: 'single', moves: [{ from: 1, to: 2 }] }, live, lineups, 'away', roster)).toMatch(/batter/);
  });

  it('accepts a normal single with the runner moving up', () => {
    expect(sanitizeEvent({ kind: 'plate_appearance', result: 'single', moves: [{ from: 'batter', to: 1 }, { from: 1, to: 2 }] }, live, lineups, 'away', roster)).toMatchObject({ result: 'single' });
  });

  it('only lets a team change to its own pitcher', () => {
    expect(sanitizeEvent({ kind: 'pitching_change', pitcherId: 'a4' }, live, lineups, 'home', roster)).toMatch(/your roster/);
    expect(sanitizeEvent({ kind: 'pitching_change', pitcherId: 'h8', side: 'away' }, live, lineups, 'home', roster)).toEqual({ kind: 'pitching_change', side: 'home', pitcherId: 'h8' });
  });

  it('rejects junk', () => {
    expect(sanitizeEvent({ kind: 'drop_table' }, live, lineups, 'away', roster)).toMatch(/Unknown/);
    expect(sanitizeEvent(null, live, lineups, 'away', roster)).toMatch(/Invalid/);
    expect(sanitizeEvent({ kind: 'runner', play: 'stolen_base', from: 1, to: 1 }, live, lineups, 'away', roster)).toMatch(/isn’t open/);
  });
});

describe('play-by-play text', () => {
  it('doesn’t double the period after a name ending in an initial', () => {
    const { state } = replay([{ seq: 1, kind: 'game_start' }, { seq: 2, kind: 'pitching_change', side: 'home', pitcherId: 'h8' }], lineups, () => 'Wyatt D.');
    expect(state.plays.at(-1)?.text).toBe('Pitching change: Wyatt D.');
  });
});

describe('runners can’t pass each other', () => {
  const roster = new Set<string>();
  // Runners on 1st and 3rd.
  const corners = game().start().pa('triple').pa('single', [{ from: 'batter', to: 1 }, { from: 3, to: 3 }]).result().state;

  it('rejects the trailing runner scoring while the lead runner holds', () => {
    const moves = [{ from: 'batter', to: 1 }, { from: 1, to: 'home' }, { from: 3, to: 3 }];
    expect(sanitizeEvent({ kind: 'plate_appearance', result: 'single', moves }, corners, lineups, 'away', roster)).toMatch(/pass/);
  });

  it('allows it when the lead runner is thrown out', () => {
    const moves = [{ from: 'batter', to: 1 }, { from: 1, to: 3 }, { from: 3, to: 'out' }];
    expect(sanitizeEvent({ kind: 'plate_appearance', result: 'fielders_choice', moves }, corners, lineups, 'away', roster)).toMatchObject({ kind: 'plate_appearance' });
  });

  it('allows everyone moving up in order', () => {
    const moves = [{ from: 'batter', to: 2 }, { from: 1, to: 3 }, { from: 3, to: 'home' }];
    expect(sanitizeEvent({ kind: 'plate_appearance', result: 'double', moves }, corners, lineups, 'away', roster)).toMatchObject({ kind: 'plate_appearance' });
  });
});
