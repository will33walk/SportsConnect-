-- 0003_games_and_stats.sql
--
-- Games, lineups, the stat catalog, the live event log, and the draft.
--
-- The event-sourcing design here is carried over intact from MCParksConnect
-- and is the most valuable thing in the lift: a game is an append-only log,
-- and the scoreboard, count, baserunners, who's up and every derived stat are
-- replayed from it. Nothing derived is stored, so undo is "delete the last
-- event", and the scorekeeper's screen, the public follow view and the stat
-- sheet cannot disagree with each other.
--
-- What changed: the log is no longer baseball-shaped at the database level.
-- `kind` was a check constraint listing pitch/plate_appearance/runner; those
-- are baseball's event kinds, not every sport's. Here the sport's rules module
-- owns its own event vocabulary and the database stores the sport key plus an
-- opaque payload. Basketball's engine writes its own kinds into the same table.

-- ---------------------------------------------------------------------------
-- Sessions -- games, practices and ordinary meeting times, one table
-- ---------------------------------------------------------------------------

create table program_sessions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  session_type text not null default 'game'
    check (session_type in ('game', 'practice', 'meeting')),

  home_team_id uuid references teams (id) on delete set null,
  away_team_id uuid references teams (id) on delete set null,

  location_name text,
  location_address text,

  start_at timestamptz not null,
  end_at timestamptz,

  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'final', 'cancelled', 'postponed')),

  home_score integer,
  away_score integer,

  round_label text,
  -- Freeform bracket identifier ('winners_r1_m1'). Application-layer
  -- advancement keys off it; a fully normalised bracket tree buys little and
  -- costs a lot across four formats.
  bracket_slot text,

  -- An embedded broadcast. Deliberately a URL rather than hosted video:
  -- leagues stream on YouTube or Facebook, which they already pay nothing for,
  -- and bandwidth at this price point would not survive hosting it ourselves.
  stream_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint teams_differ check (home_team_id is null or home_team_id <> away_team_id)
);

create index program_sessions_program_idx on program_sessions (program_id, start_at);
create index program_sessions_team_idx on program_sessions (home_team_id, away_team_id);

create trigger set_program_sessions_updated_at
  before update on program_sessions
  for each row execute function set_updated_at();

-- Computed on read. A stored standings table goes stale against live results
-- the moment a score is corrected. security_invoker so it respects the
-- caller's RLS on the underlying tables rather than the view owner's -- which
-- matters far more here than it did single-tenant: without it, this view would
-- be a hole straight through tenant isolation.
create view league_standings
  with (security_invoker = true) as
select
  t.id as team_id,
  t.league_id,
  t.organization_id,
  t.name as team_name,
  count(*) filter (
    where (ps.home_team_id = t.id and ps.home_score > ps.away_score)
       or (ps.away_team_id = t.id and ps.away_score > ps.home_score)
  ) as wins,
  count(*) filter (
    where (ps.home_team_id = t.id and ps.home_score < ps.away_score)
       or (ps.away_team_id = t.id and ps.away_score < ps.home_score)
  ) as losses,
  count(*) filter (
    where ps.home_score is not null and ps.home_score = ps.away_score
  ) as ties
from teams t
left join program_sessions ps
  on ps.session_type = 'game'
  and ps.status = 'final'
  and (ps.home_team_id = t.id or ps.away_team_id = t.id)
group by t.id, t.league_id, t.organization_id, t.name;

-- ---------------------------------------------------------------------------
-- Lineups
-- ---------------------------------------------------------------------------

