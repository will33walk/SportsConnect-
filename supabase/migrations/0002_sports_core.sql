-- 0002_sports_core.sql
--
-- Sports, seasons, teams, people, money.
--
-- Carried over from MCParksConnect's programs/leagues model, with four
-- deliberate changes:
--
--   1. Every table carries organization_id and is policed per tenant.
--   2. `branch` (the six-value municipal department enum: zoo, golf,
--      maintenance...) is gone. `sport` takes its place as the dimension that
--      actually varies for this product.
--   3. Sports are rows, not a hardcoded check constraint, so adding
--      basketball is configuration rather than a migration.
--   4. Promo codes exist. The source system had only sibling discounts.

-- ---------------------------------------------------------------------------
-- Shared trigger
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sports
--
-- Global catalog, not per-tenant: baseball scores the same everywhere. The
-- scoring_engine key is what tells the app which rules module drives live
-- tracking -- see src/lib/sports/registry.ts. A sport with no engine yet can
-- still run schedules, rosters and final scores; it just can't do pitch-by-
-- pitch live tracking until its module ships.
-- ---------------------------------------------------------------------------

create table sports (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  label text not null,
  -- 'baseball' is the only engine at launch. Basketball, volleyball and
  -- soccer run on the shared period/possession engine once it lands.
  scoring_engine text,
  -- How a game's clock or structure is divided, for schedule and box-score UI.
  period_noun text not null default 'period',
  period_count integer,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

insert into sports (key, label, scoring_engine, period_noun, period_count, sort_order) values
  ('baseball',   'Baseball',   'baseball', 'inning',  6,    1),
  ('softball',   'Softball',   'baseball', 'inning',  6,    2),
  ('basketball', 'Basketball', null,       'quarter', 4,    3),
  ('volleyball', 'Volleyball', null,       'set',     5,    4),
  ('soccer',     'Soccer',     null,       'half',    2,    5);

-- ---------------------------------------------------------------------------
-- Programs -- the shared taxonomy, as in the source system
-- ---------------------------------------------------------------------------

create table programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  kind text not null check (kind in ('league', 'camp', 'clinic', 'class', 'club', 'event')),
  sport_key text references sports (key),
  parent_program_id uuid references programs (id) on delete cascade,

  title text not null,
  slug text not null,
  description text,
  short_description text,
  category text,

  age_min integer,
  age_max integer,
  capacity integer,

  is_free boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'registration_closed', 'archived', 'cancelled')),

  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  starts_on date,
  ends_on date,

  sibling_discount_enabled boolean not null default false,
  sibling_discount_type text check (sibling_discount_type in ('percent', 'flat')),
  sibling_discount_rate numeric,

  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Slugs are unique per tenant, not globally: two leagues may both run a
  -- "spring-rec-baseball".
  unique (organization_id, slug)
);

create index programs_org_kind_status_idx on programs (organization_id, kind, status);
create index programs_parent_idx on programs (parent_program_id);

create trigger set_programs_updated_at
  before update on programs
  for each row execute function set_updated_at();

-- 1:1 extension, sharing the PK -- columns meaningless for the other kinds.
create table leagues (
  id uuid primary key references programs (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  bracket_format text not null default 'round_robin'
    check (bracket_format in ('single_elimination', 'double_elimination', 'round_robin', 'pool_play_elimination')),
  -- Three independent timestamps rather than one status: a schedule often goes
  -- public while rosters are still being finalised.
  schedule_published_at timestamptz,
  rosters_published_at timestamptz,
  standings_published_at timestamptz,
  live_tracking_enabled boolean not null default false
);

-- ---------------------------------------------------------------------------
-- Households -- a parent and the children they register
-- ---------------------------------------------------------------------------

create table households (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  primary_contact_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (organization_id, primary_contact_id)
);

create table dependents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  date_of_birth date,
  created_at timestamptz not null default now()
);

create index dependents_household_idx on dependents (household_id);

