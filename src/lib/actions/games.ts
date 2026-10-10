'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { safeAction } from '@/lib/safe-action';
import { assertOrgRole } from '@/lib/auth';
import { getOrgBySlug } from '@/lib/org-data';
import { zonedToUtc } from '@/lib/timezone';

const STATUSES = ['scheduled', 'in_progress', 'final', 'cancelled', 'postponed'] as const;
type GameStatus = (typeof STATUSES)[number];

/**
 * Add one game by hand.
 *
 * The generator in seasons.ts builds a whole round-robin, which is right at
 * the start of a season and wrong for everything after it: a makeup game, a
 * cross-division scrimmage, a tournament bracket somebody worked out on paper,
 * the one Thursday a team plays twice. A league that can only accept a
 * generated schedule will keep its real one in a spreadsheet.
 *
 * Times are entered as wall clock at the field and resolved against the
 * league's own zone, same as the generator -- so a game at 6pm in March and
 * one at 6pm in July are both 6pm when you get there.
 */
async function _addGame(
  orgSlug: string,
  leagueId: string,
  formData: FormData,
): Promise<{ warning: string | null }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const homeTeamId = String(formData.get('home_team_id') ?? '').trim();
  const awayTeamId = String(formData.get('away_team_id') ?? '').trim();
  const date = String(formData.get('date') ?? '').trim();
  const time = String(formData.get('time') ?? '').trim();
  const locationName = String(formData.get('location_name') ?? '').trim();
  const roundLabel = String(formData.get('round_label') ?? '').trim();
  const sessionType = String(formData.get('session_type') ?? 'game');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Pick a date.');
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error('Pick a start time.');
  if (sessionType !== 'game' && sessionType !== 'practice') {
    throw new Error('Pick whether this is a game or a practice.');
  }

  // A practice has one team and no opponent; a game needs two different ones.
  if (sessionType === 'game') {
    if (!homeTeamId || !awayTeamId) throw new Error('Pick both teams.');
    if (homeTeamId === awayTeamId) throw new Error('A team can’t play itself.');
  } else if (!homeTeamId) {
    throw new Error('Pick the team practising.');
  }

  const supabase = await createClient();

  // Both teams must be in this organization. A team id from another league
  // would otherwise end up on this schedule.
  const teamIds = [homeTeamId, awayTeamId].filter(Boolean);
  const { data: teams } = await supabase
    .from('teams')
    .select('id')
    .in('id', teamIds)
    .eq('organization_id', org.id);

  if ((teams ?? []).length !== teamIds.length) {
    throw new Error('One of those teams isn’t in this league.');
  }

  const startAt = zonedToUtc(`${date}T${time}`, org.timezone);

  // Warn rather than refuse: a double-header is legitimate, and a league that
  // knows what it's doing shouldn't be argued with. But an accidental
  // duplicate is far more likely than an intentional one, so it's surfaced.
  const { data: clash } = await supabase
    .from('program_sessions')
    .select('id')
    .eq('program_id', leagueId)
    .eq('start_at', startAt)
    .or(`home_team_id.in.(${teamIds.join(',')}),away_team_id.in.(${teamIds.join(',')})`)
    .limit(1);

  const { error } = await supabase.from('program_sessions').insert({
    program_id: leagueId,
    organization_id: org.id,
    session_type: sessionType,
    home_team_id: homeTeamId || null,
    away_team_id: sessionType === 'game' ? awayTeamId : null,
    location_name: locationName || null,
    start_at: startAt,
    round_label: roundLabel || null,
  });

  if (error) throw new Error('Couldn’t add that game.');

  revalidatePath(`/manage/${orgSlug}/seasons/${leagueId}`);

  // Returned rather than thrown: the game was added, so this is a heads-up,
  // not a failure. Throwing would have shown it in red next to a form that
  // had actually worked.
  return {
    warning:
      (clash ?? []).length > 0
        ? 'Added — but one of those teams already has something at that time.'
        : null,
  };
}

/** Move a game, or rename where it's played. */
async function _updateGame(
  orgSlug: string,
  sessionId: string,
  formData: FormData,
): Promise<{ ok: true }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const date = String(formData.get('date') ?? '').trim();
  const time = String(formData.get('time') ?? '').trim();
  const locationName = String(formData.get('location_name') ?? '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Pick a date.');
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error('Pick a start time.');

  const supabase = await createClient();
  const { error } = await supabase
    .from('program_sessions')
    .update({
      start_at: zonedToUtc(`${date}T${time}`, org.timezone),
      location_name: locationName || null,
    })
    .eq('id', sessionId)
    .eq('organization_id', org.id);

  if (error) throw new Error('Couldn’t move that game.');

  revalidatePath(`/manage/${orgSlug}`);
  return { ok: true };
}

/**
 * Cancel, postpone, or restore a game.
 *
 * Status rather than deletion: a rained-out game that families have in their
 * calendars should show as postponed, not vanish and leave them guessing.
 */
async function _setGameStatus(
  orgSlug: string,
  sessionId: string,
  status: GameStatus,
): Promise<{ ok: true }> {
  await assertOrgRole(orgSlug, 'league_manager');
  if (!STATUSES.includes(status)) throw new Error('Unknown status.');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const supabase = await createClient();
  const { error } = await supabase
    .from('program_sessions')
    .update({ status })
    .eq('id', sessionId)
    .eq('organization_id', org.id);

  if (error) throw new Error('Couldn’t update that game.');

  revalidatePath(`/manage/${orgSlug}`);
  revalidatePath(`/l/${orgSlug}`);
  return { ok: true };
}

/** Enter a final score by hand, for a game nobody tracked live. */
async function _setFinalScore(
  orgSlug: string,
  sessionId: string,
  formData: FormData,
): Promise<{ ok: true }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const home = Number(formData.get('home_score'));
  const away = Number(formData.get('away_score'));

  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
    throw new Error('Enter both scores as whole numbers.');
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('program_sessions')
    .update({ home_score: home, away_score: away, status: 'final' })
    .eq('id', sessionId)
    .eq('organization_id', org.id);

  if (error) throw new Error('Couldn’t save that score.');

  revalidatePath(`/manage/${orgSlug}`);
  revalidatePath(`/l/${orgSlug}`);
  return { ok: true };
}

export const addGame = safeAction(_addGame);
export const updateGame = safeAction(_updateGame);
export const setGameStatus = safeAction(_setGameStatus);
export const setFinalScore = safeAction(_setFinalScore);
