// Offline-first sync layer between localStorage (cache) and Supabase (truth).
//
// Strategy:
//   - Reads always come from localStorage (instant, offline-safe).
//   - On boot, pullAll() fetches every bloom_*/wren_* row and replaces the
//     localStorage cache. No auth — the tables have RLS disabled and the
//     anon key reads/writes directly (see Supabase migration 003).
//   - On every write the app already updates localStorage, then calls
//     queue('workouts' | 'sessions' | ...) to push the change to Supabase.
//   - If a push fails (offline, network error) it sits in a retry queue
//     and gets re-tried on next online event / next boot.

import { supabase, isSupabaseConfigured } from './supabase';

const PREFIX = 'bloom:';
const QUEUE_KEY = PREFIX + 'syncQueue';

// Tombstones for sessions the user has deleted locally but whose remote row
// hasn't been confirmed-deleted yet. Persisted so the delete survives reloads,
// offline, transient network errors — anything that would otherwise let the
// next pullAll() resurrect the row. Drained by pushers.deletedSessions.
const TOMBSTONE_SESSIONS_KEY = 'deletedSessions';

function loadKV(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}

function saveKV(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch {
    /* localStorage write can fail under strict privacy modes — ignore. */
  }
}

// ---------- PULL ----------
export async function pullAll() {
  if (!isSupabaseConfigured) return;

  const [workouts, sessions, chats, kv, wrenChatRows, wrenPrograms, wrenMissed] = await Promise.all([
    supabase.from('bloom_workouts').select('*'),
    supabase.from('bloom_sessions').select('*').order('finished_at', { ascending: false }),
    supabase.from('bloom_chat_history').select('*').order('updated_at', { ascending: false }),
    supabase.from('bloom_kv').select('*'),
    supabase.from('wren_chat').select('*').order('created_at', { ascending: true }),
    supabase.from('wren_program').select('*'),
    supabase.from('wren_missed_sessions').select('*').order('session_date', { ascending: false }),
  ]);
  // bloom_custom_exercises is intentionally not pulled — table doesn't
  // exist in this project, and customExercises are kept local-only.
  const customs = { data: null };

  if (workouts.data) {
    saveKV('myWorkouts', workouts.data.map((w) => ({
      id: w.id, name: w.name, exercises: w.exercises || [], scene: w.scene,
      tag: w.tag, supersets: w.supersets || [], targets: w.targets || {}, rests: w.rests || {},
    })));
  }

  if (sessions.data) {
    // Filter out rows whose remote delete hasn't yet been confirmed — without
    // this, a pull that lands before pushers.deletedSessions has succeeded
    // would resurrect rows the user already removed.
    const tombstoned = new Set(loadKV(TOMBSTONE_SESSIONS_KEY, []));
    saveKV('sessions', sessions.data
      .filter((s) => !tombstoned.has(s.id))
      .map((s) => ({
        id: s.id,
        workoutName: s.workout_name,
        tag: s.tag,
        exercises: s.exercises || {},
        durationSec: s.duration_sec || 0,
        finishedAt: new Date(s.finished_at).getTime(),
      })));
  }

  if (customs.data) {
    saveKV('customExercises', customs.data.map((c) => ({
      id: c.id, name: c.name, muscle: c.muscle, restSec: c.rest_sec, tips: c.tips || [], videoId: c.video_id || '',
    })));
  }

  if (chats.data) {
    saveKV('chatHistory', chats.data.map((c) => ({
      id: c.id, title: c.title, messages: c.messages || [],
      createdAt: new Date(c.created_at).getTime(),
      updatedAt: new Date(c.updated_at).getTime(),
    })));
  }

  if (kv.data) {
    for (const row of kv.data) {
      saveKV(row.key, row.value);
    }
  }

  // One-time wrenNotes backfill — wrenNotes joined KV_KEYS after the
  // store had already been writing it local-only for a while, so the
  // first sync needs to seed it. If local has notes and the server
  // didn't return any, park a push job directly in the queue. We can't
  // use queue() here because pullAll runs while suppressPushes is true;
  // App.jsx releases the suppression ~250ms after we finish, then calls
  // flushQueue() which drains this job. Subsequent saves go through the
  // normal queue() path.
  const serverHasWrenNotes = (kv.data || []).some((row) => row.key === 'wrenNotes');
  const localWrenNotes = loadKV('wrenNotes', null);
  if (!serverHasWrenNotes && Array.isArray(localWrenNotes) && localWrenNotes.length) {
    const q = loadKV('syncQueue', []);
    q.push({ entity: 'kv', kvKey: 'wrenNotes', at: Date.now() });
    saveKV('syncQueue', q);
  }

  // Wren chat messages
  if (wrenChatRows.data) {
    saveKV('wrenChat', wrenChatRows.data.map((m) => ({
      id: m.id, role: m.role, content: m.content,
      context_snapshot: m.context_snapshot,
      created_at: new Date(m.created_at).getTime(),
    })));
  }

  // Wren programs
  if (wrenPrograms.data) {
    saveKV('wrenProgram', wrenPrograms.data.map((p) => ({
      id: p.id, program_json: p.program_json, active: p.active,
      created_at: new Date(p.created_at).getTime(),
    })));
  }

  // Wren missed sessions
  if (wrenMissed.data) {
    saveKV('wrenMissedSessions', wrenMissed.data.map((m) => ({
      id: m.id, session_date: m.session_date, session_type: m.session_type,
      reason_category: m.reason_category, reason_text: m.reason_text,
      punishment_assigned: m.punishment_assigned, punishment_description: m.punishment_description,
      created_at: new Date(m.created_at).getTime(),
    })));
  }

  // Notify the app so React state can re-read from localStorage.
  window.dispatchEvent(new CustomEvent('bloom:synced'));
}

