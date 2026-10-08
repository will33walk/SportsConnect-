-- 0007_roster_models.sql
--
-- Three ways a roster gets formed, because real leagues use all three and a
-- product that only knows one of them fits nobody.
--
--   DRAFT              coaches pick players from a pool of registrations.
--                      Youth baseball 11u and 14u. The draft tables in 0003
--                      already serve this.
--
--   ASSIGNED           the league places registered players onto teams
--                      directly, usually balancing by age, school or
--                      carpool. T-ball and 8u, where a draft would be both
--                      pointless and slightly grim.
--
--   TEAM_REGISTRATION  a captain signs up an entire team and pays for it,
--                      then invites their own players. Adult softball. The
--                      registering unit is the TEAM, not the player, which
--                      is the case the schema did not previously allow at
--                      all: team_members required a per-player registration,
--                      and in this model the players never individually
--                      register.
--
-- The second thing this migration fixes is a rule that was too broad.
-- 0006 made coach clearance unconditional: every row in team_coaches had to
-- belong to someone who had satisfied the league's vetting requirements. That
-- is exactly right for a nine-year-old's dugout and wrong for a Tuesday-night
-- softball captain, who is an adult organising other adults. Clearance now
-- keys off whether the program involves minors.

-- ---------------------------------------------------------------------------
-- How this league forms rosters, and who's in it
-- ---------------------------------------------------------------------------

create type roster_model as enum ('draft', 'assigned', 'team_registration');

alter table leagues
  add column roster_model roster_model not null default 'assigned';

comment on column leagues.roster_model is
  'How players reach a team: drafted by coaches, assigned by the league, or brought by a captain who registered the whole team.';

-- Drives the vetting rule, the privacy rule for public rosters, and which
-- consent language a registration form needs. Default true because youth
-- sport is the common case and the safer default if someone forgets to set it.
alter table programs
  add column involves_minors boolean not null default true;

comment on column programs.involves_minors is
  'Youth program. Gates coach clearance and keeps full names off public pages.';

-- ---------------------------------------------------------------------------
-- Clearance, narrowed
-- ---------------------------------------------------------------------------

-- Replaces the unconditional version from 0006.
create or replace function public.enforce_coach_clearance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  youth boolean;
begin
  select p.involves_minors into youth
  from teams t
  join programs p on p.id = t.league_id
  where t.id = new.team_id;

  -- No program found: fail closed. A team_coaches row pointing at a team we
  -- can't resolve is a bug, and the safe reading of a bug here is "unvetted".
  if youth is null or youth then
    if not is_coach_cleared(new.organization_id, new.user_id) then
      raise exception
        'This coach has not completed the league''s requirements yet.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- A captain is a team's organiser, not a youth coach. Same table because the
-- permission question is identical -- "may this person manage this team" --
-- and splitting it would mean every roster query checking two places.
alter table team_coaches
  drop constraint team_coaches_role_check;

alter table team_coaches
  add constraint team_coaches_role_check
  check (role in ('head', 'assistant', 'captain'));

-- ---------------------------------------------------------------------------
-- A roster spot that doesn't require the player to have registered
-- ---------------------------------------------------------------------------

-- In team_registration leagues the captain paid for the team and the players
-- just turn up, so there is no per-player registration to point at. Either a
-- registration or a person, never neither.
alter table team_members
  alter column registration_id drop not null;

alter table team_members
  add column user_id uuid references profiles (id) on delete cascade;

alter table team_members
  add column display_name text;

alter table team_members
  add constraint team_member_identifies_someone check (
    registration_id is not null
    or user_id is not null
    -- A captain adding a player who hasn't made an account yet: a name on the
    -- roster now, linked to a real account if and when they accept an invite.
    or display_name is not null
  );

create unique index team_members_one_spot_per_user
  on team_members (team_id, user_id) where user_id is not null;

create index team_members_user_idx on team_members (user_id) where user_id is not null;

-- ---------------------------------------------------------------------------
-- Registering a whole team
-- ---------------------------------------------------------------------------

-- The registration is for a team. registrant_id already carries the captain;
-- this says what they bought.
alter table registrations
  add column team_id uuid references teams (id) on delete set null;

create index registrations_team_idx on registrations (team_id) where team_id is not null;

-- The 0002 check required a dependent or a registrant. A team registration
-- has a registrant (the captain) so it already passes, but spell the third
-- case out so the intent is visible to whoever reads this next.
alter table registrations
  drop constraint registration_has_a_person;

alter table registrations
  add constraint registration_has_a_subject check (
    dependent_id is not null      -- a child, registered by their household
    or registrant_id is not null  -- an adult registering themselves, or a
                                  -- captain registering their team
  );

