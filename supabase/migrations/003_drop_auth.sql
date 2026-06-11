-- Drop Bloom's per-user auth — single-tenant from here on.
--
-- Touches every table Bloom reads/writes: the bloom_* tables (001_bloom.sql)
-- and the wren_* tables (002_wren.sql). Does NOT touch any grocery_* table
-- or anything else in the project.
--
-- After this migration the anon key can read/write these tables directly
-- without a logged-in user, so the app no longer needs a sign-in step.
--
-- Defensive: each table is checked with to_regclass(), so missing tables are
-- skipped with a notice instead of erroring. Idempotent: safe to re-run.

do $$
declare
  t          text;
  kind       text;
  tables     text[] := array[
    'bloom_workouts',
    'bloom_sessions',
    'bloom_chat_history',
    'bloom_custom_exercises',
    'bloom_kv',
    'wren_program',
    'wren_chat',
    'wren_missed_sessions'
  ];
  kinds      text[] := array['select', 'insert', 'update', 'delete'];
begin
  foreach t in array tables loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'skipping public.% — table does not exist', t;
      continue;
    end if;

    -- 1) Disable RLS.
    execute format('alter table public.%I disable row level security', t);

    -- 2) Drop the owner-only policies from 001/002.
    foreach kind in array kinds loop
      execute format(
        'drop policy if exists %I on public.%I',
        t || '_owner_' || kind, t
      );
    end loop;

    -- 3) Make user_id optional so anon writes succeed, when the column exists.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'user_id'
    ) then
      execute format('alter table public.%I alter column user_id drop not null', t);
    end if;
  end loop;

  -- 4) bloom_kv had a composite PK (user_id, key). Switch to a key-only PK
  --    so upserts don't need a user_id. Skip if the table doesn't exist or
  --    the PK is already key-only.
  if to_regclass('public.bloom_kv') is not null then
    execute 'alter table public.bloom_kv drop constraint if exists bloom_kv_pkey';
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'bloom_kv' and column_name = 'key'
    ) then
      execute 'alter table public.bloom_kv add constraint bloom_kv_pkey primary key (key)';
    end if;
  end if;
end $$;