-- A second guardian who can also see and manage a household's registrations.
create table household_links (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Pricing, questions, promo codes
-- ---------------------------------------------------------------------------

create table pricing_tiers (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  label text not null,
  tier_type text not null
    check (tier_type in ('per_session', 'daily', 'weekly', 'monthly', 'full_season')),
  amount_cents integer not null check (amount_cents >= 0),
  -- Availability windows: early-bird and late pricing without a second table.
  available_from timestamptz,
  available_until timestamptz,
  capacity integer,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index pricing_tiers_program_idx on pricing_tiers (program_id);

-- Reusable question catalog, per tenant, plus per-program selection. This
-- pattern came over wholesale -- it's one of the better designs in the source.
create table question_bank (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  label text not null,
  field_type text not null
    check (field_type in ('short_text', 'long_text', 'select', 'multi_select', 'checkbox', 'date')),
  options jsonb,
  help_text text,
  created_at timestamptz not null default now()
);

create table program_questions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  question_id uuid not null references question_bank (id) on delete restrict,
  organization_id uuid not null references organizations (id) on delete cascade,
  is_required boolean not null default false,
  sort_order integer not null default 0,
  unique (program_id, question_id)
);

-- New here. The incumbents all charge for this; the source system had only
-- sibling discounts. A code is org-wide, optionally narrowed to one program.
create table promo_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  code text not null,
  program_id uuid references programs (id) on delete cascade,
  discount_type text not null check (discount_type in ('percent', 'flat')),
  discount_value numeric not null check (discount_value > 0),
  max_redemptions integer check (max_redemptions > 0),
  redeemed_count integer not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  -- Case-insensitive uniqueness per tenant: "SPRING25" and "spring25" are one
  -- code, because a parent typing it will not distinguish them.
  unique (organization_id, code)
);

create index promo_codes_lookup_idx on promo_codes (organization_id, lower(code));

-- ---------------------------------------------------------------------------
-- Registrations
-- ---------------------------------------------------------------------------

create table registrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  program_id uuid not null references programs (id) on delete cascade,
  dependent_id uuid references dependents (id) on delete set null,
  -- An adult registering themselves has no dependent row.
  registrant_id uuid references profiles (id) on delete set null,

  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'waitlisted', 'cancelled', 'refunded')),

  pricing_tier_id uuid references pricing_tiers (id),
  promo_code_id uuid references promo_codes (id) on delete set null,
  amount_due_cents integer not null default 0,
  amount_paid_cents integer not null default 0,

  -- Stripe, not Square: per-tenant Connect accounts rather than one merchant.
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,

  -- Snapshot of the registration questions as answered. Stored rather than
  -- joined so editing the question bank never rewrites history.
  answers jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint registration_has_a_person
    check (dependent_id is not null or registrant_id is not null)
);

create index registrations_program_idx on registrations (program_id, status);
create index registrations_dependent_idx on registrations (dependent_id);
create index registrations_org_idx on registrations (organization_id);

create trigger set_registrations_updated_at
  before update on registrations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Teams and rosters
-- ---------------------------------------------------------------------------

create table teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now()
);

create index teams_league_idx on teams (league_id);

-- The roster is the draft's output: a registration placed on a team. The
-- undrafted pool is "confirmed registrations for this league with no row here".
create table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  registration_id uuid not null unique references registrations (id) on delete cascade,
  jersey_number text,
  drafted_at timestamptz not null default now(),
  drafted_by uuid references profiles (id)
);

create index team_members_team_idx on team_members (team_id);

-- Per-resource grant. This pattern -- rather than a global role -- is what
-- makes "this coach, this team" expressible, and it is the shape the whole
-- permission model leans on for scoped access.
create table team_coaches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role text not null default 'assistant' check (role in ('head', 'assistant')),
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create index team_coaches_user_idx on team_coaches (user_id);

