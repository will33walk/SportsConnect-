// Baseball live-game engine (pure -- no I/O, no 'use server').
//
// Every live game is an append-only list of events; the scoreboard, count,
// runners, who's up, and every stat are REPLAYED from that list, never stored
// separately. That makes undo trivial (drop the last event, replay) and keeps
// the follower view, the scorekeeper view and the stat sheet impossible to
// disagree.
//
// Each team records its own half-innings (away bats the top, home the
// bottom); the fielding team records its pitching changes. See engine.test.ts
// for the rules as executable examples.
//
// This is ONE SPORT'S implementation, not a universal engine. The types below
// (PitchResult, Base, Half) are baseball's vocabulary and belong to baseball.
// What generalises is the PATTERN: append-only log, pure replay, undo by
// truncation, and server-side sanitize against current state. Basketball,
// volleyball and soccer get their own modules in sibling directories, register
// in ../registry.ts, and write their own event kinds into the same
// game_events table.

export type Half = 'top' | 'bottom';
export type Side = 'home' | 'away';
export type Base = 1 | 2 | 3;
export type Destination = Base | 'home' | 'out';

export type PitchResult = 'ball' | 'called_strike' | 'swinging_strike' | 'foul';

export const HIT_RESULTS = ['single', 'double', 'triple', 'home_run'] as const;
export type PlateResult =
  | 'single'
  | 'double'
  | 'triple'
  | 'home_run'
  | 'walk'
  | 'hbp'
  | 'strikeout'
  | 'groundout'
  | 'flyout'
  | 'lineout'
  | 'popout'
  | 'fielders_choice'
  | 'error'
  | 'sac_fly'
  | 'sac_bunt'
  | 'double_play';

export type RunnerPlay = 'stolen_base' | 'caught_stealing' | 'picked_off' | 'advance';

export interface RunnerMove {
  // Base the runner started on, or 'batter'.
  from: Base | 'batter';
  to: Destination;
}

export type LiveEvent =
  | { seq: number; kind: 'game_start' }
  | { seq: number; kind: 'pitch'; result: PitchResult }
  | { seq: number; kind: 'plate_appearance'; result: PlateResult; moves: RunnerMove[]; rbi?: number }
  | { seq: number; kind: 'runner'; play: RunnerPlay; from: Base; to: Destination }
  | { seq: number; kind: 'pitching_change'; side: Side; pitcherId: string }
  | { seq: number; kind: 'substitution'; side: Side; battingOrder: number; playerId: string }
  | { seq: number; kind: 'end_half' }
  | { seq: number; kind: 'game_end' };

export interface LineupSlot {
  battingOrder: number;
  playerId: string;
  position: string | null;
}

export interface GameLineups {
  home: LineupSlot[];
  away: LineupSlot[];
}

export interface Play {
  seq: number;
  inning: number;
  half: Half;
  text: string;
  runs: number;
}

export interface GameState {
  status: 'pregame' | 'live' | 'final';
  inning: number;
  half: Half;
  outs: number;
  balls: number;
  strikes: number;
  // Runner (player id) on 1st, 2nd, 3rd.
  bases: [string | null, string | null, string | null];
  score: { home: number; away: number };
  // Runs per inning, index 0 = 1st inning.
  lineScore: { home: number[]; away: number[] };
  hits: { home: number; away: number };
  errors: { home: number; away: number };
  // Index into each team's batting order of who bats next.
  nextBatterIndex: { home: number; away: number };
  pitcher: { home: string | null; away: string | null };
  // Pitches thrown, per pitcher (youth pitch-count limits). Counts tapped
  // pitches plus the ball put in play on a recorded result.
  pitchCounts: Record<string, number>;
  plays: Play[];
}

export const battingSide = (half: Half): Side => (half === 'top' ? 'away' : 'home');
export const fieldingSide = (half: Half): Side => (half === 'top' ? 'home' : 'away');

function orderOf(lineup: LineupSlot[]): LineupSlot[] {
  return [...lineup].sort((a, b) => a.battingOrder - b.battingOrder);
}

