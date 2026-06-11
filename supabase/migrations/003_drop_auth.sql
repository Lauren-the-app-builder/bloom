-- Drop Bloom's per-user auth — single-tenant from here on.
--
-- Touches every table Bloom reads/writes: the bloom_* tables (001_bloom.sql)
-- and the wren_* tables (002_wren.sql). Does NOT touch any grocery_* table
-- or anything else in the project.
--
-- After this migration the anon key can read/write these tables directly
-- without a logged-in user, so the app no longer needs a sign-in step.
--
-- Idempotent: re-running is a no-op.

begin;

-- 1) Disable RLS on every Bloom/Wren table.
alter table public.bloom_workouts          disable row level security;
alter table public.bloom_sessions          disable row level security;
alter table public.bloom_chat_history      disable row level security;
alter table public.bloom_custom_exercises  disable row level security;
alter table public.bloom_kv                disable row level security;
alter table public.wren_program            disable row level security;
alter table public.wren_chat               disable row level security;
alter table public.wren_missed_sessions    disable row level security;

-- 2) Drop the owner-only policies created by 001/002. They no longer apply.
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

drop policy if exists "wren_program_owner_select"            on public.wren_program;
drop policy if exists "wren_program_owner_insert"            on public.wren_program;
drop policy if exists "wren_program_owner_update"            on public.wren_program;
drop policy if exists "wren_program_owner_delete"            on public.wren_program;

drop policy if exists "wren_chat_owner_select"               on public.wren_chat;
drop policy if exists "wren_chat_owner_insert"               on public.wren_chat;
drop policy if exists "wren_chat_owner_update"               on public.wren_chat;
drop policy if exists "wren_chat_owner_delete"               on public.wren_chat;

drop policy if exists "wren_missed_sessions_owner_select"    on public.wren_missed_sessions;
drop policy if exists "wren_missed_sessions_owner_insert"    on public.wren_missed_sessions;
drop policy if exists "wren_missed_sessions_owner_update"    on public.wren_missed_sessions;
drop policy if exists "wren_missed_sessions_owner_delete"    on public.wren_missed_sessions;

-- 3) Make user_id optional so anon writes (which carry no user) succeed.
--    Existing rows keep their user_id; new rows can leave it NULL.
alter table public.bloom_workouts          alter column user_id drop not null;
alter table public.bloom_sessions          alter column user_id drop not null;
alter table public.bloom_chat_history      alter column user_id drop not null;
alter table public.bloom_custom_exercises  alter column user_id drop not null;
alter table public.wren_program            alter column user_id drop not null;
alter table public.wren_chat               alter column user_id drop not null;
alter table public.wren_missed_sessions    alter column user_id drop not null;

-- 4) bloom_kv had a composite PK (user_id, key). Switch to a key-only PK so
--    upserts don't need a user_id, and drop NOT NULL on user_id to match.
alter table public.bloom_kv drop constraint if exists bloom_kv_pkey;
alter table public.bloom_kv alter column user_id drop not null;
alter table public.bloom_kv add  constraint bloom_kv_pkey primary key (key);

commit;