create function public.coaches_team(team uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from team_coaches tc
    where tc.team_id = team and tc.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Coach vetting
--
-- Lifted near-as-is. Note what this is NOT: it does not run background checks.
-- It is a catalog of requirements the org defines, plus a staff confirmation
-- that each one was satisfied elsewhere. Leagues keep using whatever provider
-- they already use; this records the result.
-- ---------------------------------------------------------------------------

create table coach_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  label text not null,
  description text,
  -- Most vetting expires. 12 = re-confirm annually; null = one and done.
  renews_after_months integer check (renews_after_months > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table coach_requirement_completions (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references coach_requirements (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  completed_on date not null default current_date,
  confirmed_by uuid references profiles (id),
  note text,
  created_at timestamptz not null default now(),
  unique (requirement_id, user_id, completed_on)
);

create index coach_completions_user_idx on coach_requirement_completions (user_id);

-- ---------------------------------------------------------------------------
-- RLS
--
-- The shape repeats: read for org members, write for league_manager and above,
-- with narrower grants layered on where a coach or parent needs their own slice.
-- ---------------------------------------------------------------------------

alter table sports enable row level security;
create policy "sports readable by all" on sports for select using (true);

alter table programs enable row level security;
alter table leagues enable row level security;
alter table households enable row level security;
alter table dependents enable row level security;
alter table household_links enable row level security;
alter table pricing_tiers enable row level security;
alter table question_bank enable row level security;
alter table program_questions enable row level security;
alter table promo_codes enable row level security;
alter table registrations enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table team_coaches enable row level security;
alter table coach_requirements enable row level security;
alter table coach_requirement_completions enable row level security;

-- Read for members, manage for league_manager+. Applied to the tables where
-- that is the whole story.
do $$
declare t text;
begin
  foreach t in array array[
    'programs', 'leagues', 'pricing_tiers', 'question_bank',
    'program_questions', 'teams', 'coach_requirements'
  ] loop
    execute format(
      'create policy "org members read" on %I for select using (is_org_member(organization_id))', t);
    execute format(
      'create policy "managers write" on %I for all
         using (has_org_role(organization_id, ''league_manager''))
         with check (has_org_role(organization_id, ''league_manager''))', t);
  end loop;
end $$;

-- Promo codes are deliberately not readable by members: a parent should not be
-- able to enumerate every code. Validation happens in a security-definer
-- function that takes a code and returns only whether it applies.
create policy "managers manage promo codes"
  on promo_codes for all
  using (has_org_role(organization_id, 'league_manager'))
  with check (has_org_role(organization_id, 'league_manager'));

-- Households: the primary contact, anyone linked to it, and org admins.
create policy "household visible to its people"
  on households for select
  using (
    primary_contact_id = auth.uid()
    or exists (
      select 1 from household_links hl
      where hl.household_id = households.id and hl.user_id = auth.uid()
    )
    or has_org_role(organization_id, 'admin')
  );

create policy "create own household"
  on households for insert
  with check (primary_contact_id = auth.uid() and is_org_member(organization_id));

create policy "dependents follow their household"
  on dependents for all
  using (
    exists (select 1 from households h where h.id = dependents.household_id)
    and (
      exists (select 1 from households h
              where h.id = dependents.household_id and h.primary_contact_id = auth.uid())
      or exists (select 1 from household_links hl
                 where hl.household_id = dependents.household_id and hl.user_id = auth.uid())
      or has_org_role(organization_id, 'admin')
    )
  )
  with check (
    exists (select 1 from households h
            where h.id = dependents.household_id and h.primary_contact_id = auth.uid())
    or has_org_role(organization_id, 'admin')
  );

create policy "household links visible to household"
  on household_links for select
  using (
    user_id = auth.uid()
    or exists (select 1 from households h
               where h.id = household_links.household_id and h.primary_contact_id = auth.uid())
  );

-- Registrations: a parent sees their own household's; managers see all.
-- Inserts do NOT go through here -- they run server-side after payment is
-- validated, so the client never writes a registration directly.
create policy "read own registrations"
  on registrations for select
  using (
    registrant_id = auth.uid()
    or exists (
      select 1 from dependents d
      join households h on h.id = d.household_id
      where d.id = registrations.dependent_id
        and (
          h.primary_contact_id = auth.uid()
          or exists (select 1 from household_links hl
                     where hl.household_id = h.id and hl.user_id = auth.uid())
        )
    )
    or has_org_role(organization_id, 'league_manager')
  );

create policy "managers manage registrations"
  on registrations for all
  using (has_org_role(organization_id, 'league_manager'))
  with check (has_org_role(organization_id, 'league_manager'));

-- Rosters: published to the org, plus a coach's own team pre-publication.
create policy "read rosters"
  on team_members for select
  using (
    has_org_role(organization_id, 'league_manager')
    or coaches_team(team_id)
    or exists (
      select 1 from teams t
      join leagues l on l.id = t.league_id
      where t.id = team_members.team_id
        and l.rosters_published_at is not null
        and is_org_member(team_members.organization_id)
    )
  );

create policy "managers manage rosters"
  on team_members for all
  using (has_org_role(organization_id, 'league_manager'))
  with check (has_org_role(organization_id, 'league_manager'));

create policy "read team coaches"
  on team_coaches for select
  using (is_org_member(organization_id));

create policy "managers manage team coaches"
  on team_coaches for all
  using (has_org_role(organization_id, 'league_manager'))
  with check (has_org_role(organization_id, 'league_manager'));

-- A coach can see their own vetting status; managers see everyone's.
create policy "read own completions"
  on coach_requirement_completions for select
  using (user_id = auth.uid() or has_org_role(organization_id, 'league_manager'));

create policy "managers manage completions"
  on coach_requirement_completions for all
  using (has_org_role(organization_id, 'league_manager'))
  with check (has_org_role(organization_id, 'league_manager'));
