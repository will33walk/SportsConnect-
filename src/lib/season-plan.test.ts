import { describe, expect, it } from 'vitest';
import { planSeason, type SeasonPlanInput } from './season-plan';

// 2027-04-06 is a Tuesday.
const base: SeasonPlanInput = {
  teamIds: ['a', 'b', 'c', 'd'],
  startDate: '2027-04-06',
  weekdays: [2], // Tuesdays
  gameTimes: ['18:00', '19:30'],
  locations: ['Field 1'],
  timesThrough: 1,
};

const dateOf = (localStart: string) => localStart.slice(0, 10);

describe('planSeason', () => {
  it('plays every pair exactly once in a single round-robin', () => {
    const { games } = planSeason(base);
    expect(games).toHaveLength(6); // 4 teams choose 2

    const pairs = games.map((g) => [g.homeTeamId, g.awayTeamId].sort().join('-')).sort();
    expect(new Set(pairs).size).toBe(6);
  });

  it('gives each team exactly one game per night', () => {
    const { games } = planSeason(base);
    const byDate = new Map<string, string[]>();
    for (const g of games) {
      const list = byDate.get(dateOf(g.localStart)) ?? [];
      list.push(g.homeTeamId, g.awayTeamId);
      byDate.set(dateOf(g.localStart), list);
    }
    for (const teams of byDate.values()) {
      expect(new Set(teams).size).toBe(teams.length);
    }
  });

  it('only uses the weekdays it was given', () => {
    const { games } = planSeason({ ...base, weekdays: [2, 4] });
    for (const g of games) {
      const day = new Date(`${dateOf(g.localStart)}T00:00:00Z`).getUTCDay();
      expect([2, 4]).toContain(day);
    }
  });

  it('spills a round onto the next night rather than dropping games', () => {
    // 8 teams = 4 games a round, but only 2 slots a night.
    const { games, warning } = planSeason({
      ...base,
      teamIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    });
    expect(games).toHaveLength(28); // 8 choose 2
    expect(warning).toBeUndefined();
  });

  it('finishes sooner with a second field, when a round outgrows one night', () => {
    // 8 teams means 4 games a round. On one field with two start times that
    // takes two nights; on two fields it fits in one.
    const eight = { ...base, teamIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] };
    const nights = (p: ReturnType<typeof planSeason>) =>
      new Set(p.games.map((g) => dateOf(g.localStart))).size;

    expect(nights(planSeason(eight))).toBe(14);
    expect(nights(planSeason({ ...eight, locations: ['Field 1', 'Field 2'] }))).toBe(7);
  });

  it('does NOT compress a round that already fits, however many fields there are', () => {
    // 4 teams is 2 games a round, which one night already holds. Extra fields
    // must not pull a second round forward -- that would have teams playing
    // twice in a night, which is the one thing the round structure exists to
    // prevent.
    const nights = (p: ReturnType<typeof planSeason>) =>
      new Set(p.games.map((g) => dateOf(g.localStart))).size;

    expect(nights(planSeason(base))).toBe(3);
    expect(nights(planSeason({ ...base, locations: ['Field 1', 'Field 2'] }))).toBe(3);
  });

  it('swaps home and away on the second time through', () => {
    const { games } = planSeason({ ...base, timesThrough: 2 });
    expect(games).toHaveLength(12);

    const firstMeeting = games[0];
    const rematch = games.find(
      (g) =>
        g !== firstMeeting &&
        g.homeTeamId === firstMeeting.awayTeamId &&
        g.awayTeamId === firstMeeting.homeTeamId,
    );
    expect(rematch).toBeDefined();
  });

  it('refuses rather than guessing when it has nothing to work with', () => {
    expect(planSeason({ ...base, teamIds: ['a'] }).warning).toBeTruthy();
    expect(planSeason({ ...base, weekdays: [] }).warning).toBeTruthy();
    expect(planSeason({ ...base, gameTimes: [] }).warning).toBeTruthy();
    expect(planSeason({ ...base, locations: [] }).warning).toBeTruthy();
  });

  it('never loops forever on an impossible weekday set', () => {
    const plan = planSeason({ ...base, weekdays: [2], teamIds: Array.from({ length: 30 }, (_, i) => `t${i}`) });
    expect(plan.warning).toBeTruthy();
  });

  it('reports the dates it used, in order, without duplicates', () => {
    const { dates } = planSeason(base);
    expect(dates).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(dates.length);
  });
});
