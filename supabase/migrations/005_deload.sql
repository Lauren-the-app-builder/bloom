-- Bloom: add deload boolean to bloom_sessions.
--
-- Marks a session Lauren completed as a deload — an intentionally light day.
-- The session still counts as "done" (streaks, totals, history), but is
-- excluded from "previous performance" recall (see isDeloadSession /
-- getBaselineSessions in src/lib/storage.js) so the next time the same
-- workout comes around it seeds from last week's real numbers instead of the
-- deload. Defaults to false so existing rows read as "not a deload" and the
-- pusher in sync.js can write the boolean unconditionally.

alter table public.bloom_sessions
  add column if not exists deload boolean not null default false;
