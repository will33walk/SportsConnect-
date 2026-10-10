-- 0009_plans_divisions_blasts.sql
--
-- What a league is paying for, what a division is, and how a league talks to
-- everyone at once.
--
-- The plans:
--
--   league     $35/month. One active season at a time. Finish spring, archive
--              it, start fall -- no extra charge, ever. What it does NOT get
--              is several seasons running at once, or divisions.
--
--   unlimited  $75/month. As many seasons as they like, running together, and
--              divisions grouped under a parent league: MCYBL with T-ball, 8u,
--              11u and 14u under it; a Pop Warner org with its age groups.
--
-- The limit is enforced by a trigger, not by the action that creates a season.
-- A paywall that only exists in application code is one forgotten `if` away
-- from giving the product away, and this one has revenue on the other side of
-- it. The trigger raises a message written for the league director, naming
-- what upgrading unlocks rather than just refusing.
--
-- Billing itself is deliberately not wired up yet. The plan column is the
-- truth; charging for it comes later, so the first leagues can be onboarded
-- by hand while the product proves itself.

-- ---------------------------------------------------------------------------
-- The plan
-- ---------------------------------------------------------------------------

create type org_plan as enum ('league', 'unlimited');

alter table organization_billing
  add column plan org_plan not null default 'league';

comment on column organization_billing.plan is
  'league = one active season, no divisions. unlimited = many seasons plus divisions under a parent league.';

-- Lives on the billing table rather than on organizations because that row is
-- world-readable (0005) and a league's plan is nobody else's business.
-- security definer so the trigger below and the application can both ask
-- without needing to read a table the caller may not see.
create function public.org_plan_of(org uuid)
returns org_plan
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select b.plan from organization_billing b where b.organization_id = org),
    'league'::org_plan
  );
$$;

grant execute on function public.org_plan_of(uuid) to authenticated;