export function initialState(lineups: GameLineups): GameState {
  const starter = (slots: LineupSlot[]) => slots.find((s) => s.position === 'P')?.playerId ?? null;
  return {
    status: 'pregame',
    inning: 1,
    half: 'top',
    outs: 0,
    balls: 0,
    strikes: 0,
    bases: [null, null, null],
    score: { home: 0, away: 0 },
    lineScore: { home: [], away: [] },
    hits: { home: 0, away: 0 },
    errors: { home: 0, away: 0 },
    nextBatterIndex: { home: 0, away: 0 },
    pitcher: { home: starter(lineups.home), away: starter(lineups.away) },
    pitchCounts: {},
    plays: [],
  };
}

export function currentBatter(state: GameState, lineups: GameLineups, offset = 0): string | null {
  const side = battingSide(state.half);
  const order = orderOf(lineups[side]);
  if (order.length === 0) return null;
  return order[(state.nextBatterIndex[side] + offset) % order.length].playerId;
}

// Where every runner goes by default on a given result -- the scorekeeper
// screen starts from this and lets them change any runner before saving.
export function defaultMoves(result: PlateResult, bases: GameState['bases']): RunnerMove[] {
  const on = ([1, 2, 3] as Base[]).filter((b) => bases[b - 1]);
  const push = (b: Base, by: number): Destination => (b + by >= 4 ? 'home' : ((b + by) as Base));
  switch (result) {
    case 'single':
    case 'error':
      return [{ from: 'batter', to: 1 }, ...on.map((b) => ({ from: b, to: push(b, 1) }))];
    case 'double':
      return [{ from: 'batter', to: 2 }, ...on.map((b) => ({ from: b, to: push(b, 2) }))];
    case 'triple':
      return [{ from: 'batter', to: 3 }, ...on.map((b) => ({ from: b, to: 'home' as const }))];
    case 'home_run':
      return [{ from: 'batter', to: 'home' }, ...on.map((b) => ({ from: b, to: 'home' as const }))];
    case 'walk':
    case 'hbp':
      return [{ from: 'batter', to: 1 }, ...forced(bases)];
    case 'sac_fly':
      return [{ from: 'batter', to: 'out' }, ...on.map((b) => ({ from: b, to: b === 3 ? ('home' as const) : b }))];
    case 'sac_bunt':
      return [{ from: 'batter', to: 'out' }, ...on.map((b) => ({ from: b, to: push(b, 1) }))];
    case 'fielders_choice': {
      // Batter safe at first; the lead forced runner is out, the other
      // forced runners move up, everyone else holds.
      const pushed = forced(bases);
      const lead = pushed.at(-1);
      return [
        { from: 'batter', to: 1 },
        ...on.map((b): RunnerMove => {
          if (lead && lead.from === b) return { from: b, to: 'out' };
          return { from: b, to: pushed.find((f) => f.from === b)?.to ?? b };
        }),
      ];
    }
    case 'double_play':
      return [{ from: 'batter', to: 'out' }, ...on.map((b) => ({ from: b, to: b === 1 ? ('out' as const) : b }))];
    default:
      // strikeout, groundout, flyout, lineout, popout: batter out, runners hold.
      return [{ from: 'batter', to: 'out' }, ...on.map((b) => ({ from: b, to: b }))];
  }
}

// Runners pushed along by a walk/HBP (only those forced).
function forced(bases: GameState['bases']): RunnerMove[] {
  const moves: RunnerMove[] = [];
  if (bases[0]) {
    moves.push({ from: 1, to: 2 });
    if (bases[1]) {
      moves.push({ from: 2, to: 3 });
      if (bases[2]) moves.push({ from: 3, to: 'home' });
    }
  }
  return moves;
}

// RBI rule of thumb: runs that score on the play, except on an error or a
// double play. Walks/HBP only drive in a forced run.
export function defaultRbi(result: PlateResult, runsScored: number): number {
  if (result === 'error' || result === 'double_play') return 0;
  return runsScored;
}

const RESULT_TEXT: Record<PlateResult, string> = {
  single: 'singles',
  double: 'doubles',
  triple: 'triples',
  home_run: 'homers',
  walk: 'walks',
  hbp: 'is hit by a pitch',
  strikeout: 'strikes out',
  groundout: 'grounds out',
  flyout: 'flies out',
  lineout: 'lines out',
  popout: 'pops out',
  fielders_choice: 'reaches on a fielder’s choice',
  error: 'reaches on an error',
  sac_fly: 'hits a sacrifice fly',
  sac_bunt: 'lays down a sacrifice bunt',
  double_play: 'grounds into a double play',
};

