-- Wren AI Coach tables. Follows the same conventions as 001_bloom.sql.

-- ---------- wren_program: stores the 12-week periodized program ----------
create table if not exists public.wren_program (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  program_json jsonb not null default '{}'::jsonb,
  active       boolean not null default true
);
create index if not exists wren_program_user_idx on public.wren_program(user_id);

-- ---------- wren_chat: individual message rows ----------
create table if not exists public.wren_chat (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  created_at        timestamptz not null default now(),
  role              text not null,
  content           text not null,
  context_snapshot  jsonb
);
create index if not exists wren_chat_user_idx on public.wren_chat(user_id, created_at);

-- ---------- wren_missed_sessions: tracks skipped workouts ----------
create table if not exists public.wren_missed_sessions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  session_date           date not null,
  session_type           text,
  reason_category        text,
  reason_text            text,
  punishment_assigned    boolean not null default false,
  punishment_description text,
  created_at             timestamptz not null default now()
);
create index if not exists wren_missed_user_idx on public.wren_missed_sessions(user_id, session_date desc);

-- ---------- RLS ----------
alter table public.wren_program          enable row level security;
alter table public.wren_chat             enable row level security;
alter table public.wren_missed_sessions  enable row level security;

-- wren_program policies
drop policy if exists "wren_program_owner_select" on public.wren_program;
drop policy if exists "wren_program_owner_insert" on public.wren_program;
drop policy if exists "wren_program_owner_update" on public.wren_program;
drop policy if exists "wren_program_owner_delete" on public.wren_program;
create policy "wren_program_owner_select" on public.wren_program for select using (auth.uid() = user_id);
create policy "wren_program_owner_insert" on public.wren_program for insert with check (auth.uid() = user_id);
create policy "wren_program_owner_update" on public.wren_program for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "wren_program_owner_delete" on public.wren_program for delete using (auth.uid() = user_id);

-- wren_chat policies
drop policy if exists "wren_chat_owner_select" on public.wren_chat;
drop policy if exists "wren_chat_owner_insert" on public.wren_chat;
drop policy if exists "wren_chat_owner_update" on public.wren_chat;
drop policy if exists "wren_chat_owner_delete" on public.wren_chat;
create policy "wren_chat_owner_select" on public.wren_chat for select using (auth.uid() = user_id);
create policy "wren_chat_owner_insert" on public.wren_chat for insert with check (auth.uid() = user_id);
create policy "wren_chat_owner_update" on public.wren_chat for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "wren_chat_owner_delete" on public.wren_chat for delete using (auth.uid() = user_id);

-- wren_missed_sessions policies
drop policy if exists "wren_missed_sessions_owner_select" on public.wren_missed_sessions;
drop policy if exists "wren_missed_sessions_owner_insert" on public.wren_missed_sessions;
drop policy if exists "wren_missed_sessions_owner_update" on public.wren_missed_sessions;
drop policy if exists "wren_missed_sessions_owner_delete" on public.wren_missed_sessions;
create policy "wren_missed_sessions_owner_select" on public.wren_missed_sessions for select using (auth.uid() = user_id);
create policy "wren_missed_sessions_owner_insert" on public.wren_missed_sessions for insert with check (auth.uid() = user_id);
create policy "wren_missed_sessions_owner_update" on public.wren_missed_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "wren_missed_sessions_owner_delete" on public.wren_missed_sessions for delete using (auth.uid() = user_id);
