-- Bloom: multi-program support.
--
-- wren_program becomes a real list the user can see and manage (name +
-- archived, instead of every past regenerate just piling up as anonymous
-- inactive rows). bloom_sessions and wren_chat gain program_id so history
-- and Wren conversations can be scoped to a single program instead of the
-- regex/date-window guessing ProgramView.jsx does today. All additive and
-- backward compatible — existing rows read with sane defaults (name: null,
-- archived: false, program_id: null).

alter table public.wren_program
  add column if not exists name       text,
  add column if not exists archived   boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.bloom_sessions
  add column if not exists program_id uuid references public.wren_program(id) on delete set null;
create index if not exists bloom_sessions_program_idx on public.bloom_sessions(program_id, finished_at);

alter table public.wren_chat
  add column if not exists program_id uuid references public.wren_program(id) on delete cascade;
create index if not exists wren_chat_program_idx on public.wren_chat(program_id, created_at);