export const PLATE_RESULT_LABEL: Record<PlateResult, string> = {
  single: '1B',
  double: '2B',
  triple: '3B',
  home_run: 'HR',
  walk: 'Walk',
  hbp: 'HBP',
  strikeout: 'K',
  groundout: 'Ground out',
  flyout: 'Fly out',
  lineout: 'Line out',
  popout: 'Pop out',
  fielders_choice: 'FC',
  error: 'Error',
  sac_fly: 'Sac fly',
  sac_bunt: 'Sac bunt',
  double_play: 'DP',
};

export interface StatLine {
  // Batting
  ab: number;
  h: number;
  r: number;
  rbi: number;
  bb: number;
  k: number;
  sb: number;
  // Pitching
  outsPitched: number;
  k_pitching: number;
  bb_pitching: number;
  h_allowed: number;
  er: number;
}

export const emptyLine = (): StatLine => ({ ab: 0, h: 0, r: 0, rbi: 0, bb: 0, k: 0, sb: 0, outsPitched: 0, k_pitching: 0, bb_pitching: 0, h_allowed: 0, er: 0 });

export interface ReplayResult {
  state: GameState;
  stats: Map<string, StatLine>;
}

type NameFor = (playerId: string | null) => string;

// Replays every event, in seq order, into the game state and each player's
// stat line. `nameFor` only affects the play-by-play text.
export function replay(events: LiveEvent[], lineupsIn: GameLineups, nameFor: NameFor = () => 'Batter'): ReplayResult {
  // Substitutions change who's in a slot -- work on a copy, never the caller's.
  const lineups: GameLineups = { home: lineupsIn.home.map((s) => ({ ...s })), away: lineupsIn.away.map((s) => ({ ...s })) };
  const state = initialState(lineups);
  const stats = new Map<string, StatLine>();
  const line = (id: string | null) => {
    if (!id) return null;
    if (!stats.has(id)) stats.set(id, emptyLine());
    return stats.get(id)!;
  };

  // Names end in an initial ("Wyatt D."), so don't double the period.
  const logPlay = (text: string, runs: number, seq: number) => state.plays.push({ seq, inning: state.inning, half: state.half, text: text.replace(/\.\.$/, '.'), runs });

  const scoreRun = (runnerId: string | null, earned: boolean) => {
    const side = battingSide(state.half);
    state.score[side] += 1;
    const idx = state.inning - 1;
    while (state.lineScore[side].length <= idx) state.lineScore[side].push(0);
    state.lineScore[side][idx] += 1;
    const runner = line(runnerId);
    if (runner) runner.r += 1;
    if (earned) {
      const pitcher = line(state.pitcher[fieldingSide(state.half)]);
      if (pitcher) pitcher.er += 1;
    }
  };

  const recordOuts = (n: number) => {
    const pitcher = line(state.pitcher[fieldingSide(state.half)]);
    const add = Math.min(n, 3 - state.outs);
    if (pitcher) pitcher.outsPitched += add;
    state.outs += add;
  };

  const countPitch = () => {
    const pitcherId = state.pitcher[fieldingSide(state.half)];
    if (pitcherId) state.pitchCounts[pitcherId] = (state.pitchCounts[pitcherId] ?? 0) + 1;
  };

  const resetCount = () => {
    state.balls = 0;
    state.strikes = 0;
  };

  const endHalfIfDone = (force = false) => {
    if (state.outs < 3 && !force) return;
    // Make sure the half shows on the line score even with no runs.
    const side = battingSide(state.half);
    const idx = state.inning - 1;
    while (state.lineScore[side].length <= idx) state.lineScore[side].push(0);
    state.outs = 0;
    state.bases = [null, null, null];
    resetCount();
    if (state.half === 'top') state.half = 'bottom';
    else {
      state.half = 'top';
      state.inning += 1;
    }
  };

  const advanceBatter = () => {
    const side = battingSide(state.half);
    const size = lineups[side].length || 1;
    state.nextBatterIndex[side] = (state.nextBatterIndex[side] + 1) % size;
  };

  // Applies runner moves for a plate appearance; returns runs scored.
  const applyMoves = (moves: RunnerMove[], batterId: string | null, earned: boolean): { runs: number; outs: number } => {
    const before = state.bases;
    const after: GameState['bases'] = [null, null, null];
    let runs = 0;
    let outs = 0;
    const movedFrom = new Set(moves.map((m) => m.from));
    // Runners not mentioned stay put.
    ([1, 2, 3] as Base[]).forEach((b) => {
      if (before[b - 1] && !movedFrom.has(b)) after[b - 1] = before[b - 1];
    });
    for (const move of moves) {
      const runner = move.from === 'batter' ? batterId : before[move.from - 1];
      if (move.from !== 'batter' && !runner) continue;
      if (move.to === 'out') outs += 1;
      else if (move.to === 'home') {
        runs += 1;
        scoreRun(runner, earned);
      } else after[move.to - 1] = runner;
    }
    state.bases = after;
    return { runs, outs };
  };

  const plateAppearance = (seq: number, result: PlateResult, moves: RunnerMove[], rbiOverride: number | undefined) => {
    const side = battingSide(state.half);
    const batterId = currentBatter(state, lineups);
    const batter = line(batterId);
    const pitcher = line(state.pitcher[fieldingSide(state.half)]);
    const isHit = (HIT_RESULTS as readonly string[]).includes(result);

    if (batter) {
      if (!['walk', 'hbp', 'sac_fly', 'sac_bunt'].includes(result)) batter.ab += 1;
      if (isHit) batter.h += 1;
      if (result === 'walk') batter.bb += 1;
      if (result === 'strikeout') batter.k += 1;
    }
    if (pitcher) {
      if (isHit) pitcher.h_allowed += 1;
      if (result === 'walk') pitcher.bb_pitching += 1;
      if (result === 'strikeout') pitcher.k_pitching += 1;
    }
    if (isHit) state.hits[side] += 1;
    if (result === 'error') state.errors[fieldingSide(state.half)] += 1;

    const { runs, outs } = applyMoves(moves, batterId, result !== 'error');
    if (batter) batter.rbi += rbiOverride ?? defaultRbi(result, runs);
    logPlay(`${nameFor(batterId)} ${RESULT_TEXT[result]}${runs ? ` — ${runs} run${runs === 1 ? '' : 's'} score${runs === 1 ? 's' : ''}` : ''}.`, runs, seq);
    resetCount();
    advanceBatter();
    recordOuts(outs);
    endHalfIfDone();
  };

  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (state.status === 'final') break;
    switch (event.kind) {
      case 'game_start':
        state.status = 'live';
        break;
      case 'pitch': {
        state.status = 'live';
        countPitch();
        if (event.result === 'ball') {
          state.balls += 1;
          if (state.balls >= 4) plateAppearance(event.seq, 'walk', defaultMoves('walk', state.bases), undefined);
        } else if (event.result === 'foul') {
          if (state.strikes < 2) state.strikes += 1;
        } else {
          state.strikes += 1;
          if (state.strikes >= 3) plateAppearance(event.seq, 'strikeout', defaultMoves('strikeout', state.bases), undefined);
        }
        break;
      }
      case 'plate_appearance':
        state.status = 'live';
        // The pitch that was put in play (a walk/strikeout entered directly
        // has no single deciding pitch to count).
        if (event.result !== 'walk' && event.result !== 'strikeout') countPitch();
        plateAppearance(event.seq, event.result, event.moves, event.rbi);
        break;
      case 'runner': {
        state.status = 'live';
        const runnerId = state.bases[event.from - 1];
        if (!runnerId) break;
        const runner = line(runnerId);
        state.bases[event.from - 1] = null;
        const label = event.play === 'stolen_base' ? 'steals' : event.play === 'caught_stealing' ? 'is caught stealing' : event.play === 'picked_off' ? 'is picked off' : 'advances';
        if (event.to === 'out' || event.play === 'caught_stealing' || event.play === 'picked_off') {
          logPlay(`${nameFor(runnerId)} ${label}.`, 0, event.seq);
          recordOuts(1);
          endHalfIfDone();
        } else if (event.to === 'home') {
          if (event.play === 'stolen_base' && runner) runner.sb += 1;
          scoreRun(runnerId, true);
          logPlay(`${nameFor(runnerId)} ${event.play === 'stolen_base' ? 'steals home' : 'scores'}.`, 1, event.seq);
        } else {
          if (event.play === 'stolen_base' && runner) runner.sb += 1;
          state.bases[event.to - 1] = runnerId;
          logPlay(`${nameFor(runnerId)} ${label} ${event.to === 2 ? 'second' : 'third'}.`, 0, event.seq);
        }
        break;
      }
      case 'pitching_change':
        state.pitcher[event.side] = event.pitcherId;
        logPlay(`Pitching change: ${nameFor(event.pitcherId)}.`, 0, event.seq);
        break;
      case 'substitution': {
        const slot = lineups[event.side].find((s) => s.battingOrder === event.battingOrder);
        if (slot) {
          logPlay(`${nameFor(event.playerId)} in for ${nameFor(slot.playerId)}.`, 0, event.seq);
          slot.playerId = event.playerId;
        }
        break;
      }
      case 'end_half':
        logPlay('Half-inning ends.', 0, event.seq);
        endHalfIfDone(true);
        break;
      case 'game_end':
        state.status = 'final';
        break;
    }
  }
  return { state, stats };
}

