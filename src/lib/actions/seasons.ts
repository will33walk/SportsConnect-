'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { safeAction } from '@/lib/safe-action';
import { assertOrgRole, currentUserId } from '@/lib/auth';
import { getOrgBySlug } from '@/lib/org-data';
import { slugify, validateSlug } from '@/lib/slug';
import { planSeason } from '@/lib/season-plan';
import { zonedToUtc } from '@/lib/timezone';
import { isPlanLimit } from '@/lib/plans';

type RosterModel = 'draft' | 'assigned' | 'team_registration';
const ROSTER_MODELS: RosterModel[] = ['draft', 'assigned', 'team_registration'];

/**
 * Create a season.
 *
 * A season is a `programs` row of kind 'league' plus its `leagues` extension.
 * The roster model is chosen here and not later, because it decides what the
 * registration form does, what the season screen offers, and whether coaches
 * need clearance -- changing it mid-season would strand whatever had already
 * happened under the old one.
 */
async function _createSeason(orgSlug: string, formData: FormData): Promise<never> {
  await assertOrgRole(orgSlug, 'league_manager');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const title = String(formData.get('title') ?? '').trim();
  const sportKey = String(formData.get('sport_key') ?? '').trim();
  const rosterModel = String(formData.get('roster_model') ?? '') as RosterModel;
  const involvesMinors = formData.get('involves_minors') === 'on';
  const startsOn = String(formData.get('starts_on') ?? '').trim() || null;
  const endsOn = String(formData.get('ends_on') ?? '').trim() || null;
  // Set when this is a division being added under an existing league.
  const parentId = String(formData.get('parent_program_id') ?? '').trim() || null;

  if (!title) throw new Error('Give the season a name.');
  if (!sportKey) throw new Error('Pick a sport.');
  if (!ROSTER_MODELS.includes(rosterModel)) throw new Error('Pick how rosters get made.');
  if (startsOn && endsOn && endsOn < startsOn) {
    throw new Error('The end date is before the start date.');
  }

  const slug = slugify(title);
  const slugError = validateSlug(slug);
  if (slugError) throw new Error(`That name doesn’t make a usable web address. ${slugError}`);

  const supabase = await createClient();

  // A parent must be a league in this org. Without this an id from another
  // organization could be passed and a division hung off a stranger's league.
  if (parentId) {
    const { data: parent } = await supabase
      .from('programs')
      .select('id')
      .eq('id', parentId)
      .eq('organization_id', org.id)
      .eq('kind', 'league')
      .maybeSingle();

    if (!parent) throw new Error('That parent league isn’t in this organization.');
  }

  const { data: program, error } = await supabase
    .from('programs')
    .insert({
      organization_id: org.id,
      kind: 'league',
      sport_key: sportKey,
      title,
      slug,
      parent_program_id: parentId,
      involves_minors: involvesMinors,
      starts_on: startsOn,
      ends_on: endsOn,
      created_by: await currentUserId(),
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('You already have a season with that name.');
    // The plan trigger raises check_violation with copy written for a league
    // director, naming what Unlimited unlocks. Pass it through rather than
    // flattening it to "couldn't create the season" -- this is the moment
    // somebody decides whether the upgrade is worth it.
    if (isPlanLimit(error)) throw new Error(error.message);
    throw new Error('Couldn’t create the season.');
  }

  // The 1:1 extension. If this fails the program row is an orphan of kind
  // 'league' with no leagues row, which every league query would skip -- so
  // clean it up rather than leave a season that half exists.
  const { error: leagueError } = await supabase.from('leagues').insert({
    id: program.id,
    organization_id: org.id,
    roster_model: rosterModel,
  });

  if (leagueError) {
    await supabase.from('programs').delete().eq('id', program.id);
    throw new Error('Couldn’t create the season.');
  }

  redirect(`/manage/${orgSlug}/seasons/${program.id}`);
}

/** Add a team to a season. */
async function _createTeam(
  orgSlug: string,
  leagueId: string,
  formData: FormData,
): Promise<{ ok: true }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('Give the team a name.');

  const color = String(formData.get('color') ?? '').trim();
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('That colour isn’t valid.');

  const supabase = await createClient();
  const { error } = await supabase.from('teams').insert({
    league_id: leagueId,
    organization_id: org.id,
    name,
    color: color || null,
  });

  if (error) throw new Error('Couldn’t add that team.');

  revalidatePath(`/manage/${orgSlug}/seasons/${leagueId}`);
  return { ok: true };
}

/**
 * Publish or unpublish one facet of a season.
 *
 * Three independent switches rather than one status, because a league
 * routinely wants the schedule public while rosters are still moving.
 */
