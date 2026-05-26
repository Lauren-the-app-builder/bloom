// Offline-first sync layer between localStorage (cache) and Supabase (truth).
//
// Strategy:
//   - Reads always come from localStorage (instant, offline-safe).
//   - On sign-in / boot, pullAll() fetches all bloom_* rows for the user
//     and replaces the localStorage cache.
//   - On every write the app already updates localStorage, then calls
//     queue('workouts' | 'sessions' | ...) to push the change to Supabase.
//   - If a push fails (offline, network error) it sits in a retry queue
//     and gets re-tried on next online event / next boot.

import { supabase, isSupabaseConfigured } from './supabase';

const PREFIX = 'bloom:';
const QUEUE_KEY = PREFIX + 'syncQueue';

function loadKV(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}

function saveKV(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch {}
}

async function getUserId() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

// ---------- PULL ----------
export async function pullAll() {
  if (!isSupabaseConfigured) return;
  const userId = await getUserId();
  if (!userId) return;

  const [workouts, sessions, customs, chats, kv, wrenChatRows, wrenPrograms, wrenMissed] = await Promise.all([
    supabase.from('bloom_workouts').select('*').eq('user_id', userId),
    supabase.from('bloom_sessions').select('*').eq('user_id', userId).order('finished_at', { ascending: false }),
    supabase.from('bloom_custom_exercises').select('*').eq('user_id', userId),
    supabase.from('bloom_chat_history').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
    supabase.from('bloom_kv').select('*').eq('user_id', userId),
    supabase.from('wren_chat').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('wren_program').select('*').eq('user_id', userId),
    supabase.from('wren_missed_sessions').select('*').eq('user_id', userId).order('session_date', { ascending: false }),
  ]);

  if (workouts.data) {
    saveKV('myWorkouts', workouts.data.map((w) => ({
      id: w.id, name: w.name, exercises: w.exercises || [], scene: w.scene,
      tag: w.tag, supersets: w.supersets || [], targets: w.targets || {}, rests: w.rests || {},
    })));
  }

  if (sessions.data) {
    saveKV('sessions', sessions.data.map((s) => ({
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
// or conflict resolution required.

const pushers = {
  async myWorkouts(userId) {
    const list = loadKV('myWorkouts', []);
    if (!list.length) return;
    const rows = list.map((w) => ({
      id: w.id,
      user_id: userId,
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
    // deleteWorkout() (see below) so we can't accidentally wipe rows we
    // haven't pulled yet.
    const { error } = await supabase.from('bloom_workouts').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  },

  async sessions(userId) {
    const list = loadKV('sessions', []);
    if (!list.length) return;
    const rows = list.map((s) => ({
      id: s.id || crypto.randomUUID(),
      user_id: userId,
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

  async customExercises(userId) {
    const list = loadKV('customExercises', []);
    if (!list.length) return;
    const rows = list.map((c) => ({
      id: c.id, user_id: userId, name: c.name, muscle: c.muscle || null,
      rest_sec: c.restSec ?? 90, tips: c.tips || [], video_id: c.videoId || null,
    }));
    const { error } = await supabase.from('bloom_custom_exercises').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  },

  async chatHistory(userId) {
    const list = loadKV('chatHistory', []);
    if (!list.length) return;
    const rows = list.map((c) => ({
      id: c.id, user_id: userId, title: c.title || null, messages: c.messages || [],
      created_at: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
      updated_at: c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString(),
    }));
    const { error } = await supabase.from('bloom_chat_history').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  },

  // ---------- Wren entities ----------
  async wrenChat(userId) {
    const list = loadKV('wrenChat', []);
    if (!list.length) return;
    const rows = list.map((m) => ({
      id: m.id, user_id: userId, role: m.role, content: m.content,
      context_snapshot: m.context_snapshot || null,
      created_at: m.created_at ? new Date(m.created_at).toISOString() : new Date().toISOString(),
    }));
    const { error } = await supabase.from('wren_chat').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  },

  async wrenProgram(userId) {
    const list = loadKV('wrenProgram', []);
    if (!list.length) return;
    const rows = list.map((p) => ({
      id: p.id, user_id: userId, program_json: p.program_json || {},
      active: !!p.active,
      created_at: p.created_at ? new Date(p.created_at).toISOString() : new Date().toISOString(),
    }));
    const { error } = await supabase.from('wren_program').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  },

  async wrenMissedSessions(userId) {
    const list = loadKV('wrenMissedSessions', []);
    if (!list.length) return;
    const rows = list.map((m) => ({
      id: m.id, user_id: userId, session_date: m.session_date, session_type: m.session_type || null,
      reason_category: m.reason_category || null, reason_text: m.reason_text || null,
      punishment_assigned: !!m.punishment_assigned, punishment_description: m.punishment_description || null,
      created_at: m.created_at ? new Date(m.created_at).toISOString() : new Date().toISOString(),
    }));
    const { error } = await supabase.from('wren_missed_sessions').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  },

  // KV-style settings, one per Supabase row.
  async kv(userId, key) {
    const value = loadKV(key, null);
    if (value === null || value === undefined) return;
    const { error } = await supabase.from('bloom_kv').upsert(
      [{ user_id: userId, key, value, updated_at: new Date().toISOString() }],
      { onConflict: 'user_id,key' }
    );
    if (error) throw error;
  },
};

const KV_KEYS = ['schedule', 'lastSessions', 'coachContext', 'unit', 'exerciseNotes', 'focusLiftName'];

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
  const userId = await getUserId();
  if (!userId) return;
  await supabase.from('bloom_workouts').delete().eq('user_id', userId).eq('id', id);
}
export async function deleteSessionRemote(id) {
  if (!isSupabaseConfigured || !id) return;
  const userId = await getUserId();
  if (!userId) return;
  await supabase.from('bloom_sessions').delete().eq('user_id', userId).eq('id', id);
}
export async function deleteCustomExerciseRemote(id) {
  if (!isSupabaseConfigured) return;
  const userId = await getUserId();
  if (!userId) return;
  await supabase.from('bloom_custom_exercises').delete().eq('user_id', userId).eq('id', id);
}
export async function deleteChatRemote(id) {
  if (!isSupabaseConfigured) return;
  const userId = await getUserId();
  if (!userId) return;
  await supabase.from('bloom_chat_history').delete().eq('user_id', userId).eq('id', id);
}

let flushing = false;
export async function flushQueue() {
  if (flushing || !isSupabaseConfigured || !navigator.onLine) return;
  const userId = await getUserId();
  if (!userId) return;
  flushing = true;
  try {
    while (true) {
      const q = loadKV('syncQueue', []);
      if (!q.length) break;
      const job = q[0];
      try {
        if (job.entity === 'kv') {
          await pushers.kv(userId, job.kvKey);
        } else if (pushers[job.entity]) {
          await pushers[job.entity](userId);
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

export { KV_KEYS };