-- Per game, not one reusable slot: editing game 5's lineup must never change
-- what game 3's lineup was.
create table game_lineups (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references program_sessions (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  team_member_id uuid not null references team_members (id) on delete cascade,
  batting_order integer,
  position text,
  set_at timestamptz not null default now(),
  set_by uuid references profiles (id),
  unique (session_id, team_member_id)
);

create unique index game_lineups_order_idx
  on game_lineups (session_id, team_id, batting_order)
  where batting_order is not null;

-- ---------------------------------------------------------------------------
-- Stat catalog
--
-- Org-scoped and sport-scoped. In the source this was a global table whose
-- stat_type was constrained to batting|pitching and seeded with twelve
-- baseball keys -- fine for one league, wrong for a product that has to hold
-- basketball and volleyball in the same database. `group_key` replaces the
-- constrained stat_type: each sport names its own groups.
-- ---------------------------------------------------------------------------

create table stat_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations (id) on delete cascade,
  sport_key text not null references sports (key),
  key text not null,
  label text not null,
  group_key text not null default 'general',
  -- Season leaderboards: how a category aggregates across games.
  aggregation text not null default 'sum' check (aggregation in ('sum', 'avg', 'max')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  -- organization_id null = a built-in the product ships. Tenants may add their
  -- own alongside. The partial indexes keep both uniqueness rules honest.
  check (organization_id is not null or true)
);

create unique index stat_categories_builtin_key_idx
  on stat_categories (sport_key, key) where organization_id is null;
create unique index stat_categories_org_key_idx
  on stat_categories (organization_id, sport_key, key) where organization_id is not null;

insert into stat_categories (sport_key, key, label, group_key, sort_order) values
  ('baseball', 'ab',          'At-bats',           'batting',  1),
  ('baseball', 'h',           'Hits',              'batting',  2),
  ('baseball', 'r',           'Runs',              'batting',  3),
  ('baseball', 'rbi',         'RBIs',              'batting',  4),
  ('baseball', 'bb',          'Walks',             'batting',  5),
  ('baseball', 'k',           'Strikeouts',        'batting',  6),
  ('baseball', 'sb',          'Stolen bases',      'batting',  7),
  ('baseball', 'ip',          'Innings pitched',   'pitching', 1),
  ('baseball', 'er',          'Earned runs',       'pitching', 2),
  ('baseball', 'k_pitching',  'Strikeouts',        'pitching', 3),
  ('baseball', 'bb_pitching', 'Walks',             'pitching', 4),
  ('baseball', 'h_allowed',   'Hits allowed',      'pitching', 5),

  ('basketball', 'pts', 'Points',          'scoring',  1),
  ('basketball', 'reb', 'Rebounds',        'general',  2),
  ('basketball', 'ast', 'Assists',         'general',  3),
  ('basketball', 'stl', 'Steals',          'general',  4),
  ('basketball', 'blk', 'Blocks',          'general',  5),
  ('basketball', 'pf',  'Fouls',           'general',  6),

  ('volleyball', 'kills',  'Kills',   'attack',  1),
  ('volleyball', 'assists','Assists', 'setting', 2),
  ('volleyball', 'digs',   'Digs',    'defense', 3),
  ('volleyball', 'blocks', 'Blocks',  'defense', 4),
  ('volleyball', 'aces',   'Aces',    'serve',   5),

  ('soccer', 'goals',   'Goals',       'scoring', 1),
  ('soccer', 'assists', 'Assists',     'scoring', 2),
  ('soccer', 'saves',   'Saves',       'keeping', 3),
  ('soccer', 'yc',      'Yellow cards','discipline', 4),
  ('soccer', 'rc',      'Red cards',   'discipline', 5);

-- Softball shares baseball's catalog.
insert into stat_categories (sport_key, key, label, group_key, aggregation, sort_order)
select 'softball', key, label, group_key, aggregation, sort_order
from stat_categories where sport_key = 'baseball' and organization_id is null;

-- Per-program enablement: a league turns on the handful it actually keeps.
create table program_stat_categories (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  category_id uuid not null references stat_categories (id) on delete restrict,
  sort_order integer not null default 0,
  unique (program_id, category_id)
);

create table game_stat_entries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references program_sessions (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  team_member_id uuid not null references team_members (id) on delete cascade,
  category_id uuid not null references stat_categories (id) on delete restrict,
  value numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (session_id, team_member_id, category_id)
);

create index game_stat_entries_session_idx on game_stat_entries (session_id);
create index game_stat_entries_member_idx on game_stat_entries (team_member_id);

-- Per-team lock, so one team finalising its sheet doesn't finalise the other's.
create table game_stat_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references program_sessions (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  submitted_by uuid references profiles (id),
  submitted_at timestamptz not null default now(),
  unique (session_id, team_id)
);

-- A per-game grant to any signed-in person -- the parent in the stands who
-- keeps the book. Not a role: a role would give them every game.
create table game_scorekeepers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references program_sessions (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  granted_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create function public.keeps_score_for(session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from game_scorekeepers gs
    where gs.session_id = session and gs.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- The live event log
-- ---------------------------------------------------------------------------

create table game_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references program_sessions (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  -- Which rules module wrote this, and therefore which one can read it back.
  sport_key text not null references sports (key),
  -- 1, 2, 3... per game. The unique constraint is the concurrency guard: a
  -- scorekeeper working from a stale view cannot slip an event in behind one
  -- that already landed.
  seq integer not null check (seq > 0),
  team_id uuid references teams (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  recorded_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);

create index game_events_session_seq_idx on game_events (session_id, seq);

-- ---------------------------------------------------------------------------
-- Draft
-- ---------------------------------------------------------------------------

create table drafts (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  status text not null default 'setup'
    check (status in ('setup', 'live', 'paused', 'complete')),
  order_type text not null default 'snake' check (order_type in ('snake', 'linear')),
  current_pick integer not null default 1,
  pick_seconds integer,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (league_id)
);

create table draft_team_settings (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references drafts (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  draft_position integer not null,
  unique (draft_id, team_id),
  unique (draft_id, draft_position)
);

create table draft_picks (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references drafts (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  pick_number integer not null,
  team_id uuid not null references teams (id) on delete cascade,
  registration_id uuid not null references registrations (id) on delete cascade,
  picked_by uuid references profiles (id),
  picked_at timestamptz not null default now(),
  unique (draft_id, pick_number),
  unique (draft_id, registration_id)
);

-- Pre-draft keeps: a returning player held by their prior team.
create table draft_keepers (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references drafts (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  registration_id uuid not null references registrations (id) on delete cascade,
  round_cost integer,
  unique (draft_id, registration_id)
);

-- A coach's private ranking. Visible only to that coach.
create table draft_list_entries (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references drafts (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  registration_id uuid not null references registrations (id) on delete cascade,
  rank integer not null,
  note text,
  unique (draft_id, user_id, registration_id)
);

create index draft_list_entries_owner_idx on draft_list_entries (draft_id, user_id, rank);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table program_sessions enable row level security;
alter table game_lineups enable row level security;
alter table stat_categories enable row level security;
alter table program_stat_categories enable row level security;
alter table game_stat_entries enable row level security;
alter table game_stat_submissions enable row level security;
alter table game_scorekeepers enable row level security;
alter table game_events enable row level security;
alter table drafts enable row level security;
alter table draft_team_settings enable row level security;
alter table draft_picks enable row level security;
alter table draft_keepers enable row level security;
alter table draft_list_entries enable row level security;

create policy "builtin stats readable" on stat_categories for select
  using (organization_id is null or is_org_member(organization_id));
create policy "managers manage org stats" on stat_categories for all
  using (organization_id is not null and has_org_role(organization_id, 'league_manager'))
  with check (organization_id is not null and has_org_role(organization_id, 'league_manager'));

do $$
declare t text;
begin
  foreach t in array array[
    'program_sessions', 'game_lineups', 'program_stat_categories',
    'game_stat_entries', 'game_stat_submissions', 'game_scorekeepers',
    'game_events', 'drafts', 'draft_team_settings', 'draft_picks', 'draft_keepers'
  ] loop
    execute format(
      'create policy "org members read" on %I for select using (is_org_member(organization_id))', t);
    execute format(
      'create policy "managers write" on %I for all
         using (has_org_role(organization_id, ''league_manager''))
         with check (has_org_role(organization_id, ''league_manager''))', t);
  end loop;
end $$;

-- A scorekeeper writes the log and the stat sheet for their own game only.
create policy "scorekeepers append events"
  on game_events for insert
  with check (keeps_score_for(session_id) and is_org_member(organization_id));

create policy "scorekeepers undo own game"
  on game_events for delete
  using (keeps_score_for(session_id));

create policy "scorekeepers write stats"
  on game_stat_entries for all
  using (keeps_score_for(session_id))
  with check (keeps_score_for(session_id));

-- A coach sets their own team's lineup.
create policy "coaches set own lineup"
  on game_lineups for all
  using (coaches_team(team_id))
  with check (coaches_team(team_id));

-- A draft list is private to the coach who wrote it, full stop -- not even an
-- org admin reads it, because the whole point is that it is their board.
create policy "own draft list only"
  on draft_list_entries for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_org_member(organization_id));
