'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { safeAction } from '@/lib/safe-action';
import { assertOrgRole, currentUserId, ORG_ROLES, type OrgRole } from '@/lib/auth';
import { getOrgBySlug } from '@/lib/org-data';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invite someone into a league with a role.
 *
 * Admin and above. A `league_manager` can run a season but cannot hand out
 * authority -- otherwise the ladder has a rung that climbs itself.
 */
async function _inviteToOrg(orgSlug: string, formData: FormData): Promise<{ email: string }> {
  const membership = await assertOrgRole(orgSlug, 'admin');

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const role = String(formData.get('role') ?? 'member') as OrgRole;

  if (!EMAIL.test(email)) throw new Error('That doesn’t look like an email address.');
  if (!ORG_ROLES.includes(role)) throw new Error('Pick a role.');

  // Nobody invites someone above their own level. An admin inviting an owner
  // would be a promotion they can't otherwise grant themselves.
  if (role === 'owner' && membership.role !== 'owner') {
    throw new Error('Only the league’s owner can add another owner.');
  }

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const supabase = await createClient();
  const userId = await currentUserId();

  // A fresh invite supersedes an outstanding one: the unique index allows a
  // single live invitation per email, so withdraw the old before writing.
  await supabase
    .from('invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('organization_id', org.id)
    .eq('email', email)
    .is('team_id', null)
    .is('accepted_at', null)
    .is('revoked_at', null);

  const { error } = await supabase.from('invitations').insert({
    organization_id: org.id,
    email,
    role,
    invited_by: userId,
  });

  if (error) throw new Error('Couldn’t create that invitation.');

  revalidatePath(`/manage/${orgSlug}/people`);
  return { email };
}

async function _revokeInvitation(orgSlug: string, invitationId: string): Promise<{ ok: true }> {
  await assertOrgRole(orgSlug, 'admin');

  const supabase = await createClient();
  const { error } = await supabase
    .from('invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId)
    .is('accepted_at', null);

  if (error) throw new Error('Couldn’t withdraw that invitation.');

  revalidatePath(`/manage/${orgSlug}/people`);
  return { ok: true };
}

/**
 * Change someone's role.
 *
 * Two guards beyond the RLS policy: an admin cannot mint an owner, and the
 * last owner cannot be demoted. A league with no owner is a league nobody can
 * transfer, bill or delete.
 */
async function _changeRole(
  orgSlug: string,
  userId: string,
  role: OrgRole,
): Promise<{ ok: true }> {
  const me = await assertOrgRole(orgSlug, 'admin');
  if (!ORG_ROLES.includes(role)) throw new Error('Pick a role.');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const supabase = await createClient();

  const { data: target } = await supabase
    .from('memberships')
    .select('role')
    .eq('organization_id', org.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!target) throw new Error('That person isn’t in this league.');

  if ((role === 'owner' || target.role === 'owner') && me.role !== 'owner') {
    throw new Error('Only the league’s owner can change an owner.');
  }

  if (target.role === 'owner' && role !== 'owner') {
    const { count } = await supabase
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .eq('role', 'owner');

    if ((count ?? 0) <= 1) {
      throw new Error('A league needs an owner. Make someone else the owner first.');
    }
  }

  const { error } = await supabase
    .from('memberships')
    .update({ role })
    .eq('organization_id', org.id)
    .eq('user_id', userId);

  if (error) throw new Error('Couldn’t change that role.');

  revalidatePath(`/manage/${orgSlug}/people`);
  return { ok: true };
}

/** Redeem an invitation token and land in the league. */
async function _acceptInvitation(token: string): Promise<never> {
  const supabase = await createClient();
  const { data: slug, error } = await supabase.rpc('accept_invitation', {
    invite_token: token,
  });

  // The function raises with messages written for the invitee, so pass them
  // through rather than flattening to "something went wrong".
  if (error) throw new Error(error.message || 'That invitation couldn’t be accepted.');
  if (!slug) throw new Error('That invitation couldn’t be accepted.');

  redirect(`/l/${slug}`);
}

export const inviteToOrg = safeAction(_inviteToOrg);
export const revokeInvitation = safeAction(_revokeInvitation);
export const changeRole = safeAction(_changeRole);
export const acceptInvitation = safeAction(_acceptInvitation);