// Innings pitched from outs, as a true fraction (2 outs = 0.67) so season
// totals add up; displayed baseball-style by formatInnings().
export function inningsPitched(outs: number): number {
  return Math.round((outs / 3) * 100) / 100;
}

export function formatInnings(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

// A player's value for one stat category key (stat_categories.key).
export function statValue(line: StatLine, key: string): number | null {
  switch (key) {
    case 'ab':
    case 'h':
    case 'r':
    case 'rbi':
    case 'bb':
    case 'k':
    case 'sb':
    case 'k_pitching':
    case 'bb_pitching':
    case 'h_allowed':
    case 'er':
      return line[key];
    case 'ip':
      return inningsPitched(line.outsPitched);
    default:
      return null;
  }
}

// Only the categories this league keeps -- live tracking records exactly
// the stats the league already takes (Will: "if we are already taking down
// the information we might as well display it").
export function deriveStats(stats: Map<string, StatLine>, enabledKeys: string[]): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  for (const [playerId, lineValue] of stats) {
    const values: Record<string, number> = {};
    for (const key of enabledKeys) {
      const v = statValue(lineValue, key);
      if (v !== null) values[key] = v;
    }
    out.set(playerId, values);
  }
  return out;
}

// Which team may record this event right now. Each team keeps its own
// book: the batting team records pitches, plate appearances, runner plays,
// its own substitutions and "end half"; the fielding team records its
// pitching changes. Either may start or end the game.
export function recorderAllowed(event: Pick<LiveEvent, 'kind'> & { side?: Side }, state: GameState, recorder: Side): string | null {
  if (state.status === 'final') return 'This game is over.';
  if (event.kind === 'game_start') return state.status === 'pregame' ? null : 'The game already started.';
  if (event.kind === 'game_end') return state.status === 'live' ? null : 'The game hasn’t started.';
  if (state.status === 'pregame') return 'Start the game first.';
  const batting = battingSide(state.half);
  if (event.kind === 'pitching_change') return event.side === recorder && recorder !== batting ? null : 'Record your own pitching changes while you’re in the field.';
  if (event.kind === 'substitution') return event.side === recorder ? null : 'You can only substitute your own players.';
  return recorder === batting ? null : 'The other team is batting — their scorekeeper records this half.';
}

