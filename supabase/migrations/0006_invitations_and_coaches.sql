-- 0006_invitations_and_coaches.sql
--
-- How people get into a league, and how a coach gets cleared to stand in a
-- dugout with other people's children.
--
-- Two different doors on purpose:
--
--   INVITATION  the league reaches out. Used for the board, administrators,
--               and anyone the league already trusts. Carries a role.
--
--   APPLICATION the person reaches in. Used for coaches, because a league
--               with 40 teams does not want to chase 40 volunteers by email,
--               and because an application is a record of someone asking --
--               which is the right starting point for a vetting trail.
--
-- The hard rule this migration exists to enforce: an approved application is
-- not clearance. A coach is assignable to a team only when every requirement
-- the league has defined has been satisfied and has not expired. That is
-- checked in the database by a trigger, not only in the UI, because "we
-- thought the form checked it" is how an unvetted adult ends up on a roster.

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

create table invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,

  -- Lowercased on write (see the trigger below) so "Pat@x.com" and
  -- "pat@x.com" are one invitation, and so acceptance can match on equality.
  email text not null check (position('@' in email) > 1),
  role org_role not null default 'member',

  -- Random, unguessable, and the only thing the acceptance link carries.
  token text not null unique default encode(gen_random_bytes(32), 'hex'),

  invited_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),

  accepted_at timestamptz,
  accepted_by uuid references profiles (id) on delete set null,
  revoked_at timestamptz
);

-- One live invitation per email per league. A second invite to the same
-- person replaces the first rather than leaving two valid tokens out there.
create unique index invitations_one_live_per_email
  on invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;

create index invitations_token_idx on invitations (token);

create function public.normalize_invitation_email()
returns trigger
language plpgsql
as $$
begin
  new.email = lower(trim(new.email));
  return new;
end;
$$;

create trigger invitations_normalize_email
  before insert or update on invitations
  for each row execute function public.normalize_invitation_email();

alter table invitations enable row level security;

-- Admins manage invitations. Deliberately NOT league_manager: handing out
-- roles is how someone grants themselves more, so it stops at admin.
create policy "admins read invitations"
  on invitations for select
  using (has_org_role(organization_id, 'admin'));

create policy "admins write invitations"
  on invitations for all
  using (has_org_role(organization_id, 'admin'))
  with check (has_org_role(organization_id, 'admin'));

-- No policy lets an invitee read their own invitation row, because they have
-- no membership yet and a policy broad enough to let them would be broad
-- enough to enumerate every pending invitation in the system. Acceptance goes
-- through the security-definer function below instead, which takes the token
-- and returns only what the caller needs.

-- Used by acceptance below: never downgrade someone on the way in.
create function public.greatest_role(a org_role, b org_role)
returns org_role
language sql
immutable
as $$
  select case when org_role_rank(a) >= org_role_rank(b) then a else b end;
$$;

/**
 * Accept an invitation. The caller must be signed in; the token is the proof.
 *
 * Returns the organization slug so the caller can be sent somewhere useful.
 * Raises on anything else -- the messages distinguish expired from revoked
 * from already-used, because an invitee who hits a wall needs to know which
 * wall, and none of those states reveal anything about other leagues.
 *
 * The email on the invitation is NOT required to match the signed-in user's.
 * A volunteer invited at their work address who signs up with a personal one
 * is the common case, not an attack: whoever holds the token was given it.
 */
create function public.accept_invitation(invite_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invitations;
  org_slug text;
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

  -- Already a member: don't downgrade them. Someone who is already an admin
  -- accepting a stale 'member' invite should stay an admin.
  insert into memberships (organization_id, user_id, role, invited_by, accepted_at)
  values (inv.organization_id, auth.uid(), inv.role, inv.invited_by, now())
  on conflict (organization_id, user_id) do update
    set role = greatest_role(memberships.role, excluded.role),
        accepted_at = coalesce(memberships.accepted_at, now());

  update invitations
     set accepted_at = now(), accepted_by = auth.uid()
   where id = inv.id;

  select slug into org_slug from organizations where id = inv.organization_id;
  return org_slug;
end;
$$;

revoke all on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Coach applications
-- ---------------------------------------------------------------------------

create table coach_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,

  -- Optional: which season or division they're volunteering for. Null means
  -- "wherever you need me", which is most of them.
  program_id uuid references programs (id) on delete set null,

  -- What they told the league about themselves. Free text rather than a form
  -- schema: leagues ask wildly different things, and the question bank
  -- already exists for when this needs structure.
  experience text,
  phone text,

  status text not null default 'applied'
    check (status in ('applied', 'approved', 'declined', 'withdrawn')),
  decided_by uuid references profiles (id) on delete set null,
  decided_at timestamptz,
  -- Why it was declined. Internal; never shown to the applicant, because a
  -- league's honest note about a volunteer is not a letter to that volunteer.
  decision_note text,

  created_at timestamptz not null default now(),

  -- One live application per person per league.
  unique (organization_id, user_id)
);

