// Evaluation day scoring (Will, 2026-10-04). Baseball: 1-10 on five skills,
// notes, and a "save player" heart, per coach per player. Pure and tested;
// the pages and (later) the draft's auto-pick both rank from here.

export const EVAL_SKILLS = ['hitting', 'catching', 'throwing', 'fielding', 'iq'] as const;
export type EvalSkill = (typeof EVAL_SKILLS)[number];
export const EVAL_SKILL_LABEL: Record<EvalSkill, string> = { hitting: 'Hitting', catching: 'Catching', throwing: 'Throwing', fielding: 'Fielding', iq: 'IQ' };
export const EVAL_MAX = 10;

export type EvalScores = Record<EvalSkill, number | null>;

export interface Evaluation extends EvalScores {
  registrationId: string;
  coachId: string;
  coachName: string;
  notes: string | null;
  saved: boolean;
}

export const EMPTY_SCORES: EvalScores = { hitting: null, catching: null, throwing: null, fielding: null, iq: null };

export function isValidScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= EVAL_MAX;
}

// One coach's overall for a player: the mean of the skills they scored.
// null when they scored nothing (a heart or a note alone isn't a score).
export function overallOf(scores: EvalScores): number | null {
  const given = EVAL_SKILLS.map((s) => scores[s]).filter((v): v is number => v != null);
  return given.length ? given.reduce((a, b) => a + b, 0) / given.length : null;
}

export interface PlayerEvalSummary {
  registrationId: string;
  evaluators: number; // coaches who scored at least one skill
  hearts: number;
  skills: Record<EvalSkill, number | null>; // average across coaches
  overall: number | null; // average of the coaches' overalls
}

// Everyone's scores for one player rolled up: per-skill averages and an
// overall that weighs each coach equally.
export function summarizePlayer(registrationId: string, evals: Evaluation[]): PlayerEvalSummary {
  const mine = evals.filter((e) => e.registrationId === registrationId);
  const overalls = mine.map(overallOf).filter((v): v is number => v != null);
  const skills = Object.fromEntries(
    EVAL_SKILLS.map((skill) => {
      const given = mine.map((e) => e[skill]).filter((v): v is number => v != null);
      return [skill, given.length ? given.reduce((a, b) => a + b, 0) / given.length : null];
    }),
  ) as Record<EvalSkill, number | null>;
  return {
    registrationId,
    evaluators: overalls.length,
    hearts: mine.filter((e) => e.saved).length,
    skills,
    overall: overalls.length ? overalls.reduce((a, b) => a + b, 0) / overalls.length : null,
  };
}

// Highest overall first; unscored players last, in their original order.
export function rankByOverall<T extends { overall: number | null }>(rows: T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => (b.row.overall ?? -1) - (a.row.overall ?? -1) || a.index - b.index)
    .map((x) => x.row);
}

// "7.4", "8", or an em dash for nothing yet.
export function scoreLabel(value: number | null): string {
  if (value == null) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// Which coaches' evaluations a coach may read: their own, plus every coach
// who shares a team with them in this league ("coaches on the same team can
// see how they each scored kids").
export function visibleCoachIds(myCoachId: string, teams: { coachIds: string[] }[]): string[] {
  const ids = new Set<string>([myCoachId]);
  for (const team of teams) if (team.coachIds.includes(myCoachId)) for (const id of team.coachIds) ids.add(id);
  return [...ids];
}
