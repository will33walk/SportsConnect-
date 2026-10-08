-- 0004_messaging.sql
--
-- Team and league messaging, notifications, and push subscriptions.
--
-- The source system's `messages` table carried five channel types, two of them
-- municipal (`branch`, `vendor_support`) plus a repeated six-value department
-- enum. Those are gone. What remains -- direct, team, program -- is what a
-- league actually uses, and it is the part that was already good.

create table message_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  channel_type text not null check (channel_type in ('direct', 'team', 'program')),
  -- Exactly one of these is set, matching channel_type.
  team_id uuid references teams (id) on delete cascade,
  program_id uuid references programs (id) on delete cascade,
  subject text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint thread_target_matches_type check (
    (channel_type = 'team'    and team_id is not null and program_id is null)
    or (channel_type = 'program' and program_id is not null and team_id is null)
    or (channel_type = 'direct'  and team_id is null and program_id is null)
  )
);

create index message_threads_team_idx on message_threads (team_id);
create index message_threads_program_idx on message_threads (program_id);

-- Explicit participants, so a direct thread has a membership list and a team
-- thread can still be narrowed (coaches-only) without a second table.
create table thread_participants (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references message_threads (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  unique (thread_id, user_id)
);

create index thread_participants_user_idx on thread_participants (user_id);

create function public.in_thread(thread uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from thread_participants tp
    where tp.thread_id = thread and tp.user_id = auth.uid()
  );
$$;

create table messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references message_threads (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  author_id uuid references profiles (id) on delete set null,
  body text not null check (length(body) between 1 and 8000),
  -- An announcement is a one-way broadcast: it appears in the thread but does
  -- not invite replies, and it is what triggers a push.
  is_announcement boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index messages_thread_idx on messages (thread_id, created_at desc);

create table message_reads (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references message_threads (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  unique (thread_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Notifications and push
--
-- Web Push, not a native app store build. Each league is delivered as an
-- installable PWA, so a parent adds the league to their home screen and gets
-- notifications without anything to download.
-- ---------------------------------------------------------------------------

create table notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx
  on notifications (user_id, created_at desc) where read_at is null;

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table message_threads enable row level security;
alter table thread_participants enable row level security;
alter table messages enable row level security;
alter table message_reads enable row level security;
alter table notifications enable row level security;
alter table push_subscriptions enable row level security;

create policy "read threads i'm in"
  on message_threads for select
  using (in_thread(id) or has_org_role(organization_id, 'league_manager'));

create policy "managers manage threads"
  on message_threads for all
  using (has_org_role(organization_id, 'league_manager'))
  with check (has_org_role(organization_id, 'league_manager'));

create policy "read participants of my threads"
  on thread_participants for select
  using (user_id = auth.uid() or in_thread(thread_id));

create policy "managers manage participants"
  on thread_participants for all
  using (has_org_role(organization_id, 'league_manager'))
  with check (has_org_role(organization_id, 'league_manager'));

create policy "read messages in my threads"
  on messages for select
  using (in_thread(thread_id) and deleted_at is null);

create policy "post to my threads"
  on messages for insert
  with check (in_thread(thread_id) and author_id = auth.uid() and is_org_member(organization_id));

create policy "edit own messages"
  on messages for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "manage own read marks"
  on message_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "own notifications"
  on notifications for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "own push subscriptions"
  on push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