// ---------- PUSH ----------
// Each entity is pushed by re-uploading the *current* localStorage state for
// that entity. This is dumb but bulletproof for a single-user app — no diffing
// or conflict resolution required. No user_id column either: tables are
// single-tenant since the auth layer was removed.

const pushers = {
  async myWorkouts() {
    const list = loadKV('myWorkouts', []);
    if (!list.length) return;
    const rows = list.map((w) => ({
      id: w.id,
      name: w.name,
      exercises: w.exercises || [],
      scene: w.scene || null,
      tag: w.tag || null,
      supersets: w.supersets || [],
      targets: w.targets || {},
      rests: w.rests || {},
      updated_at: new Date().toISOString(),
    }));
    // Upsert only — never delete. Real deletions are handled explicitly by
    // deleteWorkoutRemote() (see below) so we can't accidentally wipe rows
    // we haven't pulled yet.
    const { error } = await supabase.from('bloom_workouts').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  },

  async sessions() {
    const list = loadKV('sessions', []);
    if (!list.length) return;
    const rows = list.map((s) => ({
      id: s.id || crypto.randomUUID(),
      workout_name: s.workoutName,
      tag: s.tag || null,
      exercises: s.exercises || {},
      duration_sec: s.durationSec || 0,
      finished_at: new Date(s.finishedAt).toISOString(),
    }));
    // Write IDs back to localStorage so future pushes are stable.
    saveKV('sessions', list.map((s, i) => ({ ...s, id: rows[i].id })));
    const { error } = await supabase.from('bloom_sessions').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  },

  // customExercises stays local-only — bloom_custom_exercises doesn't exist
  // in Supabase for this project. Keep the no-op pusher so queued jobs from
  // earlier in the session drain cleanly without blocking the queue.
  async customExercises() {
    return;
  },

  async chatHistory() {
    const list = loadKV('chatHistory', []);
    if (!list.length) return;
    const rows = list.map((c) => ({
      id: c.id, title: c.title || null, messages: c.messages || [],
      created_at: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
      updated_at: c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString(),
    }));
    const { error } = await supabase.from('bloom_chat_history').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  },

  // ---------- Wren entities ----------
  async wrenChat() {
    const list = loadKV('wrenChat', []);
    if (!list.length) return;
    const rows = list.map((m) => ({
      id: m.id, role: m.role, content: m.content,
      context_snapshot: m.context_snapshot || null,
      created_at: m.created_at ? new Date(m.created_at).toISOString() : new Date().toISOString(),
    }));
    const { error } = await supabase.from('wren_chat').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  },

  async wrenProgram() {
    const list = loadKV('wrenProgram', []);
    if (!list.length) return;
    const rows = list.map((p) => ({
      id: p.id, program_json: p.program_json || {},
      active: !!p.active,
      created_at: p.created_at ? new Date(p.created_at).toISOString() : new Date().toISOString(),
    }));
    const { error } = await supabase.from('wren_program').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  },

  async wrenMissedSessions() {
    const list = loadKV('wrenMissedSessions', []);
    if (!list.length) return;
    const rows = list.map((m) => ({
      id: m.id, session_date: m.session_date, session_type: m.session_type || null,
      reason_category: m.reason_category || null, reason_text: m.reason_text || null,
      punishment_assigned: !!m.punishment_assigned, punishment_description: m.punishment_description || null,
      created_at: m.created_at ? new Date(m.created_at).toISOString() : new Date().toISOString(),
    }));
    const { error } = await supabase.from('wren_missed_sessions').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  },

  // Drain the session-delete tombstone list. Runs one bulk delete, then
  // clears only the ids we just processed (so a tombstone added mid-flight
  // isn't lost). Re-queued automatically on failure by flushQueue().
  async deletedSessions() {
    const ids = loadKV(TOMBSTONE_SESSIONS_KEY, []);
    if (!ids.length) return;
    const { error } = await supabase.from('bloom_sessions')
      .delete()
      .in('id', ids);
    if (error) throw error;
    const processed = new Set(ids);
    const after = loadKV(TOMBSTONE_SESSIONS_KEY, []);
    saveKV(TOMBSTONE_SESSIONS_KEY, after.filter((id) => !processed.has(id)));
  },

  // KV-style settings, one per Supabase row. PK is just `key` after the
  // single-user migration, so no user_id in the payload.
  async kv(key) {
    const value = loadKV(key, null);
    if (value === null || value === undefined) return;
    const { error } = await supabase.from('bloom_kv').upsert(
      [{ key, value, updated_at: new Date().toISOString() }],
      { onConflict: 'key' }
    );
    if (error) throw error;
  },
};

