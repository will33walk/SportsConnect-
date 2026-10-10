// The two plans, in one place.
//
// League is $35/month and runs one season at a time. Unlimited is $75/month
// and runs as many as a league likes, plus divisions grouped under a parent —
// T-ball through 14u under MCYBL, age groups under a Pop Warner program.
//
// The limit itself is enforced by a trigger in 0009_plans_divisions_blasts.sql,
// not here. What this module owns is the words: what each plan includes, and
// what to say when someone hits the ceiling. That copy is the most valuable
// text in the product — it's read at the exact moment somebody decides whether
// $40 more a month is worth it — so it lives somewhere deliberate rather than
// scattered through a dozen catch blocks.

export type Plan = 'league' | 'unlimited';

export interface PlanInfo {
  key: Plan;
  name: string;
  monthlyCents: number;
  /** One line under the price. */
  tagline: string;
  /** What this plan gives you, in a league director's words. */
  includes: string[];
}

export const PLANS: Record<Plan, PlanInfo> = {
  league: {
    key: 'league',
    name: 'League',
    monthlyCents: 3500,
    tagline: 'One season at a time.',
    includes: [
      'One season running at a time — finish spring, archive it, start fall at no extra cost',
      'Unlimited teams, players and coaches in that season',
      'Registration, payments, rosters, schedules, live scores and season stats',
      'Message your whole season or individual teams',
      'Your own colours and your league on families’ home screens',
      'No cut of your registration money, ever',
    ],
  },
  unlimited: {
    key: 'unlimited',
    name: 'Unlimited',
    monthlyCents: 7500,
    tagline: 'Every season and division, together.',
    includes: [
      'As many seasons as you want, running side by side',
      'Divisions under one parent league — T-ball, 8u, 11u and 14u under MCYBL, or age groups under a Pop Warner program',
      'Each division keeps its own teams, schedule, registration and roster rules',
      'One blast to the entire league, or to a single division, or to picked teams',
      'Families with kids in two divisions see both in one place',
      'Everything in League, and still no cut of your registration money',
    ],
  },
};

/** Whole dollars — plan prices are never $35.50. Distinct from quote.ts's
 *  money(), which formats registration amounts to the cent. */
export const planPrice = (cents: number): string => `$${Math.round(cents / 100)}`;

/**
 * Is this the plan trigger refusing, rather than something else going wrong?
 *
 * The database raises `check_violation` with copy written for the league
 * director, so the right thing to do with one of these is show it, not
 * replace it with "something went wrong". This recognises them so callers can
 * pair the message with an upgrade link.
 */
export function isPlanLimit(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23514') return true;
  return /League plan|part of Unlimited/i.test(error.message ?? '');
}

/** What the upgrade button should say next to a plan-limit message. */
export const UPGRADE_CTA = 'See Unlimited';
