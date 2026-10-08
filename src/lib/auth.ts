// Who the caller is, and what they may do in a given organization.
//
// This replaces MCParksConnect's src/lib/auth.ts, which asked questions like
// `isDirectorOfBranch('rec')` and read tiers off a municipal HR table. Those
// made sense for one city's staff; they say nothing about a league in another
// state. Here there is one ladder, defined in 0001_tenancy.sql, and every
// check is "this user, in THIS organization, at or above THIS rank."
//
// Nothing here is a substitute for RLS. Every policy in the schema enforces
// the same rules independently, so a missed check in application code is a
// bug, not a breach. These helpers exist to fail early with a good message
// and to decide what to render -- not to be the only thing standing between a
// league and someone else's data.

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export const ORG_ROLES = ['member', 'coach', 'league_manager', 'admin', 'owner'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

const RANK: Record<OrgRole, number> = {
  member: 10,
  coach: 20,
  league_manager: 30,
  admin: 40,
  owner: 50,
};

export const atLeast = (held: OrgRole, needed: OrgRole): boolean => RANK[held] >= RANK[needed];

export interface Membership {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: OrgRole;
}

/**
 * The signed-in user's id, or null. `cache` dedupes this across one render --
 * a page and its nested components all asking "who is this?" costs one call.
 */
export const currentUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
});

/**
 * Every organization the caller belongs to. Drives the org switcher.
 *
 * Two queries rather than one embedded join. The join reads better, but it
 * makes the return type depend on generated relationship metadata, which is
 * exactly the kind of coupling that silently degrades to `never` when the
 * types are stale. RLS already limits both queries to the caller's own rows,
 * so the second one costs a round trip and nothing else.
 */
export const myMemberships = cache(async (): Promise<Membership[]> => {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from('memberships')
    .select('role, organization_id')
    .not('accepted_at', 'is', null);

  if (error || !rows || rows.length === 0) return [];

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .in('id', rows.map((r) => r.organization_id));

  const byId = new Map((orgs ?? []).map((o) => [o.id, o]));

  return rows.flatMap((row): Membership[] => {
    const org = byId.get(row.organization_id);
    if (!org) return [];
    return [{
      organizationId: org.id,
      organizationName: org.name,
      organizationSlug: org.slug,
      role: row.role as OrgRole,
    }];
  });
});

/** The caller's membership in one org, by slug. Null if they aren't in it. */
export async function membershipFor(orgSlug: string): Promise<Membership | null> {
  const all = await myMemberships();
  return all.find((m) => m.organizationSlug === orgSlug) ?? null;
}

export async function hasOrgRole(orgSlug: string, needed: OrgRole): Promise<boolean> {
  const membership = await membershipFor(orgSlug);
  return membership ? atLeast(membership.role, needed) : false;
}

/**
 * Throws unless the caller holds `needed` or better in this org.
 *
 * Deliberately gives the same message for "you aren't in this org" and "you
 * are, but not at that level" -- distinguishing them would tell a stranger
 * which league slugs exist.
 */
export async function assertOrgRole(orgSlug: string, needed: OrgRole): Promise<Membership> {
  const membership = await membershipFor(orgSlug);
  if (!membership || !atLeast(membership.role, needed)) {
    throw new Error('You don’t have access to that.');
  }
  return membership;
}

/**
 * Scoped grants, which the ladder deliberately doesn't cover. A head coach is
 * a `coach` org-wide, but may only touch their own team -- so the question is
 * never "is this person a coach" but "does this person coach THIS team."
 */
export async function coachesTeam(teamId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('team_coaches')
    .select('id')
    .eq('team_id', teamId)
    .maybeSingle();
  return Boolean(data);
}

/** Same idea for the parent in the stands keeping the book for one game. */
export async function keepsScoreFor(sessionId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('game_scorekeepers')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();
  return Boolean(data);
}
