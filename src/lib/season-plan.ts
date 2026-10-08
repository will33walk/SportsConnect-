// Turning a round-robin into actual dates and times.
//
// `generateRoundRobinRounds` in schedule.ts answers "who plays whom", which
// is pure combinatorics. This answers "when and where", which is where the
// real constraints of a rec league live: you have the diamond on Tuesdays and
// Thursdays from six, you have two fields, and the season has to be done
// before school starts.
//
// Pure and synchronous so it can be tested without a database, and so the
// season screen can show a league what it is about to create before it
// creates it. Nothing here writes anything.

import { generateRoundRobinRounds } from './schedule';

export interface SeasonPlanInput {
  teamIds: string[];
  /** First date games can be played, as YYYY-MM-DD in the league's zone. */
  startDate: string;
  /** 0 = Sunday ... 6 = Saturday. The nights this league has the field. */
  weekdays: number[];
  /** Start times in 24h "HH:MM", in order. One game per slot per location. */
  gameTimes: string[];
  /** Field or court names. Two fields doubles how many games fit a night. */
  locations: string[];
  /** How many times each team plays each other team. */
  timesThrough: number;
}

export interface PlannedGame {
  homeTeamId: string;
  awayTeamId: string;
  /** "YYYY-MM-DDTHH:MM" — local to the league, no zone suffix. The caller
   *  attaches the league's timezone when it writes the row, because only it
   *  knows whether that date falls in daylight time. */
  localStart: string;
  locationName: string;
  roundLabel: string;
}

export interface SeasonPlan {
  games: PlannedGame[];
  /** Dates used, for a "your season runs Apr 14 – Jun 9" summary. */
  dates: string[];
  /** Set when the plan had to stop early, so the UI can say why. */
  warning?: string;
}

const MAX_WEEKS = 60;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/**
 * The next `count` dates on or after `from` that fall on one of `weekdays`.
 * Bounded by MAX_WEEKS so a caller passing an empty weekday list gets an
 * empty result instead of an infinite loop.
 */
function gameDates(from: string, weekdays: number[], count: number): string[] {
  if (weekdays.length === 0 || count <= 0) return [];
  const wanted = new Set(weekdays);
  const out: string[] = [];
  let cursor = from;

  for (let i = 0; i < MAX_WEEKS * 7 && out.length < count; i++) {
    if (wanted.has(weekdayOf(cursor))) out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/**
 * Lay a round-robin out across the nights a league actually has.
 *
 * One round per game night, which is what keeps "every team plays once a
 * week" true. If a round has more games than the night has slots -- more
 * teams than (times x fields) can hold -- the overflow moves to the next
 * night rather than being dropped, and the plan says so.
 */
export function planSeason(input: SeasonPlanInput): SeasonPlan {
  const { teamIds, startDate, weekdays, gameTimes, locations, timesThrough } = input;

  if (teamIds.length < 2) {
    return { games: [], dates: [], warning: 'Add at least two teams first.' };
  }
  if (weekdays.length === 0) {
    return { games: [], dates: [], warning: 'Pick at least one night to play.' };
  }
  if (gameTimes.length === 0 || locations.length === 0) {
    return { games: [], dates: [], warning: 'Add at least one start time and one field.' };
  }

  // Slots available on a single night.
  const slotsPerNight: { time: string; location: string }[] = [];
  for (const time of gameTimes) {
    for (const location of locations) slotsPerNight.push({ time, location });
  }

  const base = generateRoundRobinRounds(teamIds);

  // Going round twice swaps home and away the second time, so the same team
  // isn't always the home side against a given opponent.
  const rounds: [string, string][][] = [];
  for (let pass = 0; pass < Math.max(1, timesThrough); pass++) {
    for (const round of base) {
      rounds.push(pass % 2 === 0 ? round : round.map(([h, a]) => [a, h] as [string, string]));
    }
  }

  const games: PlannedGame[] = [];
  const used: string[] = [];
  let warning: string | undefined;

  // Enough nights for every round, plus room for overflow.
  const nightsNeeded = rounds.reduce(
    (n, round) => n + Math.ceil(round.length / slotsPerNight.length),
    0,
  );
  const nights = gameDates(startDate, weekdays, nightsNeeded);

  if (nights.length < nightsNeeded) {
    warning = 'The season needs more dates than a year of those nights holds.';
  }

  let night = 0;
  rounds.forEach((round, roundIndex) => {
    let slot = 0;
    for (const [homeTeamId, awayTeamId] of round) {
      if (slot >= slotsPerNight.length) {
        // This round outgrew one night. Spill to the next rather than drop.
        night += 1;
        slot = 0;
      }
      const date = nights[night];
      if (!date) {
        warning ??= 'Ran out of dates before the season was complete.';
        return;
      }
      const { time, location } = slotsPerNight[slot];
      games.push({
        homeTeamId,
        awayTeamId,
        localStart: `${date}T${time}`,
        locationName: location,
        roundLabel: `Week ${roundIndex + 1}`,
      });
      if (!used.includes(date)) used.push(date);
      slot += 1;
    }
    night += 1;
  });

  return { games, dates: used, warning };
}