async function _setPublication(
  orgSlug: string,
  leagueId: string,
  facet: 'schedule' | 'rosters' | 'standings',
  publish: boolean,
): Promise<{ ok: true }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const column = `${facet}_published_at` as const;
  const supabase = await createClient();

  const { error } = await supabase
    .from('leagues')
    .update({ [column]: publish ? new Date().toISOString() : null })
    .eq('id', leagueId);

  if (error) throw new Error('Couldn’t change that.');

  revalidatePath(`/manage/${orgSlug}/seasons/${leagueId}`);
  revalidatePath(`/l/${orgSlug}`);
  return { ok: true };
}

/** Publish the season itself, so it appears on the league's public pages. */
async function _setSeasonStatus(
  orgSlug: string,
  leagueId: string,
  status: 'draft' | 'published' | 'registration_closed' | 'archived',
): Promise<{ ok: true }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const supabase = await createClient();
  const { error } = await supabase.from('programs').update({ status }).eq('id', leagueId);
  if (error) {
    // Un-archiving a second season on the League plan lands here.
    if (isPlanLimit(error)) throw new Error(error.message);
    throw new Error('Couldn’t change that.');
  }

  revalidatePath(`/manage/${orgSlug}/seasons/${leagueId}`);
  revalidatePath(`/l/${orgSlug}`);
  return { ok: true };
}

/**
 * Build the season's games.
 *
 * Refuses when games already exist rather than appending a second season's
 * worth on top of the first. Regenerating means clearing first, which is a
 * deliberate act -- a schedule people have already put on their fridge should
 * not be silently doubled by a stray second click.
 */
async function _generateSchedule(
  orgSlug: string,
  leagueId: string,
  formData: FormData,
): Promise<{ created: number }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const org = await getOrgBySlug(orgSlug);
  if (!org) throw new Error('League not found.');

  const supabase = await createClient();

  const { data: teams } = await supabase
    .from('teams')
    .select('id')
    .eq('league_id', leagueId)
    .order('created_at');

  if (!teams || teams.length < 2) throw new Error('Add at least two teams first.');

  const { count: existing } = await supabase
    .from('program_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('program_id', leagueId)
    .eq('session_type', 'game');

  if ((existing ?? 0) > 0) {
    throw new Error('This season already has games. Clear the schedule first.');
  }

  const weekdays = formData
    .getAll('weekdays')
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);

  const gameTimes = String(formData.get('game_times') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{2}:\d{2}$/.test(s));

  const locations = String(formData.get('locations') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);

  const plan = planSeason({
    teamIds: teams.map((t) => t.id),
    startDate: String(formData.get('start_date') ?? '').trim(),
    weekdays,
    gameTimes,
    locations,
    timesThrough: Math.min(4, Math.max(1, Number(formData.get('times_through') ?? 1))),
  });

  if (plan.games.length === 0) {
    throw new Error(plan.warning ?? 'Couldn’t build a schedule from those settings.');
  }

  // planSeason returns wall-clock local times with no zone, because only the
  // league knows its own. Attaching the zone here means a game at 18:00 is
  // six in the evening at the field whether or not the clocks changed
  // halfway through the season.
  const rows = plan.games.map((g) => ({
    program_id: leagueId,
    organization_id: org.id,
    session_type: 'game' as const,
    home_team_id: g.homeTeamId,
    away_team_id: g.awayTeamId,
    location_name: g.locationName,
    start_at: zonedToUtc(g.localStart, org.timezone),
    round_label: g.roundLabel,
  }));

  const { error } = await supabase.from('program_sessions').insert(rows);
  if (error) throw new Error('Couldn’t save the schedule.');

  revalidatePath(`/manage/${orgSlug}/seasons/${leagueId}`);
  return { created: rows.length };
}

/** Remove every game in a season, so a schedule can be rebuilt. */
async function _clearSchedule(orgSlug: string, leagueId: string): Promise<{ ok: true }> {
  await assertOrgRole(orgSlug, 'league_manager');

  const supabase = await createClient();

  // Only games, and only ones nobody has played. A final score is a record of
  // something that happened, and a rebuild must not erase it.
  const { error } = await supabase
    .from('program_sessions')
    .delete()
    .eq('program_id', leagueId)
    .eq('session_type', 'game')
    .eq('status', 'scheduled');

  if (error) throw new Error('Couldn’t clear the schedule.');

  revalidatePath(`/manage/${orgSlug}/seasons/${leagueId}`);
  return { ok: true };
}

export const createSeason = safeAction(_createSeason);
export const createTeam = safeAction(_createTeam);
export const setPublication = safeAction(_setPublication);
export const setSeasonStatus = safeAction(_setSeasonStatus);
export const generateSchedule = safeAction(_generateSchedule);
export const clearSchedule = safeAction(_clearSchedule);
