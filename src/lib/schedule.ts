// Round-robin schedule math. Pure and synchronous, and deliberately not in a
// 'use server' file -- Next treats every export from one of those as a Server
// Action, which must be async, so scheduling logic kept there could not be
// called or tested directly.

// Standard round-robin "circle method": fix one team, rotate the rest
// around it for (n-1) rounds -- every round pairs each team with exactly
// one opponent (a bye if the team count is odd), which is exactly the
// "one game per team per round" property the season auto-scheduler's
// slot-filling step depends on to guarantee "one game per team per night".
export function generateRoundRobinRounds(teamIds: string[]): [string, string][][] {
  const BYE = '__bye__';
  const teams = teamIds.length % 2 === 0 ? [...teamIds] : [...teamIds, BYE];
  const n = teams.length;
  const rotating = teams.slice(1);
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const roundTeams = [teams[0], ...rotating];
    const round: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = roundTeams[i];
      const b = roundTeams[n - 1 - i];
      if (a !== BYE && b !== BYE) round.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(round);
    rotating.push(rotating.shift()!);
  }
  return rounds;
}
