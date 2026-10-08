'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { safeAction } from '@/lib/safe-action';
import { assertOrgRole, currentUserId } from '@/lib/auth';
import { getOrgBySlug } from '@/lib/org-data';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Put a coach on a team.
 *
 * The clearance rule is enforced by a trigger in the database, not here. This
 * catches it first only so the message is a sentence rather than a Postgres
 * error -- if this check and the trigger ever disagree, the trigger wins, and
 * that is the correct way round.
 */
async function _assignCoach(
  orgSlug: string,
  teamId: string,
  userId: string,
  role: 'head' | 'assistant' | 'captain',
): Promise<{ ok: true }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const supabase = await createClient();

  const { data: cleared } = await supabase.rpc('is_coach_cleared', {
    org: org.id,
    coach: userId,
  });

  if (cleared === false) {
    throw new Error('That coach still has outstanding requirements.');
  }

  const { error } = await supabase.from('team_coaches').insert({
    team_id: teamId,
    organization_id: org.id,
    user_id: userId,
    role,
  });

  if (error) {
    // The trigger raises check_violation. Anything else is ours.
    if (error.code === '23514' || /requirements/i.test(error.message)) {
      throw new Error('That coach still has outstanding requirements.');
    }
    if (error.code === '23505') throw new Error('They’re already on this team.');
    throw new Error('Couldn’t assign that coach.');
  }

  revalidatePath(`/manage/${orgSlug}/teams/${teamId}`);
  return { ok: true };
}

async function _removeCoach(orgSlug: string, teamCoachId: string): Promise<{ ok: true }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const supabase = await createClient();
  const { error } = await supabase.from('team_coaches').delete().eq('id', teamCoachId);
  if (error) throw new Error('Couldn’t remove that coach.');

  revalidatePath(`/manage/${orgSlug}`);
  return { ok: true };
}

/**
 * Place a registered player on a team. The `assigned` model: the league puts
 * players where they go, usually balancing by age or school.
 */
async function _assignPlayer(
  orgSlug: string,
  teamId: string,
  registrationId: string,
): Promise<{ ok: true }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const supabase = await createClient();
  const { error } = await supabase.from('team_members').insert({
    team_id: teamId,
    organization_id: org.id,
    registration_id: registrationId,
    drafted_by: await currentUserId(),
  });

  if (error) {
    // registration_id is unique across team_members: one registration, one
    // team. A player already placed has to be moved, not added twice.
    if (error.code === '23505') throw new Error('That player is already on a team.');
    throw new Error('Couldn’t add that player.');
  }

  revalidatePath(`/manage/${orgSlug}/teams/${teamId}`);
  return { ok: true };
}

/**
 * A captain invites a player to their own team.
 *
 * The team_registration model: the captain paid for the team and brings their
 * own roster. The invitation carries no authority -- the RLS policy pins its
 * role to `member` -- so the worst case of a mistyped address is a stranger
 * joining a softball roster, not gaining any power in the league.
 */
async function _invitePlayer(
  orgSlug: string,
  teamId: string,
  formData: FormData,
): Promise<{ email: string }> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) throw new Error('That doesn’t look like an email address.');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const supabase = await createClient();

  // No assertOrgRole here on purpose: a captain is usually NOT a league
  // manager, so the ladder is the wrong question. The RLS policy on
  // invitations asks the right one -- manages_team() -- and refuses the
  // insert if this person doesn't run this team.
  const { error } = await supabase.from('invitations').insert({
    organization_id: org.id,
    team_id: teamId,
    email,
    role: 'member',
    invited_by: await currentUserId(),
  });

  if (error) {
    if (error.code === '23505') throw new Error('They already have an invitation to this team.');
    throw new Error('Couldn’t send that invitation.');
  }

  revalidatePath(`/manage/${orgSlug}/teams/${teamId}`);
  return { email };
}

/**
 * A captain writes a player onto the roster without an invitation -- the
 * teammate who doesn't do email. They get a name on the sheet now and can be
 * linked to a real account later if they ever make one.
 */
async function _addRosterName(
  orgSlug: string,
  teamId: string,
  formData: FormData,
): Promise<{ ok: true }> {
  const displayName = String(formData.get('display_name') ?? '').trim().slice(0, 80);
  if (!displayName) throw new Error('Enter a name.');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const supabase = await createClient();
  const { error } = await supabase.from('team_members').insert({
    team_id: teamId,
    organization_id: org.id,
    display_name: displayName,
    jersey_number: String(formData.get('jersey_number') ?? '').trim().slice(0, 4) || null,
  });

  if (error) throw new Error('Couldn’t add that player.');

  revalidatePath(`/manage/${orgSlug}/teams/${teamId}`);
  return { ok: true };
}

async function _removeRosterSpot(orgSlug: string, teamMemberId: string): Promise<{ ok: true }> {
  const supabase = await createClient();
  // Scoped by RLS: a captain may only delete from their own team, a league
  // manager from any team in their league.
  const { error } = await supabase.from('team_members').delete().eq('id', teamMemberId);
  if (error) throw new Error('Couldn’t remove that player.');

  revalidatePath(`/manage/${orgSlug}`);
  return { ok: true };
}

export const assignCoach = safeAction(_assignCoach);
export const removeCoach = safeAction(_removeCoach);
export const assignPlayer = safeAction(_assignPlayer);
export const invitePlayer = safeAction(_invitePlayer);
export const addRosterName = safeAction(_addRosterName);
export const removeRosterSpot = safeAction(_removeRosterSpot);
