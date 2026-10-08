import { createClient } from '@/lib/supabase/server';
import type { OrgRole } from '@/lib/auth';

export interface Person {
  userId: string;
  name: string;
  email: string | null;
  role: OrgRole;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: OrgRole;
  token: string;
  expiresAt: string;
}

export interface CoachRow {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  experience: string | null;
  status: 'applied' | 'approved' | 'declined' | 'withdrawn';
  appliedAt: string;
  cleared: boolean;
  missingCount: number;
}

/**
 * Everyone in a league, with their role.
 *
 * Two queries and a join in memory rather than an embedded select, for the
 * same reason as myMemberships(): the embedded version's return type depends
 * on generated relationship metadata, and degrades to `never` when the types
 * are stale.
 */
export async function listPeople(orgId: string): Promise<Person[]> {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from('memberships')
    .select('user_id, role')
    .eq('organization_id', orgId)
    .not('accepted_at', 'is', null);

  if (!rows || rows.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', rows.map((r) => r.user_id));

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  return rows
    .map((r) => {
      const p = byId.get(r.user_id);
      return {
        userId: r.user_id,
        name: p?.full_name || p?.email || 'Someone',
        email: p?.email ?? null,
        role: r.role as OrgRole,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listPendingInvites(orgId: string): Promise<PendingInvite[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('invitations')
    .select('id, email, role, token, expires_at')
    .eq('organization_id', orgId)
    .is('team_id', null)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  return (data ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role as OrgRole,
    token: i.token,
    expiresAt: i.expires_at,
  }));
}

/** Coach applications with clearance state, from the coach_roster view. */
export async function listCoaches(orgId: string): Promise<CoachRow[]> {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from('coach_roster')
    .select('user_id, application_status, applied_at, experience, phone, cleared, missing_count')
    .eq('organization_id', orgId);

  if (!rows || rows.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', rows.map((r) => r.user_id));

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  return rows
    .map((r) => {
      const p = byId.get(r.user_id);
      return {
        userId: r.user_id,
        name: p?.full_name || p?.email || 'Someone',
        email: p?.email ?? null,
        phone: r.phone,
        experience: r.experience,
        status: r.application_status,
        appliedAt: r.applied_at,
        cleared: r.cleared,
        missingCount: r.missing_count,
      };
    })
    .sort((a, b) => {
      // Pending first: this list is a queue before it is a directory.
      if (a.status !== b.status) {
        if (a.status === 'applied') return -1;
        if (b.status === 'applied') return 1;
      }
      return a.name.localeCompare(b.name);
    });
}
