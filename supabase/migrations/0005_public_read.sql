-- 0005_public_read.sql
--
-- What a stranger with a link can see.
--
-- 0002 and 0003 gated every sports table behind `is_org_member()`, which is
-- right for drafts, registrations and evaluation scores and wrong for the
-- thing this product exists to do. The person most likely to open a league's
-- page is a grandparent two states away with no account and no intention of
-- making one. If following a game requires signing up, the feature does not
-- work.
--
-- So publication is the boundary, not membership. A league controls three
-- switches -- schedule, rosters, standings -- and whatever it has published
-- is world-readable. Everything else stays shut.
--
-- Two rules this file holds to:
--
--   1. Nothing here exposes an adult's contact details or a child's full
--      identity. Public rosters carry first name and last initial, which the
--      application renders through publicPlayerName(); this migration gives
--      anon no path to `profiles`, `dependents`, `registrations` or
--      `households` at all.
--   2. Read only. `to anon, authenticated` with `for select` -- no public
--      write path is created anywhere in this file.

-- Helper: is this league's schedule/rosters/standings published? Security
-- definer so an anonymous caller can ask the question without being able to
-- read the `leagues` row that answers it.
create function public.league_published(league uuid, facet text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case facet
    when 'schedule'  then l.schedule_published_at is not null
    when 'rosters'   then l.rosters_published_at is not null
    when 'standings' then l.standings_published_at is not null
    else false
  end
  from leagues l
  where l.id = league;
$$;

-- Is this session part of a league whose schedule is public?
create function public.session_is_public(session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select league_published(ps.program_id, 'schedule')
     from program_sessions ps
     where ps.id = session),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- The league itself
-- ---------------------------------------------------------------------------

-- Name, slug, logo and colours. Needed to render anything at all, and none of
-- it is private -- a league's name is on the back of the jerseys.
create policy "organizations are publicly readable"
  on organizations for select
  to anon, authenticated
  using (archived_at is null);

-- Safe to open up because billing is not on this row: `organization_billing`
-- is a separate, admin-only table precisely so this policy can exist without
-- handing every passer-by a league's Stripe account id. See 0001_tenancy.sql.

create policy "published programs are public"
  on programs for select
  to anon, authenticated
  using (status = 'published');

create policy "leagues of published programs are public"
  on leagues for select
  to anon, authenticated
  using (
    exists (select 1 from programs p where p.id = leagues.id and p.status = 'published')
  );

-- ---------------------------------------------------------------------------
-- Schedule, teams, scores
-- ---------------------------------------------------------------------------

create policy "published schedules are public"
  on program_sessions for select
  to anon, authenticated
  using (league_published(program_id, 'schedule'));

create policy "teams in published leagues are public"
  on teams for select
  to anon, authenticated
  using (
    league_published(league_id, 'schedule')
    or league_published(league_id, 'rosters')
    or league_published(league_id, 'standings')
  );

-- Rosters have their own switch, and it is the one most likely to stay off:
-- a league may want a public schedule and no public list of whose child is on
-- which team. team_members carries no name itself -- it points at a
-- registration -- so this exposes jersey numbers and team assignment, and the
-- application joins names through publicPlayerName().
create policy "published rosters are public"
  on team_members for select
  to anon, authenticated
  using (
    exists (
      select 1 from teams t
      where t.id = team_members.team_id
        and league_published(t.league_id, 'rosters')
    )
  );

-- ---------------------------------------------------------------------------
-- Live games
--
-- The reason the product exists. An anonymous follower reads the event log
-- for a published league's game and the client replays it, exactly as the
-- scorekeeper's own screen does.
-- ---------------------------------------------------------------------------

create policy "live events of published games are public"
  on game_events for select
  to anon, authenticated
  using (session_is_public(session_id));

create policy "lineups of published games are public"
  on game_lineups for select
  to anon, authenticated
  using (session_is_public(session_id));

create policy "stats of published games are public"
  on game_stat_entries for select
  to anon, authenticated
  using (session_is_public(session_id));

-- The stat catalog is labels, not data: "Hits", "RBIs". A box score is
-- unreadable without it.
create policy "stat labels are public"
  on stat_categories for select
  to anon, authenticated
  using (true);

create policy "enabled stat categories are public"
  on program_stat_categories for select
  to anon, authenticated
  using (
    exists (select 1 from programs p where p.id = program_id and p.status = 'published')
  );

-- ---------------------------------------------------------------------------
-- Not public, and deliberately
--
--   registrations, households, dependents  -- families
--   profiles                               -- adults' names and contact
--   promo_codes                            -- enumerable discounts
--   drafts, draft_picks, draft_list_entries -- a coach's board is theirs
--   player_evaluations                     -- never, at any publication state
--   messages, threads, notifications       -- private by definition
--   coach_requirement_completions          -- vetting is not a public record
--
-- league_standings is a view over teams and program_sessions and inherits
-- their policies through security_invoker, so it becomes public exactly when
-- its inputs do. Note that makes standings visible once the SCHEDULE is
-- published, since that is what carries the scores -- a league wanting
-- results hidden should not publish the schedule, and the standings switch
-- governs whether the standings page is offered rather than whether the
-- arithmetic is derivable.
-- ---------------------------------------------------------------------------
