// Baseball as a SportEngine.
//
// engine.ts is the real logic and is deliberately untouched by this file --
// it was lifted whole, tests and all, and rewriting it to fit an interface
// would have thrown away the thing most worth keeping. This adapter is the
// thin translation layer: generic shapes in, baseball's own shapes out, and
// back again.

import type {
  EnginePlayer,
  ReplayOutput,
  SportEngine,
  StoredEvent,
} from '../types';
import {
  battingSide,
  deriveStats,
  inningsPitched,
  replay as replayBaseball,
  sanitizeEvent,
  type GameLineups,
  type LineupSlot,
  type LiveEvent,
  type Side,
} from './engine';

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
const ordinal = (n: number) => ORDINALS[n - 1] ?? `${n}th`;

/** Every stat key the baseball catalog can hold. */
const BASEBALL_STAT_KEYS = [
  'ab', 'h', 'r', 'rbi', 'bb', 'k', 'sb',
  'ip', 'er', 'k_pitching', 'bb_pitching', 'h_allowed',
];

function toLineups(players: EnginePlayer[], homeTeamId: string): GameLineups {
  const slot = (p: EnginePlayer): LineupSlot => ({
    battingOrder: p.order ?? 0,
    playerId: p.id,
    position: p.position,
  });
  return {
    home: players.filter((p) => p.teamId === homeTeamId).map(slot),
    away: players.filter((p) => p.teamId !== homeTeamId).map(slot),
  };
}

/**
 * Rebuild the baseball event union from a stored row. A row whose payload
 * doesn't match its kind is dropped rather than thrown on -- replay has to be
 * total, and one bad row should cost one play, not the whole game view.
 */
function toLiveEvent(e: StoredEvent): LiveEvent | null {
  const p = e.payload as Record<string, never>;
  switch (e.kind) {
    case 'game_start':
    case 'end_half':
    case 'game_end':
      return { seq: e.seq, kind: e.kind };
    case 'pitch':
      return p.result ? { seq: e.seq, kind: 'pitch', result: p.result } : null;
    case 'plate_appearance':
      return p.result && Array.isArray(p.moves)
        ? { seq: e.seq, kind: 'plate_appearance', result: p.result, moves: p.moves, rbi: p.rbi }
        : null;
    case 'runner':
      return p.play && p.from && p.to
        ? { seq: e.seq, kind: 'runner', play: p.play, from: p.from, to: p.to }
        : null;
    case 'pitching_change':
      return p.side && p.pitcherId
        ? { seq: e.seq, kind: 'pitching_change', side: p.side, pitcherId: p.pitcherId }
        : null;
    case 'substitution':
      return p.side && p.playerId
        ? { seq: e.seq, kind: 'substitution', side: p.side, battingOrder: Number(p.battingOrder), playerId: p.playerId }
        : null;
    default:
      return null;
  }
}

export function createBaseballEngine(homeTeamId: string): SportEngine {
  const run = (events: StoredEvent[], players: EnginePlayer[]) => {
    const lineups = toLineups(players, homeTeamId);
    const live = events.map(toLiveEvent).filter((e): e is LiveEvent => e !== null);
    return { lineups, result: replayBaseball(live, lineups) };
  };

  return {
    key: 'baseball',
    label: 'Baseball',

    replay(events, players): ReplayOutput {
      const { result } = run(events, players);
      const { state, stats } = result;

      const derived = deriveStats(stats, BASEBALL_STAT_KEYS);
      // The engine tracks outs pitched; the catalog stores innings.
      for (const [id, line] of stats) {
        const values = derived.get(id);
        if (values) values.ip = inningsPitched(line.outsPitched);
      }

      return {
        scoreboard: {
          status: state.status,
          score: state.score,
          period: state.inning,
          periodLabel:
            state.status === 'final'
              ? 'Final'
              : state.status === 'pregame'
                ? 'Pregame'
                : `${state.half === 'top' ? 'Top' : 'Bot'} ${ordinal(state.inning)}`,
          periodScores: state.lineScore,
          detail: {
            outs: state.outs,
            balls: state.balls,
            strikes: state.strikes,
            bases: state.bases,
            hits: state.hits,
            errors: state.errors,
            pitchCounts: state.pitchCounts,
          },
        },
        plays: state.plays.map((p) => ({
          seq: p.seq,
          period: p.inning,
          text: p.text,
          points: p.runs,
        })),
        stats: derived,
      };
    },

    sanitize(raw, events, players, recorder) {
      // Replay the real log here rather than accepting a state object from the
      // caller: this is the security boundary, so its view of the game has to
      // come from the stored events.
      const { lineups, result } = run(events, players);
      const state = result.state;
      const rosterIds = new Set(players.map((p) => p.id));
      const clean = sanitizeEvent(raw, state, lineups, recorder as Side, rosterIds);
      if (typeof clean === 'string') return clean;
      const { kind, ...payload } = clean;
      return { kind, payload: payload as Record<string, unknown> };
    },
  };
}

export { battingSide };
