import { createClient } from '@/lib/supabase/server';

export type RosterModel = 'draft' | 'assigned' | 'team_registration';

export interface SeasonSummary {
  id: string;
  title: string;
  sportKey: string | null;
  status: 'draft' | 'published' | 'registration_closed' | 'archived' | 'cancelled';
  startsOn: string | null;
  endsOn: string | null;
  rosterModel: RosterModel;
  involvesMinors: boolean;
  schedulePublished: boolean;
  rostersPublished: boolean;
  standingsPublished: boolean;
  teamCount: number;
  gameCount: number;
  /** Null for a top-level season; set when this is a division. */
  parentId: string | null;
  parentTitle: string | null;
  /** True when other seasons sit under this one as divisions. */
  hasDivisions: boolean;
}

export interface TeamSummary {
  id: string;
  name: string;
  color: string | null;
  playerCount: number;
  coachCount: number;
}

/** Every season in a league, newest first. */
export async function listSeasons(orgId: string): Promise<SeasonSummary[]> {
  const supabase = await createClient();

  const { data: programs } = await supabase
    .from('programs')
    .select('id, title, sport_key, status, starts_on, ends_on, involves_minors, parent_program_id, created_at')
    .eq('organization_id', orgId)
    .eq('kind', 'league')
    .neq('status', 'archived')
    .order('created_at', { ascending: false });

  if (!programs || programs.length === 0) return [];

  const ids = programs.map((p) => p.id);

  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, roster_model, schedule_published_at, rosters_published_at, standings_published_at')
    .in('id', ids);

  const { data: teams } = await supabase.from('teams').select('id, league_id').in('league_id', ids);

  const { data: games } = await supabase
    .from('program_sessions')
    .select('id, program_id')
    .in('program_id', ids)
    .eq('session_type', 'game');

  const leagueById = new Map((leagues ?? []).map((l) => [l.id, l]));
  const titleById = new Map(programs.map((p) => [p.id, p.title]));
  const parentIds = new Set(
    programs.map((p) => p.parent_program_id).filter((v): v is string => Boolean(v)),
  );
  const countBy = <T extends Record<string, unknown>>(rows: T[] | null, key: keyof T) => {
    const counts = new Map<string, number>();
    for (const r of rows ?? []) {
      const k = String(r[key]);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  };

  const teamCounts = countBy(teams, 'league_id');
  const gameCounts = countBy(games, 'program_id');

  return programs.flatMap((p): SeasonSummary[] => {
    const l = leagueById.get(p.id);
    // A program of kind 'league' with no leagues row is a half-created
    // season. Skip it rather than render something with no roster model.
    if (!l) return [];

    return [{
      id: p.id,
      title: p.title,
      sportKey: p.sport_key,
      status: p.status,
      startsOn: p.starts_on,
      endsOn: p.ends_on,
      involvesMinors: p.involves_minors,
      rosterModel: l.roster_model,
      schedulePublished: Boolean(l.schedule_published_at),
      rostersPublished: Boolean(l.rosters_published_at),
      standingsPublished: Boolean(l.standings_published_at),
      teamCount: teamCounts.get(p.id) ?? 0,
      gameCount: gameCounts.get(p.id) ?? 0,
      parentId: p.parent_program_id,
      parentTitle: p.parent_program_id ? (titleById.get(p.parent_program_id) ?? null) : null,
      hasDivisions: parentIds.has(p.id),
    }];
  });
}

export async function getSeason(orgId: string, leagueId: string): Promise<SeasonSummary | null> {
  const all = await listSeasons(orgId);
  return all.find((s) => s.id === leagueId) ?? null;
}

export async function listTeams(leagueId: string): Promise<TeamSummary[]> {
  const supabase = await createClient();

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, color')
    .eq('league_id', leagueId)
    .order('name');

  if (!teams || teams.length === 0) return [];

  const ids = teams.map((t) => t.id);

  const { data: members } = await supabase.from('team_members').select('id, team_id').in('team_id', ids);
  const { data: coaches } = await supabase.from('team_coaches').select('id, team_id').in('team_id', ids);

  const count = (rows: { team_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.team_id, (m.get(r.team_id) ?? 0) + 1);
    return m;
  };

  const playerCounts = count(members);
  const coachCounts = count(coaches);

  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    playerCount: playerCounts.get(t.id) ?? 0,
    coachCount: coachCounts.get(t.id) ?? 0,
  }));
}

export async function listSports(): Promise<{ key: string; label: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('sports')
    .select('key, label')
    .eq('is_active', true)
    .order('sort_order');
  return data ?? [];
}
