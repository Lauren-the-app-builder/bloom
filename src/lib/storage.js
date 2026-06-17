import { useState, useEffect } from 'react';
import { queue, KV_KEYS, tombstoneSession } from './sync';

const PREFIX = 'bloom:';

// Map localStorage key → which sync entity to push when it changes.
const ENTITY_FOR_KEY = {
  myWorkouts: 'myWorkouts',
  sessions: 'sessions',
  customExercises: 'customExercises',
  chatHistory: 'chatHistory',
  wrenChat: 'wrenChat',
  wrenProgram: 'wrenProgram',
  wrenMissedSessions: 'wrenMissedSessions',
};

function pushFor(key) {
  if (ENTITY_FOR_KEY[key]) {
    queue(ENTITY_FOR_KEY[key]);
  } else if (KV_KEYS.includes(key)) {
    queue('kv', key);
  }
}

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    pushFor(key);
  } catch {}
}

export function useLocalState(key, initial) {
  const [state, setState] = useState(() => load(key, initial));
  useEffect(() => { save(key, state); }, [key, state]);
  // Re-read from localStorage when sync pulls fresh data (e.g. after sign-in).
  useEffect(() => {
    const onSynced = () => {
      const fresh = load(key, initial);
      setState(fresh);
    };
    window.addEventListener('bloom:synced', onSynced);
    return () => window.removeEventListener('bloom:synced', onSynced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [state, setState];
}

// Append a completed workout session to history
export function recordSession(session) {
  const list = load('sessions', []);
  list.push({ ...session, id: crypto.randomUUID(), finishedAt: Date.now() });
  save('sessions', list);
  return list;
}

export function getSessions() {
  return load('sessions', []);
}

// Most recent recorded session for a given workout name (or null).
// Skips focus-lift past entries which aren't full workouts.
export function getLastSession(workoutName) {
  const list = load('sessions', []);
  let best = null;
  for (const s of list) {
    if (s.workoutName !== workoutName) continue;
    if ((s.workoutName || '').includes('(past entry)')) continue;
    if (!best || (s.finishedAt || 0) > (best.finishedAt || 0)) best = s;
  }
  return best;
}

export function updateSession(finishedAt, patch) {
  const list = load('sessions', []);
  const next = list.map(s => s.finishedAt === finishedAt ? { ...s, ...patch } : s);
  save('sessions', next);
  return next;
}

export function deleteSession(finishedAt) {
  const list = load('sessions', []);
  // Capture the rows we're about to drop so we can also delete them on the
  // server — otherwise the next pullAll() restores them and the UI shows the
  // session as done again. tombstoneSession() persists the id and queues a
  // durable delete that retries until Supabase confirms; pullAll() filters
  // tombstoned ids out of incoming rows so an early pull can't resurrect
  // them before the remote delete lands.
  const removed = list.filter(s => s.finishedAt === finishedAt);
  const next = list.filter(s => s.finishedAt !== finishedAt);
  save('sessions', next);
  for (const s of removed) {
    if (s.id) tombstoneSession(s.id);
  }
  return next;
}

// ---------- Wren chat ----------
export function getWrenMessages() {
  return load('wrenChat', []).sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
}

export function addWrenMessage(msg) {
  const list = load('wrenChat', []);
  list.push({ ...msg, id: msg.id || crypto.randomUUID(), created_at: msg.created_at || Date.now() });
  save('wrenChat', list);
  return list;
}

// Archive the current chat into wrenChatArchive (so nothing is ever lost) and
// clear wrenChat so the next exchange starts fresh — Wren has no memory of
// the prior thread. Triggered when Lauren has been away long enough.
export function resetWrenChat() {
  const current = load('wrenChat', []);
  if (!current.length) return;
  const archive = load('wrenChatArchive', []);
  archive.push({
    id: crypto.randomUUID(),
    archived_at: Date.now(),
    messages: current,
  });
  save('wrenChatArchive', archive);
  save('wrenChat', []);
}

// ---------- Wren program ----------
// Canonical sets per exercise (overrides Wren's data if it generated wrong counts).
// Default = 3 sets; the patterns below are the only exercises that should be 2 sets.
const TWO_SET_PATTERNS = [
  (n) => /cable/i.test(n) && /lateral/i.test(n) && /raise/i.test(n),       // cable lateral raise
  (n) => /tricep/i.test(n) && /push.?down/i.test(n),                       // tricep pushdown
  (n) => /bent.?over/i.test(n) && /row/i.test(n),                          // bent-over row
  (n) => /reverse/i.test(n) && /fl(y|ies)/i.test(n),                       // reverse fly
  (n) => /upright/i.test(n) && /row/i.test(n),                             // upright row
];

export function canonicalSetsFor(name) {
  return TWO_SET_PATTERNS.some(p => p(name || '')) ? 2 : 3;
}

// Deload weeks cut volume ~40% (keep ~60% of the sets, minimum 1).
export function deloadSets(baseSets) {
  return Math.max(1, Math.round((Number(baseSets) || 0) * 0.6));
}

// Set count for an exercise in a given week, accounting for deload.
export function setsForExercise(name, isDeload) {
  // Wren-set per-exercise overrides take precedence over canonicalSetsFor;
  // deload reduction still applies on top.
  const override = getSetsOverride(name);
  const base = override ?? canonicalSetsFor(name);
  return isDeload ? deloadSets(base) : base;
}

// ---------- Wren-controlled sets overrides ----------
// { [exerciseName]: positiveInt } map. Lets Wren change set counts per
// exercise without hard-coding new patterns in canonicalSetsFor. Stored as
// a single KV (wrenSetsOverrides) so it rides the existing KV sync.
const SETS_OVERRIDES_KEY = 'wrenSetsOverrides';

export function getSetsOverrides() {
  const v = load(SETS_OVERRIDES_KEY, {});
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

export function getSetsOverride(name) {
  const v = getSetsOverrides()[name];
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function setSetsOverride(name, sets) {
  const n = Number(sets);
  if (!name || !Number.isFinite(n) || n <= 0) return;
  const next = { ...getSetsOverrides(), [name]: n };
  save(SETS_OVERRIDES_KEY, next);
}

export function clearSetsOverride(name) {
  const overrides = getSetsOverrides();
  if (!(name in overrides)) return;
  const next = { ...overrides };
  delete next[name];
  save(SETS_OVERRIDES_KEY, next);
}

// ---------- Deload weeks ----------
// Deload is no longer auto-assigned every 4th week — it now only takes
// effect for weeks Lauren has explicitly confirmed with Wren. These
// helpers manage the persisted list.
export function getDeloadWeeks() {
  const v = load('deloadWeeks', []);
  return Array.isArray(v) ? v.map(n => Number(n)).filter(Number.isFinite) : [];
}

export function isDeloadWeek(weekNum) {
  if (!Number.isFinite(weekNum) || weekNum <= 0) return false;
  return getDeloadWeeks().includes(Number(weekNum));
}

export function addDeloadWeek(weekNum) {
  const n = Number(weekNum);
  if (!Number.isFinite(n) || n <= 0) return getDeloadWeeks();
  const set = new Set(getDeloadWeeks());
  set.add(n);
  const next = [...set].sort((a, b) => a - b);
  save('deloadWeeks', next);
  return next;
}

export function removeDeloadWeek(weekNum) {
  const n = Number(weekNum);
  const next = getDeloadWeeks().filter(x => x !== n);
  save('deloadWeeks', next);
  return next;
}

// ---------- Wren long-term memory ----------
// Append-only list of facts Wren has learned about Lauren and explicitly
// chosen to remember (preferences, recurring issues, off-limit lifts she
// dislikes, life context). Stored locally; surfaced in API context every
// turn so Wren has continuity across chat resets.
//
// Each note: { id, text, createdAt, source: 'wren' | 'lauren' }
export function getWrenNotes() {
  const v = load('wrenNotes', []);
  return Array.isArray(v) ? v : [];
}

export function addWrenNote({ text, source = 'wren' }) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return getWrenNotes();
  const list = getWrenNotes();
  // De-dupe by exact text (case-insensitive) to keep the store clean.
  const key = trimmed.toLowerCase();
  if (list.some(n => String(n.text || '').toLowerCase() === key)) return list;
  const next = [...list, {
    id: `wn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    text: trimmed,
    createdAt: Date.now(),
    source: source === 'lauren' ? 'lauren' : 'wren',
  }];
  save('wrenNotes', next);
  return next;
}

export function removeWrenNote(id) {
  const next = getWrenNotes().filter(n => n.id !== id);
  save('wrenNotes', next);
  return next;
}

export function clearWrenNotes() {
  save('wrenNotes', []);
}

// ---------- Nourish (calorie goal + weight log) ----------
// Single-user, units-agnostic on the stored number: the NourishView screen
// always renders/labels lbs (per design), so any number written here is in
// lbs. If we ever want to follow the Bloom kg/lb toggle, conversion happens
// at the UI layer — the store stays in one canonical unit.

// Calorie goal: a single positive integer (kcal/day). 0/missing means "not
// set" and the UI shows a placeholder. Stored as a KV so it syncs.
export function getCalorieGoal() {
  const v = Number(load('nourishCalorieGoal', 0));
  return Number.isFinite(v) && v > 0 ? v : 0;
}
export function setCalorieGoal(kcal) {
  const n = Math.round(Number(kcal) || 0);
  if (!Number.isFinite(n) || n <= 0) return;
  save('nourishCalorieGoal', n);
}

// Nutrition phase: 'cut' | 'maintain' (or null if she hasn't picked yet).
// Lives next to the calorie goal because the two are read together — Wren
// interprets the same weight trend differently depending on whether Lauren
// is trying to lose weight or hold it. Anything other than the two valid
// values is normalized to null.
const PHASES = new Set(['cut', 'maintain']);
export function getNourishPhase() {
  const v = load('nourishPhase', null);
  return PHASES.has(v) ? v : null;
}
export function setNourishPhase(phase) {
  if (phase === null) { save('nourishPhase', null); return; }
  if (!PHASES.has(phase)) return;
  save('nourishPhase', phase);
}

// Weight log: append-only-ish array of { ts, weight } sorted by ts ascending.
// Same-day entries: the UI prompts before overwriting, but the store happily
// accepts either path — replaceForDate(ts) collapses same-calendar-day rows,
// addWeight(ts) just pushes without dedupe.
function localDateKey(ts) {
  const d = new Date(Number(ts) || Date.now());
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
export function getWeightLog() {
  const v = load('nourishWeightLog', []);
  if (!Array.isArray(v)) return [];
  return v
    .map((r) => ({ ts: Number(r?.ts) || 0, weight: Number(r?.weight) || 0 }))
    .filter((r) => r.ts > 0 && r.weight > 0)
    .sort((a, b) => a.ts - b.ts);
}
// Append a new reading. Does NOT dedupe — call replaceWeightForDate first
// if you want the same-day overwrite behavior the UI uses.
export function addWeight(weight, ts = Date.now()) {
  const w = Number(weight);
  if (!Number.isFinite(w) || w <= 0) return getWeightLog();
  const list = getWeightLog();
  list.push({ ts: Number(ts) || Date.now(), weight: w });
  list.sort((a, b) => a.ts - b.ts);
  save('nourishWeightLog', list);
  return list;
}
// Replace any existing entries for the same local calendar day as `ts` with
// a single new reading. Returns the new log.
export function replaceWeightForDate(weight, ts = Date.now()) {
  const w = Number(weight);
  if (!Number.isFinite(w) || w <= 0) return getWeightLog();
  const targetKey = localDateKey(ts);
  const filtered = getWeightLog().filter((r) => localDateKey(r.ts) !== targetKey);
  filtered.push({ ts: Number(ts) || Date.now(), weight: w });
  filtered.sort((a, b) => a.ts - b.ts);
  save('nourishWeightLog', filtered);
  return filtered;
}
// Did we already log today? UI uses this to decide whether to confirm.
export function hasWeightToday() {
  const today = localDateKey(Date.now());
  return getWeightLog().some((r) => localDateKey(r.ts) === today);
}
// Most recent weight reading (null if none).
export function getCurrentWeight() {
  const log = getWeightLog();
  return log.length ? log[log.length - 1] : null;
}
// Mean of every reading inside the current Monday-anchored calendar week.
// Returns null if no readings this week. More representative than a single
// weigh-in because daily noise (hydration, sleep) cancels out.
export function getWeeklyAvgWeight() {
  const now = new Date();
  const day = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon=0..Sun=6
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - day);
  const ws = weekStart.getTime();
  const inWeek = getWeightLog().filter((r) => r.ts >= ws);
  if (!inWeek.length) return null;
  const sum = inWeek.reduce((n, r) => n + r.weight, 0);
  return +(sum / inWeek.length).toFixed(1);
}
// Signed weight change over a window. `period` is 'daily' | 'weekly' |
// 'monthly'. Compares the most recent reading against the most recent
// reading at-or-before (now - window). Returns null if either side is
// missing. Negative = lost weight.
export function getWeightChange(period) {
  const log = getWeightLog();
  if (log.length < 2) return null;
  const days = period === 'monthly' ? 30 : period === 'weekly' ? 7 : 1;
  const cutoff = Date.now() - days * 86400000;
  const current = log[log.length - 1];
  const earlier = [...log].reverse().find((r) => r.ts <= cutoff);
  if (!earlier || earlier.ts === current.ts) return null;
  return +(current.weight - earlier.weight).toFixed(1);
}

function fixSession(sess) {
  if (!sess || !Array.isArray(sess.exercises)) return sess;
  return {
    ...sess,
    exercises: sess.exercises.map(ex => ({
      ...ex,
      sets: canonicalSetsFor(ex?.name || ex?.exercise),
    })),
  };
}

// Normalize a program: override exercise sets to canonical. Deload weeks
// are no longer pre-marked by week-number math — that flag now comes from
// the user's confirmed deload list (see getDeloadWeeks / isDeloadWeek).
function normalizeProgram(rawProgram) {
  if (!rawProgram) return rawProgram;
  const program = rawProgram.program_json || rawProgram;
  if (!program?.weeks?.length) return rawProgram;

  const fixedWeeks = program.weeks.map((wk, idx) => {
    if (!wk) return wk;
    const weekNum = Number(wk.week_number) || (idx + 1);
    const newWk = {
      ...wk,
      week_number: weekNum,
      // is_deload intentionally NOT auto-set; the UI consults
      // isDeloadWeek() from the user's confirmed list instead.
    };
    if (Array.isArray(wk.sessions)) {
      newWk.sessions = wk.sessions.map(fixSession);
    } else if (wk.sessions && typeof wk.sessions === 'object') {
      newWk.sessions = Object.entries(wk.sessions).map(([key, sess]) => {
        const fixed = fixSession(sess);
        return { ...fixed, session_label: fixed?.session_label || key };
      });
    }
    return newWk;
  });

  const fixedProgram = { ...program, weeks: fixedWeeks };
  return rawProgram.program_json
    ? { ...rawProgram, program_json: fixedProgram }
    : fixedProgram;
}

export function getActiveProgram() {
  const programs = load('wrenProgram', []);
  const active = programs.find(p => p.active) || null;
  return normalizeProgram(active);
}

export function saveProgram(program) {
  const list = load('wrenProgram', []).map(p => ({ ...p, active: false }));
  list.push({ ...program, id: program.id || crypto.randomUUID(), active: true, created_at: program.created_at || Date.now() });
  save('wrenProgram', list);
  return list;
}

// Walk every session in the active program(s), calling mutator(sess) when the
// session's label matches `label`. mutator should mutate sess.exercises in
// place and return true if it changed anything. Saves once if anything moved.
//
// Label matching is intentionally permissive — Wren-generated programs have
// shown up with a few different shapes:
//   • Array sessions with session_label: "B"
//   • Array sessions with label: "Session B" or name: "Session B"
//   • Object-shaped sessions keyed by "B"
//   • No label at all (fall back to array position: 0→A, 1→B, 2→C)
// All of those should be treated as Session B for "B" label matching.
function mutateProgramSessions(label, mutator) {
  try {
    const target = String(label).toUpperCase().trim();
    const list = load('wrenProgram', []);
    let changed = false;

    const labelMatches = (raw, idx) => {
      const cleaned = String(raw || '').toUpperCase().replace(/^SESSION\s+/, '').trim();
      if (cleaned) return cleaned === target;
      // No declared label — fall back to position (A=0, B=1, C=2, ...).
      return String.fromCharCode(65 + idx) === target;
    };

    for (const entry of list) {
      const program = entry?.program_json || entry;
      if (!program?.weeks?.length) continue;
      for (const wk of program.weeks) {
        const raw = wk?.sessions;
        if (!raw) continue;
        const items = Array.isArray(raw)
          ? raw.map((s, i) => ({ sess: s, raw: s?.session_label || s?.label || s?.name, idx: i }))
          : Object.entries(raw).map(([k, s], i) => ({ sess: s, raw: s?.session_label || s?.label || s?.name || k, idx: i }));
        for (const { sess, raw: rawLabel, idx } of items) {
          if (!labelMatches(rawLabel, idx)) continue;
          if (!Array.isArray(sess?.exercises)) continue;
          if (mutator(sess)) changed = true;
        }
      }
    }
    if (changed) save('wrenProgram', list);
    return changed;
  } catch { return false; }
}

// Idempotent migration: Session A should run lat pulldown before cable face
// pull. Older generated programs had the reverse order. Safe to call every
// load — only swaps when the current order is wrong.
export function ensureSessionAOrder() {
  const lower = (s) => String(s || '').toLowerCase();
  return mutateProgramSessions('A', (sess) => {
    const fpIdx = sess.exercises.findIndex(e => lower(e?.name).includes('cable face pull'));
    const lpIdx = sess.exercises.findIndex(e => lower(e?.name).includes('lat pulldown'));
    if (fpIdx === -1 || lpIdx === -1 || fpIdx >= lpIdx) return false;
    const a = sess.exercises[fpIdx];
    sess.exercises[fpIdx] = sess.exercises[lpIdx];
    sess.exercises[lpIdx] = a;
    return true;
  });
}

// Idempotent migration: Session B replaces any bent-over row variant (which
// Lauren swapped out mid-workout) with "Straight arm pulldown" (3x12-15).
// Matches "bent" + "row" in any spelling/order — Bent-over barbell row, Bent
// over barbell row, Barbell bent-over row, Bent over row, etc. Skips
// already-migrated rows so it's safe to re-run.
export function ensureSessionBPulldown() {
  const lower = (s) => String(s || '').toLowerCase();
  return mutateProgramSessions('B', (sess) => {
    const idx = sess.exercises.findIndex(e => {
      const n = lower(e?.name);
      if (n.includes('straight arm pulldown') || n.includes('straight-arm pulldown')) return false;
      return /bent/.test(n) && /row/.test(n);
    });
    if (idx === -1) return false;
    const old = sess.exercises[idx] || {};
    sess.exercises[idx] = {
      ...old,
      name: 'Straight arm pulldown',
      reps: '12-15',
      superset_with: undefined,
    };
    return true;
  });
}

// Idempotent migration: Session C ends with "Seated leg curl" (3x10-12). Both
// the original "Barbell upright row" and the earlier intermediate swap
// ("Lying leg curl") get rewritten — and an already-seated entry is a noop.
export function ensureSessionCLegCurl() {
  const lower = (s) => String(s || '').toLowerCase();
  return mutateProgramSessions('C', (sess) => {
    const idx = sess.exercises.findIndex(e => {
      const n = lower(e?.name);
      return n.includes('barbell upright row') || n.includes('lying leg curl');
    });
    if (idx === -1) return false;
    const old = sess.exercises[idx] || {};
    sess.exercises[idx] = {
      ...old,
      name: 'Seated leg curl',
      reps: '10-12',
      // Drop any leftover superset link, since the swapped-in exercise is a
      // standalone hamstring isolation.
      superset_with: undefined,
    };
    return true;
  });
}

// Monday-anchored key for the current calendar week, e.g. "2026-05-25".
export function currentWeekKey(d = new Date()) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const off = x.getDay() === 0 ? 6 : x.getDay() - 1; // days since Monday
  x.setDate(x.getDate() - off);
  return x.toISOString().slice(0, 10);
}

// Monday-anchored key for next week. Used when Lauren plans next week
// after finishing all of this week's sessions.
export function nextWeekKey() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return currentWeekKey(d);
}

// Has Lauren set/confirmed her training days for the current week yet?
export function isScheduleConfirmedThisWeek() {
  return load('scheduleWeekConfirmed', null) === currentWeekKey();
}

// Has Lauren already planned NEXT week? Stays true through this week and
// rolls over: once next Monday arrives, currentWeekKey advances to that
// value and isScheduleConfirmedThisWeek() also returns true.
export function isNextWeekScheduleConfirmed() {
  return load('scheduleWeekConfirmed', null) === nextWeekKey();
}

export function markScheduleConfirmed() {
  save('scheduleWeekConfirmed', currentWeekKey());
}

export function markNextWeekScheduleConfirmed() {
  save('scheduleWeekConfirmed', nextWeekKey());
}

// Update which weekday each session falls on, across every week of the active
// program, in place (no new program record). `dayByLabel` maps a session label
// to a full weekday name, e.g. { A: 'Monday', B: 'Wednesday', C: 'Friday' }.
// Options:
//   confirmFor — 'current' (default) marks this week confirmed; 'next' marks
//                next week (used when planning ahead after finishing the
//                current week); 'none' skips the confirmation update.
export function setProgramSchedule(dayByLabel, { confirmFor = 'current' } = {}) {
  if (!dayByLabel || !Object.keys(dayByLabel).length) return null;
  const list = load('wrenProgram', []);
  const idx = list.findIndex(p => p.active);
  if (idx === -1) return null;
  const entry = list[idx];
  const program = entry.program_json || entry;
  if (!program?.weeks?.length) return null;

  const dayFor = (label, current) => dayByLabel[label] || current;
  const newWeeks = program.weeks.map(wk => {
    if (!wk || !wk.sessions) return wk;
    if (Array.isArray(wk.sessions)) {
      return { ...wk, sessions: wk.sessions.map(s => ({ ...s, scheduled_day: dayFor(s.session_label, s.scheduled_day) })) };
    }
    if (typeof wk.sessions === 'object') {
      const sessions = {};
      for (const [key, s] of Object.entries(wk.sessions)) {
        sessions[key] = { ...s, scheduled_day: dayFor(s.session_label || key, s.scheduled_day) };
      }
      return { ...wk, sessions };
    }
    return wk;
  });

  const newProgram = { ...program, weeks: newWeeks };
  list[idx] = entry.program_json ? { ...entry, program_json: newProgram } : newProgram;
  save('wrenProgram', list);
  if (confirmFor === 'next') markNextWeekScheduleConfirmed();
  else if (confirmFor === 'current') markScheduleConfirmed();
  return list[idx];
}

// Apply a single in-place edit to one session (by label) across every week of
// the active program — so Wren can tweak workouts without rebuilding all 12
// weeks. `op` supports exactly one operation:
//   { session_label, swap_from, swap_to }              — replace an exercise
//   { session_label, add_exercise, reps, sets }         — add an exercise
//   { session_label, remove_exercise }                   — remove an exercise
//   { session_label, exercise, reps }                    — change an exercise's reps
//   { session_label, exercise, sets }                    — change an exercise's sets
//   { session_label, superset_a, superset_b }            — link two exercises as a superset
//   { session_label, unlink_superset }                   — break any superset link involving this exercise
//   { session_label, order: [...exerciseNames] }         — reorder exercises in the session
// (sets may be combined with reps on the same op.)
export function editProgramSession(op) {
  if (!op || !op.session_label) return null;

  // Side-effects on the sets-overrides bag. Done up front so a swap/remove
  // can't leave a stale override pointing at an exercise that no longer
  // exists in any session, and so a new `sets` value lands even when no
  // structural program change is needed (sets-only edit).
  const setsNum = Number(op.sets);
  const hasSets = Number.isFinite(setsNum) && setsNum > 0;
  if (op.swap_from) clearSetsOverride(op.swap_from);
  if (op.remove_exercise) clearSetsOverride(op.remove_exercise);
  if (hasSets && op.exercise) setSetsOverride(op.exercise, setsNum);
  if (hasSets && op.add_exercise) setSetsOverride(op.add_exercise, setsNum);
  const list = load('wrenProgram', []);
  const idx = list.findIndex(p => p.active);
  if (idx === -1) return null;
  const entry = list[idx];
  const program = entry.program_json || entry;
  if (!program?.weeks?.length) return null;

  const matches = (s) => String(s?.session_label || '').toUpperCase() === String(op.session_label).toUpperCase();

  const editExercises = (exs) => {
    if (!Array.isArray(exs)) return exs;
    let next = exs.map(e => ({ ...e }));
    if (op.swap_from && op.swap_to) {
      next = next.map(e => {
        const out = { ...e };
        if (e.name === op.swap_from) out.name = op.swap_to;
        if (e.superset_with === op.swap_from) out.superset_with = op.swap_to;
        return out;
      });
    }
    if (op.remove_exercise) {
      next = next.filter(e => e.name !== op.remove_exercise);
      next = next.map(e => e.superset_with === op.remove_exercise ? { ...e, superset_with: undefined } : e);
    }
    if (op.exercise && op.reps) {
      next = next.map(e => e.name === op.exercise ? { ...e, reps: String(op.reps) } : e);
    }
    if (op.add_exercise && !next.some(e => e.name === op.add_exercise)) {
      next.push({ name: op.add_exercise, reps: String(op.reps || '10') });
    }
    // Link two exercises as a superset. TodayView reads superset_with
    // bidirectionally — setting it on one of the pair is enough. We point
    // the later-listed exercise at the earlier one so the order in the UI
    // mirrors the program order. Both names must already exist in this
    // session; missing names mean the op is a no-op (logged silently).
    if (op.superset_a && op.superset_b && op.superset_a !== op.superset_b) {
      const aIdx = next.findIndex(e => e.name === op.superset_a);
      const bIdx = next.findIndex(e => e.name === op.superset_b);
      if (aIdx !== -1 && bIdx !== -1) {
        // Clear any pre-existing link on the partner so we don't leave
        // dangling pointers to a third exercise.
        const [firstIdx, secondIdx] = aIdx <= bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
        next = next.map((e, i) => {
          if (i === firstIdx) return { ...e, superset_with: undefined };
          if (i === secondIdx) return { ...e, superset_with: next[firstIdx].name };
          return e;
        });
      }
    }
    // Unlink: clear superset_with on the target itself AND on any other
    // exercise pointing at it. Idempotent — nothing happens if no link exists.
    if (op.unlink_superset) {
      next = next.map(e => {
        if (e.name === op.unlink_superset || e.superset_with === op.unlink_superset) {
          return { ...e, superset_with: undefined };
        }
        return e;
      });
    }
    // Reorder by exercise name. Only applies when the order array is a
    // perfect permutation of the current session's exercises — otherwise
    // we'd silently drop or duplicate exercises. Anything missing from
    // the order is appended at the end in its original relative order so
    // a typo can't strip lifts from the program.
    if (Array.isArray(op.order) && op.order.length) {
      const byName = new Map(next.map(e => [e.name, e]));
      const seen = new Set();
      const ordered = [];
      for (const n of op.order) {
        if (byName.has(n) && !seen.has(n)) {
          ordered.push(byName.get(n));
          seen.add(n);
        }
      }
      for (const e of next) {
        if (!seen.has(e.name)) ordered.push(e);
      }
      next = ordered;
    }
    return next;
  };

  const editSession = (s) => matches(s) ? { ...s, exercises: editExercises(s.exercises) } : s;

  const newWeeks = program.weeks.map(wk => {
    if (!wk || !wk.sessions) return wk;
    if (Array.isArray(wk.sessions)) return { ...wk, sessions: wk.sessions.map(editSession) };
    if (typeof wk.sessions === 'object') {
      const sessions = {};
      for (const [key, s] of Object.entries(wk.sessions)) {
        sessions[key] = editSession({ session_label: s.session_label || key, ...s });
      }
      return { ...wk, sessions };
    }
    return wk;
  });

  const newProgram = { ...program, weeks: newWeeks };
  list[idx] = entry.program_json ? { ...entry, program_json: newProgram } : newProgram;
  save('wrenProgram', list);
  return list[idx];
}

// ---------- Wren missed sessions ----------
export function getMissedSessions() {
  return load('wrenMissedSessions', []);
}

export function addMissedSession(record) {
  const list = load('wrenMissedSessions', []);
  list.push({ ...record, id: record.id || crypto.randomUUID(), created_at: record.created_at || Date.now() });
  save('wrenMissedSessions', list);
  return list;
}
