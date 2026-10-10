'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { safeAction } from '@/lib/safe-action';
import { assertOrgRole } from '@/lib/auth';
import { getOrgBySlug } from '@/lib/org-data';

export type BlastScope = 'organization' | 'program' | 'teams';

/**
 * How many people a blast would reach, before it's sent.
 *
 * Shown next to the Send button because "this goes to 212 people" is the only
 * thing that makes someone re-read what they typed. Uses the same database
 * function the send does, so the number shown is the number reached.
 */
async function _previewAudience(
  orgSlug: string,
  scope: BlastScope,
  programId: string | null,
  teamIds: string[],
): Promise<{ count: number }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('announcement_audience', {
    p_organization_id: org.id,
    p_scope: scope,
    p_program_id: scope === 'program' ? programId : null,
    p_team_ids: scope === 'teams' ? teamIds : [],
  });

  if (error) throw new Error('Couldn’t work out who that reaches.');

  // The function returns one row per recipient; it already de-duplicates
  // someone who is both a coach and a parent in the same league.
  return { count: Array.isArray(data) ? data.length : 0 };
}

/**
 * Send it.
 *
 * Everything — the record, the targets, and a notification per recipient —
 * happens in one database function, so a failure partway through can't leave
 * a blast that reached half a league.
 */
async function _sendAnnouncement(
  orgSlug: string,
  formData: FormData,
): Promise<{ recipients: number }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const scope = String(formData.get('scope') ?? '') as BlastScope;
  const programId = String(formData.get('program_id') ?? '').trim() || null;
  const teamIds = formData.getAll('team_ids').map(String).filter(Boolean);
  const subject = String(formData.get('subject') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();

  if (!['organization', 'program', 'teams'].includes(scope)) {
    throw new Error('Choose who this goes to.');
  }
  if (!subject) throw new Error('Give it a subject.');
  if (subject.length > 160) throw new Error('Keep the subject under 160 characters.');
  if (!body) throw new Error('Write a message.');
  if (body.length > 8000) throw new Error('That message is too long.');
  if (scope === 'program' && !programId) throw new Error('Choose a season or division.');
  if (scope === 'teams' && teamIds.length === 0) throw new Error('Pick at least one team.');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('send_announcement', {
    p_organization_id: org.id,
    p_scope: scope,
    p_program_id: scope === 'program' ? programId : null,
    p_team_ids: scope === 'teams' ? teamIds : [],
    p_subject: subject,
    p_body: body,
  });

  // The function raises with messages written for the sender -- a season from
  // another league, a team that isn't theirs -- so pass them through.
  if (error) throw new Error(error.message || 'Couldn’t send that.');

  const row = Array.isArray(data) ? data[0] : null;

  revalidatePath(`/manage/${orgSlug}/messages`);
  return { recipients: row?.recipients ?? 0 };
}

export const previewAudience = safeAction(_previewAudience);
export const sendAnnouncement = safeAction(_sendAnnouncement);
