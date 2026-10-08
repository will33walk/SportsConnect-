import { describe, it, expect } from 'vitest';
import { generateRoundRobinRounds } from './schedule';

function allMatchups(rounds: [string, string][][]): [string, string][] {
  return rounds.flat();
}

describe('generateRoundRobinRounds', () => {
  it('gives every team exactly one game per round for an even team count', () => {
    const teams = ['A', 'B', 'C', 'D'];
    const rounds = generateRoundRobinRounds(teams);
    expect(rounds).toHaveLength(teams.length - 1); // 3 rounds for 4 teams
    for (const round of rounds) {
      const playing = round.flat();
      expect(playing).toHaveLength(teams.length); // every team plays, none idle
      expect(new Set(playing).size).toBe(teams.length); // no team plays twice in one round
    }
  });

  it('has every team face every other team exactly once (a full single round-robin)', () => {
    const teams = ['A', 'B', 'C', 'D', 'E', 'F'];
    const rounds = generateRoundRobinRounds(teams);
    const seenPairs = new Set<string>();
    for (const [a, b] of allMatchups(rounds)) {
      const key = [a, b].sort().join('-');
      expect(seenPairs.has(key)).toBe(false); // no repeated matchup
      seenPairs.add(key);
    }
    const expectedPairCount = (teams.length * (teams.length - 1)) / 2;
    expect(seenPairs.size).toBe(expectedPairCount);
  });

  it('gives an odd team count a bye each round instead of a double-booking', () => {
    const teams = ['A', 'B', 'C', 'D', 'E'];
    const rounds = generateRoundRobinRounds(teams);
    expect(rounds).toHaveLength(teams.length); // odd count pads to even, so n rounds not n-1
    for (const round of rounds) {
      // One team sits out each round (5 teams, 2 games = 4 players).
      expect(round).toHaveLength(2);
      const playing = round.flat();
      expect(new Set(playing).size).toBe(4);
    }
  });

  it('never schedules a team against itself', () => {
    const teams = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const rounds = generateRoundRobinRounds(teams);
    for (const [a, b] of allMatchups(rounds)) {
      expect(a).not.toBe(b);
    }
  });

  it('handles the smallest possible league (two teams) as a single game', () => {
    const rounds = generateRoundRobinRounds(['A', 'B']);
    expect(rounds).toEqual([[['A', 'B']]]);
  });
});
