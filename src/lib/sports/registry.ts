// Which sports can be tracked live, and how.
//
// A sport in the `sports` table with no engine here still works perfectly
// well: schedules, rosters, final scores, standings and season stats all run
// off generic tables. What it can't do is pitch-by-pitch / possession-by-
// possession live tracking. That is the one thing a sport module adds, and
// it's why basketball can ship as a row today and gain live tracking later
// without a migration.

import { createBaseballEngine } from './baseball/adapter';
import type { SportEngine } from './types';

export type EngineFactory = (homeTeamId: string) => SportEngine;

const ENGINES: Record<string, EngineFactory> = {
  baseball: createBaseballEngine,
  // Softball scores identically; same engine, different label on the row.
  softball: createBaseballEngine,
};

export function engineFor(sportKey: string | null | undefined, homeTeamId: string): SportEngine | null {
  if (!sportKey) return null;
  const factory = ENGINES[sportKey];
  return factory ? factory(homeTeamId) : null;
}

export const supportsLiveTracking = (sportKey: string | null | undefined): boolean =>
  Boolean(sportKey && sportKey in ENGINES);

export const liveTrackedSports = (): string[] => Object.keys(ENGINES);
