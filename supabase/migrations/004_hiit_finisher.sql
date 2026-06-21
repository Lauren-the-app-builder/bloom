-- Bloom: add hiit_finisher boolean to bloom_sessions.
--
-- Marks lift sessions Lauren followed with a 20-min HIIT finisher. The flag
-- rides along on the lift row (rather than a separate cardio session) so
-- history + the Today schedule can render the ⚡ glyph from a single
-- record. Defaults to false so existing rows read as "no HIIT" and the
-- pusher in sync.js can write the boolean unconditionally.

alter table public.bloom_sessions
  add column if not exists hiit_finisher boolean not null default false;
