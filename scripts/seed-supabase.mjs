// One-shot seed script: creates the auth user (idempotent) and inserts all
// data from bloom-export.json. Uses the service-role key, so it bypasses RLS.
//
// Usage:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_KEY=sb_secret_xxx \
//   SEED_EMAIL=you@example.com \
//   node scripts/seed-supabase.mjs
//
// Re-running is safe: existing rows are upserted, sessions are deduped by
// (workout_name, finished_at, exercises hash).

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const here = dirname(fileURLToPath(import.meta.url));
const exportPath = resolve(here, 'bloom-export.json');
const data = JSON.parse(readFileSync(exportPath, 'utf8'));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const EMAIL = process.env.SEED_EMAIL;

if (!SUPABASE_URL || !SERVICE_KEY || !EMAIL) {
  console.error('Missing env vars. Need SUPABASE_URL, SUPABASE_SERVICE_KEY, SEED_EMAIL');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findOrCreateUser(email) {
  // Try to find an existing user by paging through users.
  let page = 1;
  while (true) {
    const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = list.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (list.users.length < 200) break;
    page += 1;
  }
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (cErr) throw cErr;
  return created.user;
}

function jsonHash(obj) {
  // Tiny stable hash so we can dedupe sessions across re-runs.
  const s = JSON.stringify(obj);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return String(h);
}

async function main() {
  const user = await findOrCreateUser(EMAIL);
  const userId = user.id;
  console.log(`✓ user: ${user.email} (${userId})`);

  // ---------- workouts ----------
  const workouts = (data['bloom:myWorkouts'] || []).map((w) => ({
    id: w.id,
    user_id: userId,
    name: w.name,
    exercises: w.exercises || [],
    scene: w.scene || null,
    tag: w.tag || null,
    supersets: w.supersets || [],
    targets: w.targets || {},
    rests: w.rests || {},
  }));
  if (workouts.length) {
    const { error } = await admin.from('bloom_workouts').upsert(workouts, { onConflict: 'id' });
    if (error) throw error;
  }
  console.log(`✓ workouts: ${workouts.length}`);

  // ---------- custom exercises ----------
  const customs = (data['bloom:customExercises'] || []).map((c) => ({
    id: c.id,
    user_id: userId,
    name: c.name,
    muscle: c.muscle || null,
    rest_sec: c.restSec ?? 90,
    tips: c.tips || [],
    video_id: c.videoId || null,
  }));
  if (customs.length) {
    const { error } = await admin.from('bloom_custom_exercises').upsert(customs, { onConflict: 'id' });
    if (error) throw error;
  }
  console.log(`✓ custom exercises: ${customs.length}`);

  // ---------- chat history ----------
  const chats = (data['bloom:chatHistory'] || []).map((c) => ({
    id: c.id,
    user_id: userId,
    title: c.title || null,
    messages: c.messages || [],
    created_at: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
    updated_at: c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString(),
  }));
  if (chats.length) {
    const { error } = await admin.from('bloom_chat_history').upsert(chats, { onConflict: 'id' });
    if (error) throw error;
  }
  console.log(`✓ chats: ${chats.length}`);

  // ---------- sessions (dedupe-aware) ----------
  // Sessions in localStorage have no IDs, so we generate stable UUIDs from a
  // hash of (finishedAt, workoutName, exercises). Re-running won't duplicate.
  const { randomUUID } = await import('node:crypto');
  const incoming = (data['bloom:sessions'] || []).map((s) => {
    const fingerprint = `${s.finishedAt}|${s.workoutName}|${jsonHash(s.exercises)}`;
    // Deterministic UUID v5-ish: hash → fill into uuid template.
    const h = jsonHash(fingerprint).replace('-', '');
    const padded = (h + h + h + h + h).replace(/[^0-9a-f]/gi, '0').padEnd(32, '0').slice(0, 32);
    const id = `${padded.slice(0, 8)}-${padded.slice(8, 12)}-4${padded.slice(13, 16)}-8${padded.slice(17, 20)}-${padded.slice(20, 32)}`;
    return {
      id,
      user_id: userId,
      workout_name: s.workoutName,
      tag: s.tag || null,
      exercises: s.exercises || {},
      duration_sec: s.durationSec ?? 0,
      finished_at: new Date(s.finishedAt).toISOString(),
    };
  });
  // Best-effort dedupe inside the array too.
  const uniq = Array.from(new Map(incoming.map((r) => [r.id, r])).values());
  if (uniq.length) {
    const { error } = await admin.from('bloom_sessions').upsert(uniq, { onConflict: 'id' });
    if (error) throw error;
  }
  console.log(`✓ sessions: ${uniq.length}`);

  // ---------- KV bag ----------
  const kvEntries = [
    ['schedule', data['bloom:schedule'] ?? {}],
    ['lastSessions', data['bloom:lastSessions'] ?? {}],
    ['coachContext', data['bloom:coachContext'] ?? []],
    ['unit', data['bloom:unit'] ?? 'kg'],
    ['exerciseNotes', data['bloom:exerciseNotes'] ?? {}],
    ['focusLiftName', data['bloom:focusLiftName'] ?? null],
  ].filter(([, v]) => v !== null && v !== undefined);

  const kvRows = kvEntries.map(([key, value]) => ({ user_id: userId, key, value }));
  if (kvRows.length) {
    const { error } = await admin.from('bloom_kv').upsert(kvRows, { onConflict: 'user_id,key' });
    if (error) throw error;
  }
  console.log(`✓ kv settings: ${kvRows.length}`);

  console.log('\nAll done.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