const KV_KEYS = ['schedule', 'lastSessions', 'coachContext', 'unit', 'exerciseNotes', 'focusLiftName', 'wrenSetsOverrides', 'nourishCalorieGoal', 'nourishWeightLog', 'nourishPhase', 'wrenNotes'];

// While pulling, suppress queue() so the initial render's save() effects
// don't immediately push stale localStorage data back to Supabase.
let suppressPushes = false;
export function setSuppressPushes(v) { suppressPushes = !!v; }

// queue('myWorkouts') | queue('sessions') | queue('kv', 'schedule')
export function queue(entity, kvKey) {
  if (!isSupabaseConfigured) return;
  if (suppressPushes) return;
  const q = loadKV('syncQueue', []);
  q.push({ entity, kvKey, at: Date.now() });
  saveKV('syncQueue', q);
  // Best-effort flush in the background; don't await.
  flushQueue();
}

// Explicit delete helpers — call these from the UI when removing a row,
// instead of relying on the pusher to diff local vs remote.
export async function deleteWorkoutRemote(id) {
  if (!isSupabaseConfigured) return;
  await supabase.from('bloom_workouts').delete().eq('id', id);
}
export async function deleteSessionRemote(id) {
  if (!isSupabaseConfigured || !id) return;
  await supabase.from('bloom_sessions').delete().eq('id', id);
}
export async function deleteCustomExerciseRemote(_id) {
  // No-op — see pushers.customExercises above. Local delete still works.
  return;
}
export async function deleteChatRemote(id) {
  if (!isSupabaseConfigured) return;
  await supabase.from('bloom_chat_history').delete().eq('id', id);
}

// Durable session delete: parks the id in a tombstone list, then enqueues a
// flush. Replaces the previous fire-and-forget deleteSessionRemote() pattern,
// which silently failed offline and let pullAll() resurrect the row on next
// boot. Idempotent — calling twice with the same id is a no-op the second
// time.
export function tombstoneSession(id) {
  if (!id || !isSupabaseConfigured) return;
  const list = loadKV(TOMBSTONE_SESSIONS_KEY, []);
  if (list.includes(id)) return;
  list.push(id);
  saveKV(TOMBSTONE_SESSIONS_KEY, list);
  queue('deletedSessions');
}

let flushing = false;
export async function flushQueue() {
  if (flushing || !isSupabaseConfigured || !navigator.onLine) return;
  flushing = true;
  try {
    while (true) {
      const q = loadKV('syncQueue', []);
      if (!q.length) break;
      const job = q[0];
      try {
        if (job.entity === 'kv') {
          await pushers.kv(job.kvKey);
        } else if (pushers[job.entity]) {
          await pushers[job.entity]();
        }
        // Pop on success.
        const fresh = loadKV('syncQueue', []);
        fresh.shift();
        saveKV('syncQueue', fresh);
      } catch (err) {
        // Leave it on the queue for next try; stop the loop.
        // eslint-disable-next-line no-console
        console.warn('[bloom] sync push failed, will retry:', err?.message || err);
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

// Wire the queue to retry on connectivity / focus / boot.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flushQueue());
  window.addEventListener('focus', () => flushQueue());
}

export { KV_KEYS, QUEUE_KEY };
