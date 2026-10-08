-- 0001_tenancy.sql
--
-- The tenant boundary. Everything else in this schema hangs off it.
--
-- MCParksConnect, which much of this product's domain logic came from, was
-- single-tenant by construction: one municipality, one Supabase project, and
-- every RLS policy was `has_role('park_administrator')` -- a single global
-- superadmin predicate with no row filter. That works for one city and fails
-- the moment two leagues share a database. So tenancy is laid down first here,
-- before a single domain table exists, and every org-scoped table added later
-- carries `organization_id` and is policed by the helpers defined below.
--
-- Three ideas:
--   organizations  -- the tenant. A league org, a club, a parks department.
--   profiles       -- a person. Global, not per-tenant: one login, many orgs.
--   memberships    -- a person's role inside one org. The join is the boundary.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'),
  name text not null check (length(trim(name)) between 1 and 120),

  -- Tenant-local time. MCParksConnect hardcoded America/Chicago in 33 files;
  -- a product sold outside one time zone cannot do that. Every date rendered
  -- for an org resolves against this.
  timezone text not null default 'America/New_York',

  -- Branding. Rendered as CSS custom properties at request time, so a league
  -- gets its own colours without a rebuild. Null means the product default.
  logo_url text,
  brand_primary text check (brand_primary ~* '^#[0-9a-f]{6}$'),
  brand_accent text check (brand_accent ~* '^#[0-9a-f]{6}$'),

  -- Billing. Stripe Connect: each org is a connected account receiving its own
  -- registration money directly. Null until onboarding completes.
  stripe_account_id text unique,
  stripe_customer_id text unique,
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing','active','past_due','canceled')),
  trial_ends_at timestamptz not null default (now() + interval '30 days'),

  created_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table organizations is
  'A tenant. Every org-scoped row in this database belongs to exactly one.';

create index organizations_active_idx on organizations (id) where archived_at is null;

-- ---------------------------------------------------------------------------
-- Profiles -- one row per auth user, shared across every org they belong to
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Memberships -- the tenant boundary
-- ---------------------------------------------------------------------------

-- A real ladder, which the source system did not have. MCParksConnect had one
-- effective role (park_administrator) plus tiers derived from a municipal HR
-- table. These five are ordered, and `has_org_role` compares rank, so a policy
-- says "league_manager or above" once instead of enumerating roles.
create type org_role as enum (
  'member',          -- a parent or player: sees their own household only
  'coach',           -- plus their own teams
  'league_manager',  -- plus full control of leagues they run
  'admin',           -- plus org settings, billing, every league
  'owner'            -- plus ownership transfer and deletion
);

create function public.org_role_rank(role org_role)
returns integer
language sql
immutable
as $$
  select case role
    when 'member' then 10
    when 'coach' then 20
    when 'league_manager' then 30
    when 'admin' then 40
    when 'owner' then 50
  end;
$$;

create table memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role org_role not null default 'member',
  invited_by uuid references profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index memberships_user_idx on memberships (user_id);
create index memberships_org_idx on memberships (organization_id);

-- ---------------------------------------------------------------------------
-- Policy helpers
--
-- security definer so they can read memberships without recursing through
-- memberships' own RLS. search_path is pinned -- a security definer function
-- with a mutable search_path is a privilege-escalation hole.
-- ---------------------------------------------------------------------------

create function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.accepted_at is not null
  );
$$;

create function public.has_org_role(org uuid, minimum org_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.accepted_at is not null
      and org_role_rank(m.role) >= org_role_rank(minimum)
  );
$$;

-- Returns the caller's orgs. Useful for list screens that span tenants
-- (the org switcher) without a join against memberships in every query.
create function public.current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.organization_id from memberships m
  where m.user_id = auth.uid() and m.accepted_at is not null;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table memberships enable row level security;

create policy "members read their orgs"
  on organizations for select
  using (is_org_member(id));

create policy "admins update their org"
  on organizations for update
  using (has_org_role(id, 'admin'))
  with check (has_org_role(id, 'admin'));

-- Deliberately no insert policy: organizations are created through
-- create_organization() below, which also makes the caller its owner. An org
-- with no owner is unreachable, so the two writes must not be separable.

create policy "read own profile"
  on profiles for select
  using (id = auth.uid());

-- Everyone in an org can see the profiles of everyone else in it: coaches need
-- parent names, parents need coach names.
create policy "read profiles of org co-members"
  on profiles for select
  using (
    exists (
      select 1 from memberships mine
      join memberships theirs
        on theirs.organization_id = mine.organization_id
      where mine.user_id = auth.uid()
        and mine.accepted_at is not null
        and theirs.user_id = profiles.id
    )
  );

create policy "update own profile"
  on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "read memberships in my orgs"
  on memberships for select
  using (is_org_member(organization_id));

create policy "admins manage memberships"
  on memberships for all
  using (has_org_role(organization_id, 'admin'))
  with check (has_org_role(organization_id, 'admin'));

-- ---------------------------------------------------------------------------
-- Tenant signup
--
-- The whole self-service onboarding path in one transaction: a signed-in user
-- creates an org and becomes its owner. MCParksConnect had no equivalent --
-- admins there were provisioned by hand.
-- ---------------------------------------------------------------------------

create function public.create_organization(
  org_name text,
  org_slug text,
  org_timezone text default 'America/New_York'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org uuid;
begin
  if auth.uid() is null then
    raise exception 'must be signed in to create an organization';
  end if;

  insert into organizations (name, slug, timezone)
  values (trim(org_name), lower(trim(org_slug)), org_timezone)
  returning id into new_org;

  insert into memberships (organization_id, user_id, role, accepted_at)
  values (new_org, auth.uid(), 'owner', now());

  return new_org;
end;
$$;

revoke all on function public.create_organization(text, text, text) from public;
grant execute on function public.create_organization(text, text, text) to authenticated;