-- A season counts against the limit unless it's been put away. Archived and
-- cancelled seasons are history and never count -- which is exactly what makes
-- "one at a time" liveable on the cheaper plan.
create function public.active_season_count(org uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from programs p
  where p.organization_id = org
    and p.kind = 'league'
    and p.parent_program_id is null
    and p.status not in ('archived', 'cancelled');
$$;

grant execute on function public.active_season_count(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Divisions
--
-- A division is a program whose parent is another program. The column already
-- existed; what's new is that it means something specific for leagues, and
-- that it's a paid feature.
--
-- Each division keeps its own teams, schedule, roster model and registration,
-- because T-ball being assigned and 14u being drafted is the whole reason
-- MCYBL needs them separate. What the parent adds is a place to stand to see
-- all of it, and an address to send a message to everybody.
-- ---------------------------------------------------------------------------

-- One level only. A division of a division is a tree nobody asked for and
-- every query would then have to walk.
create function public.enforce_division_depth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_parent uuid;
begin
  if new.parent_program_id is null then
    return new;
  end if;

  if new.parent_program_id = new.id then
    raise exception 'A season can''t be its own division.';
  end if;

  select parent_program_id into parent_parent
  from programs where id = new.parent_program_id;

  if parent_parent is not null then
    raise exception 'Divisions can''t have divisions of their own.';
  end if;

  return new;
end;
$$;

create trigger programs_division_depth
  before insert or update of parent_program_id on programs
  for each row execute function public.enforce_division_depth();

-- ---------------------------------------------------------------------------
-- The paywall
-- ---------------------------------------------------------------------------

create function public.enforce_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan org_plan;
  active integer;
begin
  -- Only leagues are metered. A camp, a clinic, a one-off event: unlimited on
  -- every plan. The thing being sold is running a season.
  if new.kind <> 'league' then
    return new;
  end if;

  -- Putting a season away is always allowed. Without this, an organization
  -- that moved from Unlimited back to League while holding two live seasons
  -- could not archive either one -- the trigger would block the exact action
  -- that brings them back inside their plan.
  if new.status in ('archived', 'cancelled') then
    return new;
  end if;

  plan := org_plan_of(new.organization_id);
  if plan = 'unlimited' then
    return new;
  end if;

  -- Divisions are an unlimited feature. The message names the shape of the
  -- thing they'd be buying, because "upgrade required" tells a volunteer board
  -- nothing about whether it's worth $40 more.
  if new.parent_program_id is not null then
    raise exception
      'Divisions are part of Unlimited. Unlimited ($75/month) lets one organization run divisions under a parent league -- T-ball, 8u, 11u and 14u under MCYBL, or age groups under a Pop Warner program -- each with its own teams, schedule and registration, plus one place to message everybody at once.'
      using errcode = 'check_violation';
  end if;

  -- Reviving an archived season, or an ordinary update, must not be blocked by
  -- the season's own existence. Only count rows that aren't this one.
  select count(*)::integer into active
  from programs p
  where p.organization_id = new.organization_id
    and p.kind = 'league'
    and p.parent_program_id is null
    and p.status not in ('archived', 'cancelled')
    and p.id <> new.id;

  if active >= 1 then
    raise exception
      'The League plan runs one season at a time. Archive your current season to start the next one at no extra cost -- or move to Unlimited ($75/month) to run several seasons side by side and to group divisions under a parent league, like T-ball through 14u under MCYBL.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Fires on insert, and on an update that would un-archive a second season.
create trigger programs_plan_limits
  before insert or update of status, parent_program_id, kind on programs
  for each row execute function public.enforce_plan_limits();

-- ---------------------------------------------------------------------------
-- Announcements
--
-- A blast: one message, many recipients, no replies. Separate from
-- `messages` on purpose -- a thread is a conversation and this is a
-- broadcast, and conflating them is how a parent ends up replying "ok thanks"
-- to four hundred people.
--
-- Three audiences, which is what a league actually asks for:
--
--   organization  everyone in the org, across every division
--   program       one season or one division
--   teams         a hand-picked set of teams
-- ---------------------------------------------------------------------------

create table announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,

  scope text not null check (scope in ('organization', 'program', 'teams')),
  -- Set when scope = 'program'. A parent league here means every division
  -- under it, which is the "message the whole league" case.
  program_id uuid references programs (id) on delete cascade,

  subject text not null check (length(trim(subject)) between 1 and 160),
  body text not null check (length(trim(body)) between 1 and 8000),

  -- Recorded at send time rather than counted later: team rosters change, and
  -- "who did this actually reach" is a question about the moment it went out.
  recipient_count integer not null default 0,

  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint announcement_scope_matches_target check (
    (scope = 'program' and program_id is not null)
    or (scope <> 'program' and program_id is null)
  )
);

create index announcements_org_idx on announcements (organization_id, created_at desc);

create table announcement_teams (
  announcement_id uuid not null references announcements (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  primary key (announcement_id, team_id)
);

alter table announcements enable row level security;
alter table announcement_teams enable row level security;

-- Anyone in the league can read what was sent to them; managers see the
-- whole outbox. Writes go through send_announcement() below.
create policy "members read announcements"
  on announcements for select
  using (is_org_member(organization_id));

create policy "managers manage announcements"
  on announcements for all
  using (has_org_role(organization_id, 'league_manager'))
  with check (has_org_role(organization_id, 'league_manager'));

create policy "members read announcement teams"
  on announcement_teams for select
  using (
    exists (
      select 1 from announcements a
      where a.id = announcement_id and is_org_member(a.organization_id)
    )
  );

create policy "managers manage announcement teams"
  on announcement_teams for all
  using (
    exists (
      select 1 from announcements a
      where a.id = announcement_id and has_org_role(a.organization_id, 'league_manager')
    )
  )
  with check (
    exists (
      select 1 from announcements a
      where a.id = announcement_id and has_org_role(a.organization_id, 'league_manager')
    )
  );

-- ---------------------------------------------------------------------------
-- Who a blast would reach
--
-- Used twice: to show a count before sending ("this goes to 212 people"), and
-- to fan the thing out. Same function both times, so the number shown is the
-- number reached.
--
-- Returns adults, not players: the people with accounts and phones. For a
-- youth division that's the parents and coaches; for adult softball it's the
-- players themselves.
-- ---------------------------------------------------------------------------

create function public.announcement_audience(
  p_organization_id uuid,
  p_scope text,
  p_program_id uuid,
  p_team_ids uuid[]
)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  -- Everyone in the organization.
  select m.user_id
  from memberships m
  where p_scope = 'organization'
    and m.organization_id = p_organization_id
    and m.accepted_at is not null

  union

  -- One season or division: the households of its registered players, plus
  -- its coaches. A parent league includes every division beneath it, which is
  -- what makes "the whole league" one click.
  select people.user_id
  from (
    select h.primary_contact_id as user_id
    from registrations r
    join dependents d on d.id = r.dependent_id
    join households h on h.id = d.household_id
    join programs p on p.id = r.program_id
    where p_scope = 'program'
      and r.status = 'confirmed'
      and (p.id = p_program_id or p.parent_program_id = p_program_id)

    union all

    -- A second guardian on the household.
    select hl.user_id
    from registrations r
    join dependents d on d.id = r.dependent_id
    join household_links hl on hl.household_id = d.household_id
    join programs p on p.id = r.program_id
    where p_scope = 'program'
      and r.status = 'confirmed'
      and (p.id = p_program_id or p.parent_program_id = p_program_id)

    union all

    -- An adult who registered themselves.
    select r.registrant_id
    from registrations r
    join programs p on p.id = r.program_id
    where p_scope = 'program'
      and r.status = 'confirmed'
      and r.registrant_id is not null
      and (p.id = p_program_id or p.parent_program_id = p_program_id)

    union all

    -- Coaches of teams in it.
    select tc.user_id
    from team_coaches tc
    join teams t on t.id = tc.team_id
    join programs p on p.id = t.league_id
    where p_scope = 'program'
      and (p.id = p_program_id or p.parent_program_id = p_program_id)
  ) people
  where people.user_id is not null

  union

  -- Picked teams: their rostered players' households, their rostered adults,
  -- and their coaches.
  select tpeople.user_id
  from (
    select h.primary_contact_id as user_id
    from team_members tm
    join registrations r on r.id = tm.registration_id
    join dependents d on d.id = r.dependent_id
    join households h on h.id = d.household_id
    where p_scope = 'teams' and tm.team_id = any(p_team_ids)

    union all

    select hl.user_id
    from team_members tm
    join registrations r on r.id = tm.registration_id
    join dependents d on d.id = r.dependent_id
    join household_links hl on hl.household_id = d.household_id
    where p_scope = 'teams' and tm.team_id = any(p_team_ids)

    union all

    -- A roster spot held by an account directly -- a softball teammate a
    -- captain invited, who never individually registered.
    select tm.user_id
    from team_members tm
    where p_scope = 'teams' and tm.team_id = any(p_team_ids) and tm.user_id is not null

    union all

    select r.registrant_id
    from team_members tm
    join registrations r on r.id = tm.registration_id
    where p_scope = 'teams' and tm.team_id = any(p_team_ids) and r.registrant_id is not null

    union all

    select tc.user_id
    from team_coaches tc
    where p_scope = 'teams' and tc.team_id = any(p_team_ids)
  ) tpeople
  where tpeople.user_id is not null;
$$;

grant execute on function public.announcement_audience(uuid, text, uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Sending
--
-- One transaction: record the announcement, record its targets, and write a
-- notification per recipient. Fanning out in the application would leave a
-- half-sent blast behind any failure partway through.
-- ---------------------------------------------------------------------------

create function public.send_announcement(
  p_organization_id uuid,
  p_scope text,
  p_program_id uuid,
  p_team_ids uuid[],
  p_subject text,
  p_body text
)
returns table (announcement_id uuid, recipients integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  sent integer;
begin
  -- security definer, so the role check belongs here. Sending to every family
  -- in a league is not something a coach should be able to do.
  if not has_org_role(p_organization_id, 'league_manager') then
    raise exception 'You don''t have access to do that.';
  end if;

  if p_scope not in ('organization', 'program', 'teams') then
    raise exception 'Pick who this goes to.';
  end if;

  -- A program must belong to this org, or a manager of one league could
  -- message another's families by passing a foreign id.
  if p_scope = 'program' then
    if not exists (
      select 1 from programs
      where id = p_program_id and organization_id = p_organization_id
    ) then
      raise exception 'That season isn''t in this league.';
    end if;
  end if;

  if p_scope = 'teams' then
    if p_team_ids is null or array_length(p_team_ids, 1) is null then
      raise exception 'Pick at least one team.';
    end if;
    if exists (
      select 1 from unnest(p_team_ids) tid
      where not exists (
        select 1 from teams t
        where t.id = tid and t.organization_id = p_organization_id
      )
    ) then
      raise exception 'One of those teams isn''t in this league.';
    end if;
  end if;

  insert into announcements (
    organization_id, scope, program_id, subject, body, created_by
  ) values (
    p_organization_id,
    p_scope,
    case when p_scope = 'program' then p_program_id else null end,
    trim(p_subject),
    trim(p_body),
    auth.uid()
  ) returning id into new_id;

  if p_scope = 'teams' then
    insert into announcement_teams (announcement_id, team_id)
    select new_id, tid from unnest(p_team_ids) tid;
  end if;

  with audience as (
    select distinct uid
    from announcement_audience(p_organization_id, p_scope, p_program_id, p_team_ids) uid
  ), delivered as (
    insert into notifications (organization_id, user_id, kind, title, body, href)
    select
      p_organization_id,
      a.uid,
      'announcement',
      trim(p_subject),
      trim(p_body),
      '/announcements/' || new_id
    from audience a
    returning 1
  )
  select count(*)::integer into sent from delivered;

  update announcements set recipient_count = sent where id = new_id;

  return query select new_id, sent;
end;
$$;

revoke all on function public.send_announcement(uuid, text, uuid, uuid[], text, text) from public;
grant execute on function public.send_announcement(uuid, text, uuid, uuid[], text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Divisions on the public side
--
-- A parent league is published in its own right so a family landing on it can
-- see the divisions underneath. 0005 already made published programs readable;
-- this just makes the parent visible when only its divisions are published,
-- so MCYBL's page isn't blank while T-ball and 8u are open.
-- ---------------------------------------------------------------------------

create policy "parents of published divisions are public"
  on programs for select
  to anon, authenticated
  using (
    exists (
      select 1 from programs child
      where child.parent_program_id = programs.id
        and child.status = 'published'
    )
  );