-- ---------------------------------------------------------------------------
-- Inviting players to a team
--
-- Reuses the invitation machinery from 0006 rather than building a parallel
-- one: same token, same expiry, same accept function. An invitation with a
-- team_id lands the person on that team as well as in the league.
-- ---------------------------------------------------------------------------

alter table invitations
  add column team_id uuid references teams (id) on delete cascade;

-- The uniqueness rule in 0006 was one live invitation per email per league.
-- That's wrong once teams can invite: a player might be invited to the league
-- and to a team. Make it one per email per league per team instead.
drop index invitations_one_live_per_email;

create unique index invitations_one_live_per_target
  on invitations (organization_id, email, coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where accepted_at is null and revoked_at is null;

-- May the caller manage this team's roster? A captain or head coach of the
-- team, or anyone running the league.
create function public.manages_team(team uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from team_coaches tc
    where tc.team_id = team
      and tc.user_id = auth.uid()
      and tc.role in ('head', 'captain')
  ) or exists (
    select 1 from teams t
    where t.id = team and has_org_role(t.organization_id, 'league_manager')
  );
$$;

-- 0006 restricted invitations to admins, which is right for handing out
-- roles. A captain inviting their own players is a different act, so it gets
-- its own narrower policies rather than a looser version of that one.
create policy "captains invite to their own team"
  on invitations for insert
  with check (
    team_id is not null
    and role = 'member'      -- a roster invite never carries authority
    and manages_team(team_id)
  );

create policy "captains see their own team's invitations"
  on invitations for select
  using (team_id is not null and manages_team(team_id));

create policy "captains withdraw their own team's invitations"
  on invitations for update
  using (team_id is not null and manages_team(team_id))
  with check (team_id is not null and manages_team(team_id));

-- Accepting an invitation now also puts the person on the team, when the
-- invitation named one. Replaces the 0006 version.
create or replace function public.accept_invitation(invite_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invitations;
  org_slug text;
  team_org uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to accept this invitation.';
  end if;

  select * into inv from invitations where token = invite_token;

  if not found then
    raise exception 'That invitation link isn''t valid.';
  end if;
  if inv.revoked_at is not null then
    raise exception 'That invitation was withdrawn.';
  end if;
  if inv.accepted_at is not null then
    raise exception 'That invitation has already been used.';
  end if;
  if inv.expires_at < now() then
    raise exception 'That invitation has expired. Ask for a new one.';
  end if;

  insert into memberships (organization_id, user_id, role, invited_by, accepted_at)
  values (inv.organization_id, auth.uid(), inv.role, inv.invited_by, now())
  on conflict (organization_id, user_id) do update
    set role = greatest_role(memberships.role, excluded.role),
        accepted_at = coalesce(memberships.accepted_at, now());

  if inv.team_id is not null then
    -- Guard against a team that has been moved or deleted since the invite
    -- went out; the index on (team_id, user_id) handles a double-accept.
    select organization_id into team_org from teams where id = inv.team_id;

    if team_org = inv.organization_id then
      insert into team_members (team_id, organization_id, user_id)
      values (inv.team_id, inv.organization_id, auth.uid())
      on conflict (team_id, user_id) where user_id is not null do nothing;
    end if;
  end if;

  update invitations
     set accepted_at = now(), accepted_by = auth.uid()
   where id = inv.id;

  select slug into org_slug from organizations where id = inv.organization_id;
  return org_slug;
end;
$$;

-- ---------------------------------------------------------------------------
-- Roster writes by a captain
--
-- 0002 gave team_members a managers-only write policy. In a
-- team_registration league the captain owns their roster, so they need one
-- too -- scoped to their own team, and only in a league that works that way.
-- ---------------------------------------------------------------------------

create policy "captains manage their own roster"
  on team_members for all
  using (
    manages_team(team_id)
    and exists (
      select 1 from teams t
      join leagues l on l.id = t.league_id
      where t.id = team_members.team_id and l.roster_model = 'team_registration'
    )
  )
  with check (
    manages_team(team_id)
    and exists (
      select 1 from teams t
      join leagues l on l.id = t.league_id
      where t.id = team_members.team_id and l.roster_model = 'team_registration'
    )
  );

-- A captain creating their team at registration time. Only in a
-- team_registration league, and the server action is what actually runs this
-- after payment -- this policy exists so that path doesn't need the service
-- role for an ordinary, well-scoped write.
create policy "captains create their team"
  on teams for insert
  with check (
    is_org_member(organization_id)
    and exists (
      select 1 from leagues l
      where l.id = league_id and l.roster_model = 'team_registration'
    )
  );
