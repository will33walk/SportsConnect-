// The contract every sport's live-tracking module implements.
//
// MCParksConnect had exactly one sport and no interface -- the baseball engine
// WAS the engine, and its vocabulary (pitches, innings, bases) leaked into the
// database and the UI. That is the single thing most worth not repeating here:
// adding basketball should be writing one module and one row in `sports`, not
// touching the schedule, the roster, the box score and the stat sheet again.
//
// What every sport shares, and therefore what lives here:
//   - a game is an append-only event log, replayed to derive everything
//   - undo is dropping the last event and replaying
//   - the server sanitizes untrusted input against the current state
//   - the result is a scoreboard, a running narrative, and per-player stats
//
// What no sport shares, and therefore what stays inside its own module: the
// event kinds, the notion of a period, and which stats exist at all.

/** A scoreboard that any sport can fill in and any UI can render. */
export interface ScoreboardState {
  status: 'pregame' | 'live' | 'final';
  score: { home: number; away: number };
  /** 1-based. An inning, quarter, set or half -- the sport's row says which. */
  period: number;
  /**
   * Short status line for the scoreboard chip: "Top 3rd", "Q2 4:11",
   * "Set 2 · 18-15". The sport owns the wording; callers just print it.
   */
  periodLabel: string;
  /** Runs/points in each period, for the line score. Index 0 = period 1. */
  periodScores: { home: number[]; away: number[] };
  /**
   * Sport-specific detail the generic scoreboard can show verbatim if it
   * wants to and ignore otherwise -- the count and baserunners in baseball,
   * team fouls in basketball, serve in volleyball.
   */
  detail?: Record<string, unknown>;
}

/** One line in the running play-by-play. */
export interface PlayLine {
  seq: number;
  period: number;
  text: string;
  /** Points or runs scored on this play, for highlighting. */
  points: number;
}

/** A stored event, as it comes back from `game_events`. */
export interface StoredEvent {
  seq: number;
  kind: string;
  teamId: string | null;
  payload: Record<string, unknown>;
}

/** One player in a game, as the engine needs them. */
export interface EnginePlayer {
  /** team_members.id */
  id: string;
  teamId: string;
  order: number | null;
  position: string | null;
}

export interface ReplayOutput {
  scoreboard: ScoreboardState;
  plays: PlayLine[];
  /** team_members.id -> { stat_categories.key: value } */
  stats: Map<string, Record<string, number>>;
}

export interface SportEngine {
  key: string;
  label: string;

  /**
   * Replay the whole log. Must be pure and total: a malformed or
   * out-of-order event is skipped, never thrown on, because a scorekeeper's
   * bad tap must not take down the public follow view.
   */
  replay(events: StoredEvent[], players: EnginePlayer[]): ReplayOutput;

  /**
   * Validate one untrusted event against the game as it currently stands.
   * Returns the clean payload to store, or a message to show the scorekeeper.
   * Everything arriving from a phone goes through here.
   *
   * Takes the raw log rather than a ReplayOutput on purpose: this is the
   * security boundary, so it derives current state from the events itself
   * instead of trusting a state object the caller passed in.
   */
  sanitize(
    raw: unknown,
    events: StoredEvent[],
    players: EnginePlayer[],
    recorder: 'home' | 'away',
  ): { kind: string; payload: Record<string, unknown> } | string;
}
