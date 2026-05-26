-- Bloom schema. All tables prefixed `bloom_` to coexist with the Welltrack
-- project in the same Supabase instance. Every row scoped to a Supabase auth
-- user via user_id = auth.uid().

create extension if not exists "pgcrypto";

-- ---------- workouts (user-defined templates) ----------
create table if not exists public.bloom_workouts (
  id           text primary key,                       -- client-generated id (e.g. "c1775...")
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  exercises    jsonb not null default '[]'::jsonb,     -- string[]
  scene        text,
  tag          text,
  supersets    jsonb not null default '[]'::jsonb,
  targets      jsonb not null default '{}'::jsonb,
  rests        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists bloom_workouts_user_idx on public.bloom_workouts(user_id);

-- ---------- sessions (completed workouts) ----------
create table if not exists public.bloom_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  workout_name  text not null,
  tag           text,
  exercises     jsonb not null default '{}'::jsonb,    -- { exerciseName: [{reps,weight}, ...] }
  duration_sec  integer not null default 0,
  finished_at   timestamptz not null,
  created_at    timestamptz not null default now()
);
create index if not exists bloom_sessions_user_finished_idx
  on public.bloom_sessions(user_id, finished_at desc);

-- ---------- chat history (Wren) ----------
create table if not exists public.bloom_chat_history (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text,
  messages    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists bloom_chat_history_user_idx
  on public.bloom_chat_history(user_id, updated_at desc);

-- ---------- custom exercises ----------
create table if not exists public.bloom_custom_exercises (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  muscle     text,
  rest_sec   integer default 90,
  tips       jsonb not null default '[]'::jsonb,
  video_id   text,
  created_at timestamptz not null default now()
);
create index if not exists bloom_custom_exercises_user_idx
  on public.bloom_custom_exercises(user_id);

-- ---------- generic key/value bag ----------
-- For settings that don't justify their own table:
--   schedule, lastSessions, coachContext, unit, exerciseNotes, focusLiftName
create table if not exists public.bloom_kv (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- ---------- RLS ----------
alter table public.bloom_workouts          enable row level security;
alter table public.bloom_sessions          enable row level security;
alter table public.bloom_chat_history      enable row level security;
alter table public.bloom_custom_exercises  enable row level security;
alter table public.bloom_kv                enable row level security;

-- Drop any prior policies to keep this script idempotent.
drop policy if exists "bloom_workouts_owner_select"          on public.bloom_workouts;
drop policy if exists "bloom_workouts_owner_insert"          on public.bloom_workouts;
drop policy if exists "bloom_workouts_owner_update"          on public.bloom_workouts;
drop policy if exists "bloom_workouts_owner_delete"          on public.bloom_workouts;
drop policy if exists "bloom_sessions_owner_select"          on public.bloom_sessions;
drop policy if exists "bloom_sessions_owner_insert"          on public.bloom_sessions;
drop policy if exists "bloom_sessions_owner_update"          on public.bloom_sessions;
drop policy if exists "bloom_sessions_owner_delete"          on public.bloom_sessions;
drop policy if exists "bloom_chat_history_owner_select"      on public.bloom_chat_history;
drop policy if exists "bloom_chat_history_owner_insert"      on public.bloom_chat_history;
drop policy if exists "bloom_chat_history_owner_update"      on public.bloom_chat_history;
drop policy if exists "bloom_chat_history_owner_delete"      on public.bloom_chat_history;
drop policy if exists "bloom_custom_exercises_owner_select"  on public.bloom_custom_exercises;
drop policy if exists "bloom_custom_exercises_owner_insert"  on public.bloom_custom_exercises;
drop policy if exists "bloom_custom_exercises_owner_update"  on public.bloom_custom_exercises;
drop policy if exists "bloom_custom_exercises_owner_delete"  on public.bloom_custom_exercises;
drop policy if exists "bloom_kv_owner_select"                on public.bloom_kv;
drop policy if exists "bloom_kv_owner_insert"                on public.bloom_kv;
drop policy if exists "bloom_kv_owner_update"                on public.bloom_kv;
drop policy if exists "bloom_kv_owner_delete"                on public.bloom_kv;

-- One block per table because policy text is per-table.
create policy "bloom_workouts_owner_select" on public.bloom_workouts for select using (auth.uid() = user_id);
create policy "bloom_workouts_owner_insert" on public.bloom_workouts for insert with check (auth.uid() = user_id);
create policy "bloom_workouts_owner_update" on public.bloom_workouts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bloom_workouts_owner_delete" on public.bloom_workouts for delete using (auth.uid() = user_id);

create policy "bloom_sessions_owner_select" on public.bloom_sessions for select using (auth.uid() = user_id);
create policy "bloom_sessions_owner_insert" on public.bloom_sessions for insert with check (auth.uid() = user_id);
create policy "bloom_sessions_owner_update" on public.bloom_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bloom_sessions_owner_delete" on public.bloom_sessions for delete using (auth.uid() = user_id);

create policy "bloom_chat_history_owner_select" on public.bloom_chat_history for select using (auth.uid() = user_id);
create policy "bloom_chat_history_owner_insert" on public.bloom_chat_history for insert with check (auth.uid() = user_id);
create policy "bloom_chat_history_owner_update" on public.bloom_chat_history for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bloom_chat_history_owner_delete" on public.bloom_chat_history for delete using (auth.uid() = user_id);

create policy "bloom_custom_exercises_owner_select" on public.bloom_custom_exercises for select using (auth.uid() = user_id);
create policy "bloom_custom_exercises_owner_insert" on public.bloom_custom_exercises for insert with check (auth.uid() = user_id);
create policy "bloom_custom_exercises_owner_update" on public.bloom_custom_exercises for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bloom_custom_exercises_owner_delete" on public.bloom_custom_exercises for delete using (auth.uid() = user_id);

create policy "bloom_kv_owner_select" on public.bloom_kv for select using (auth.uid() = user_id);
create policy "bloom_kv_owner_insert" on public.bloom_kv for insert with check (auth.uid() = user_id);
create policy "bloom_kv_owner_update" on public.bloom_kv for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bloom_kv_owner_delete" on public.bloom_kv for delete using (auth.uid() = user_id);