create index coach_applications_pending_idx
  on coach_applications (organization_id, created_at)
  where status = 'applied';

alter table coach_applications enable row level security;

create policy "read own application"
  on coach_applications for select
  using (user_id = auth.uid() or has_org_role(organization_id, 'league_manager'));

-- Anyone signed in and part of the league may apply -- for themselves only,
-- and only in the 'applied' state. They cannot approve themselves.
create policy "apply for self"
  on coach_applications for insert
  with check (
    user_id = auth.uid()
    and status = 'applied'
    and is_org_member(organization_id)
  );

-- An applicant may withdraw, and nothing else. Without the status check in
-- `with check`, this UPDATE policy would let an applicant set their own
-- status to 'approved'.
create policy "withdraw own application"
  on coach_applications for update
  using (user_id = auth.uid() and status = 'applied')
  with check (user_id = auth.uid() and status = 'withdrawn');

create policy "managers decide applications"
  on coach_applications for all
  using (has_org_role(organization_id, 'league_manager'))
  with check (has_org_role(organization_id, 'league_manager'));

-- ---------------------------------------------------------------------------
-- Clearance
--
-- The question every assignment screen asks: has this person satisfied every
-- requirement this league currently has, and is each one still in date?
--
-- Expiry is per-requirement: `renews_after_months` null means a completion
-- never lapses, 12 means it must be redone annually. A league with no
-- requirements defined clears everyone, which is correct -- it means they
-- haven't told us what they check, not that they check nothing.
-- ---------------------------------------------------------------------------

create function public.missing_coach_requirements(org uuid, coach uuid)
returns setof coach_requirements
language sql
stable
security definer
set search_path = public
as $$
  select r.*
  from coach_requirements r
  where r.organization_id = org
    and r.is_active
    and not exists (
      select 1
      from coach_requirement_completions c
      where c.requirement_id = r.id
        and c.user_id = coach
        and (
          r.renews_after_months is null
          or c.completed_on > (current_date - (r.renews_after_months || ' months')::interval)
        )
    );
$$;

create function public.is_coach_cleared(org uuid, coach uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from missing_coach_requirements(org, coach));
$$;

-- The gate itself.
--
-- In the database rather than only in the action that assigns a coach,
-- because this is the one rule in the product where a bug has a child on the
-- other side of it. Any path that inserts into team_coaches -- a form, a
-- script, an import, a future bulk tool nobody has written yet -- hits this.
create function public.enforce_coach_clearance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_coach_cleared(new.organization_id, new.user_id) then
    raise exception
      'This coach has not completed the league''s requirements yet.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger team_coaches_require_clearance
  before insert or update on team_coaches
  for each row execute function public.enforce_coach_clearance();

-- ---------------------------------------------------------------------------
-- Who a league manager needs to see
--
-- A list of everyone who has applied or been approved, with their clearance
-- state and what's outstanding. A view rather than a query in the app so the
-- clearance rule has exactly one definition.
--
-- security_invoker: it reads coach_applications and memberships, and must
-- respect the caller's policies on both rather than the view owner's.
-- ---------------------------------------------------------------------------

create view coach_roster
  with (security_invoker = true) as
select
  a.organization_id,
  a.user_id,
  a.status as application_status,
  a.created_at as applied_at,
  a.experience,
  a.phone,
  is_coach_cleared(a.organization_id, a.user_id) as cleared,
  (select count(*) from missing_coach_requirements(a.organization_id, a.user_id)) as missing_count
from coach_applications a;