// ---------------------------------------------------------------------------
// Input validation. Everything a scorekeeper's phone sends is untrusted:
// rebuild the event from known fields only, and check it against the game
// as it stands. Returns the clean event, or an error for the scorekeeper.
// ---------------------------------------------------------------------------

const PITCH_RESULTS: PitchResult[] = ['ball', 'called_strike', 'swinging_strike', 'foul'];
export const PLATE_RESULTS: PlateResult[] = [
  'single', 'double', 'triple', 'home_run', 'walk', 'hbp', 'strikeout', 'groundout', 'flyout', 'lineout', 'popout', 'fielders_choice', 'error', 'sac_fly', 'sac_bunt', 'double_play',
];
const RUNNER_PLAYS: RunnerPlay[] = ['stolen_base', 'caught_stealing', 'picked_off', 'advance'];
const isBase = (v: unknown): v is Base => v === 1 || v === 2 || v === 3;
const isDestination = (v: unknown): v is Destination => isBase(v) || v === 'home' || v === 'out';

// Omit that distributes over the union (plain Omit collapses it).
// True when a runner who started behind another finishes ahead of them
// (outs don't count -- a runner put out is off the bases).
function runnersPass(moves: RunnerMove[], held: Base[]): boolean {
  const rank = (d: Destination) => (d === 'home' ? 4 : d === 'out' ? -1 : d);
  const finish = [
    ...moves.map((m) => ({ start: m.from === 'batter' ? 0 : m.from, end: rank(m.to) })),
    ...held.map((b) => ({ start: b as number, end: b as number })),
  ].filter((r) => r.end >= 0);
  return finish.some((a) => finish.some((b) => a.start < b.start && a.end > b.end));
}

