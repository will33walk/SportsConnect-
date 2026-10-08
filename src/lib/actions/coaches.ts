'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { safeAction } from '@/lib/safe-action';
import { assertOrgRole, currentUserId } from '@/lib/auth';
import { getOrgBySlug } from '@/lib/org-data';

/**
 * Volunteer to coach.
 *
 * Applying is not clearance and does not grant anything. It creates a record
 * of someone asking, which the league reviews and which the vetting trail
 * hangs off. The RLS policy pins status to 'applied' on insert so this can't
 * be used to self-approve.
 */
async function _applyToCoach(orgSlug: string, formData: FormData): Promise<{ ok: true }> {
  const userId = await currentUserId();
  if (!userId) throw new Error('Sign in to apply.');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const experience = String(formData.get('experience') ?? '').trim().slice(0, 4000);
  const phone = String(formData.get('phone') ?? '').trim().slice(0, 40);

  const supabase = await createClient();

  // Joining the league as a plain member is part of applying -- someone who
  // found the apply page from a flyer has no membership yet, and the
  // application's own policy requires one.
  await supabase
    .from('memberships')
    .upsert(
      {
        organization_id: org.id,
        user_id: userId,
        role: 'member',
        accepted_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,user_id', ignoreDuplicates: true },
    );

  const { error } = await supabase.from('coach_applications').upsert(
    {
      organization_id: org.id,
      user_id: userId,
      experience: experience || null,
      phone: phone || null,
      status: 'applied',
    },
    { onConflict: 'organization_id,user_id' },
  );

  if (error) throw new Error('Couldn’t send that application.');

  revalidatePath(`/l/${orgSlug}/coach`);
  return { ok: true };
}

/** Approve or decline an application. Does NOT clear anyone to coach. */
async function _decideApplication(
  orgSlug: string,
  userId: string,
  decision: 'approved' | 'declined',
  note?: string,
): Promise<{ ok: true }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const supabase = await createClient();
  const me = await currentUserId();

  const { error } = await supabase
    .from('coach_applications')
    .update({
      status: decision,
      decided_by: me,
      decided_at: new Date().toISOString(),
      decision_note: note?.slice(0, 2000) || null,
    })
    .eq('organization_id', org.id)
    .eq('user_id', userId);

  if (error) throw new Error('Couldn’t record that decision.');

  // An approved coach gets the `coach` role, which lets them see their own
  // teams. It is not clearance -- the trigger on team_coaches still refuses
  // to put them on a youth team until their requirements are satisfied.
  if (decision === 'approved') {
    await supabase
      .from('memberships')
      .update({ role: 'coach' })
      .eq('organization_id', org.id)
      .eq('user_id', userId)
      .eq('role', 'member');
  }

  revalidatePath(`/manage/${orgSlug}/coaches`);
  return { ok: true };
}

/**
 * Record that a coach satisfied one of the league's requirements.
 *
 * This is a league staff member attesting to something that happened
 * elsewhere -- a background check they ran with their own provider, a
 * concussion course, a signed code of conduct. The product is the system of
 * record, not the checker.
 */
async function _recordCompletion(
  orgSlug: string,
  userId: string,
  requirementId: string,
  completedOn: string,
): Promise<{ ok: true }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(completedOn)) throw new Error('Pick a date.');
  // A completion dated in the future would clear someone today for something
  // that hasn't happened.
  if (completedOn > new Date().toISOString().slice(0, 10)) {
    throw new Error('That date is in the future.');
  }

  const supabase = await createClient();
  const me = await currentUserId();

  const { error } = await supabase.from('coach_requirement_completions').upsert(
    {
      requirement_id: requirementId,
      organization_id: org.id,
      user_id: userId,
      completed_on: completedOn,
      confirmed_by: me,
    },
    { onConflict: 'requirement_id,user_id,completed_on' },
  );

  if (error) throw new Error('Couldn’t record that.');

  revalidatePath(`/manage/${orgSlug}/coaches/${userId}`);
  return { ok: true };
}

/** Undo a recorded completion — a staff member attested to the wrong person. */
async function _removeCompletion(orgSlug: string, completionId: string): Promise<{ ok: true }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const supabase = await createClient();
  const { error } = await supabase
    .from('coach_requirement_completions')
    .delete()
    .eq('id', completionId);

  if (error) throw new Error('Couldn’t remove that.');

  revalidatePath(`/manage/${orgSlug}/coaches`);
  return { ok: true };
}

export const applyToCoach = safeAction(_applyToCoach);
export const decideApplication = safeAction(_decideApplication);
export const recordCompletion = safeAction(_recordCompletion);
export const removeCompletion = safeAction(_removeCompletion);