export type EventInput = LiveEvent extends infer E ? (E extends LiveEvent ? Omit<E, 'seq'> : never) : never;

export function sanitizeEvent(raw: unknown, state: GameState, lineups: GameLineups, recorder: Side, rosterIds: Set<string>): EventInput | string {
  if (!raw || typeof raw !== 'object') return 'Invalid play.';
  const input = raw as Record<string, unknown>;
  switch (input.kind) {
    case 'game_start':
    case 'game_end':
    case 'end_half':
      return { kind: input.kind };
    case 'pitch':
      return PITCH_RESULTS.includes(input.result as PitchResult) ? { kind: 'pitch', result: input.result as PitchResult } : 'Unknown pitch.';
    case 'plate_appearance': {
      if (!PLATE_RESULTS.includes(input.result as PlateResult)) return 'Unknown result.';
      if (!Array.isArray(input.moves) || input.moves.length > 4) return 'Invalid runner moves.';
      const moves: RunnerMove[] = [];
      for (const m of input.moves as Record<string, unknown>[]) {
        if (!(m?.from === 'batter' || isBase(m?.from)) || !isDestination(m?.to)) return 'Invalid runner moves.';
        if (isBase(m.from) && !state.bases[m.from - 1]) return 'There’s no runner on that base.';
        moves.push({ from: m.from as Base | 'batter', to: m.to });
      }
      if (moves.filter((m) => m.from === 'batter').length !== 1) return 'Say where the batter ended up.';
      if (new Set(moves.map((m) => m.from)).size !== moves.length) return 'Each runner can only move once.';
      const landed = moves.filter((m) => isBase(m.to)).map((m) => m.to);
      // Runners who didn't move keep their base.
      const held = ([1, 2, 3] as Base[]).filter((b) => state.bases[b - 1] && !moves.some((m) => m.from === b));
      if (new Set([...landed, ...held]).size !== landed.length + held.length) return 'Two runners can’t end up on the same base.';
      if (runnersPass(moves, held)) return 'A runner can’t pass the runner ahead of them.';
      const rbi = input.rbi === undefined ? undefined : Number(input.rbi);
      if (rbi !== undefined && (!Number.isInteger(rbi) || rbi < 0 || rbi > 4)) return 'RBIs must be 0–4.';
      return { kind: 'plate_appearance', result: input.result as PlateResult, moves, ...(rbi !== undefined ? { rbi } : {}) };
    }
    case 'runner': {
      if (!RUNNER_PLAYS.includes(input.play as RunnerPlay) || !isBase(input.from) || !isDestination(input.to)) return 'Invalid runner play.';
      if (!state.bases[input.from - 1]) return 'There’s no runner on that base.';
      if (isBase(input.to) && (input.to <= input.from || state.bases[input.to - 1])) return 'That base isn’t open.';
      return { kind: 'runner', play: input.play as RunnerPlay, from: input.from, to: input.to };
    }
    case 'pitching_change': {
      if (typeof input.pitcherId !== 'string' || !rosterIds.has(input.pitcherId)) return 'Pick a pitcher from your roster.';
      return { kind: 'pitching_change', side: recorder, pitcherId: input.pitcherId };
    }
    case 'substitution': {
      const order = Number(input.battingOrder);
      if (!lineups[recorder].some((s) => s.battingOrder === order)) return 'Pick a spot in your batting order.';
      if (typeof input.playerId !== 'string' || !rosterIds.has(input.playerId)) return 'Pick a player from your roster.';
      return { kind: 'substitution', side: recorder, battingOrder: order, playerId: input.playerId };
    }
    default:
      return 'Unknown play.';
  }
}
