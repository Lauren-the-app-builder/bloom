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

// A deload session still counts as "done" (streaks, totals, history) but is
// intentionally light, so it must NOT be pulled as the performance baseline
// the next time the same workout comes around — we want last week's real
// numbers instead. Used to exclude deloads from every "previous performance"
// / progressive-overload lookup, while leaving completion counts untouched.
export function isDeloadSession(s) {
  return !!(s && s.deload);
}

// Sessions usable as a performance baseline: real workouts only, deloads and
// focus-lift "(past entry)" stubs filtered out, newest first. This is the
// canonical source for "what did I do last time" seeding/recall.
export function getBaselineSessions() {
  return load('sessions', [])
    .filter(s => !(s.workoutName || '').includes('(past entry)'))
    .filter(s => !isDeloadSession(s))
    .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
}

// Most recent recorded session for a given workout name (or null).
// Skips focus-lift past entries which aren't full workouts, and deload
// sessions (see isDeloadSession) so progressive overload reads last week's
// real performance instead of an intentionally-light deload.
export function getLastSession(workoutName) {
  const list = load('sessions', []);
  let best = null;
  for (const s of list) {
    if (s.workoutName !== workoutName) continue;
    if ((s.workoutName || '').includes('(past entry)')) continue;
    if (isDeloadSession(s)) continue;
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

// ---------- Active workout draft (autosave) ----------
// Local-only — deliberately NOT wired into the Supabase sync queue (short-
// lived, device-specific, and syncing it risks a stale draft on one device
// clobbering real progress on another). Exists to protect an in-progress
// workout against exactly what used to wipe one silently: a forced reload
// (service-worker update) or the OS killing a backgrounded tab. ActiveWorkout
// saves on every meaningful change and clears on Finish or Cancel (its
// unmount cleanup) — never on an unannounced reload/kill, since those don't
// run React cleanup at all, which is exactly when the draft needs to survive.
const WORKOUT_DRAFT_KEY = PREFIX + 'workoutDraft';

export function getWorkoutDraft() {
  try {
    const raw = localStorage.getItem(WORKOUT_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function saveWorkoutDraft(draft) {
  try { localStorage.setItem(WORKOUT_DRAFT_KEY, JSON.stringify(draft)); } catch { /* localStorage unavailable in some contexts */ }
}

export function clearWorkoutDraft() {
  try { localStorage.removeItem(WORKOUT_DRAFT_KEY); } catch { /* localStorage unavailable in some contexts */ }
}

// ---------- Wren chat ----------
// The general Chat tab's thread — explicitly excludes program-scoped
// messages (see getProgramWrenMessages) so the two never leak into each
// other. Every message from before multi-program support has no
// `programId`, so this is a no-op filter for existing data.
export function getWrenMessages() {
  return load('wrenChat', [])
    .filter(m => !m.programId)
    .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
}

export function addWrenMessage(msg) {
  const list = load('wrenChat', []);
  list.push({ ...msg, id: msg.id || crypto.randomUUID(), created_at: msg.created_at || Date.now() });
  save('wrenChat', list);
  return list;
}

// Archive the current GLOBAL chat into wrenChatArchive (so nothing is ever
// lost) and clear it so the next exchange starts fresh — Wren has no memory
// of the prior thread. Triggered when Lauren has been away long enough.
// Program-scoped threads (ProgramChat) are untouched — each one manages its
// own continuity independently, this only ever resets the Chat tab.
export function resetWrenChat() {
  const current = load('wrenChat', []).filter(m => !m.programId);
  if (!current.length) return;
  const archive = load('wrenChatArchive', []);
  archive.push({
    id: crypto.randomUUID(),
    archived_at: Date.now(),
    messages: current,
  });
  save('wrenChatArchive', archive);
  save('wrenChat', load('wrenChat', []).filter(m => m.programId));
}

// ---------- Program-scoped Wren chat (ProgramChat) ----------
export function getProgramWrenMessages(programId) {
  if (!programId) return [];
  return load('wrenChat', [])
    .filter(m => m.programId === programId)
    .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
}

export function addProgramWrenMessage(programId, msg) {
  if (!programId) return [];
  const list = load('wrenChat', []);
  list.push({ ...msg, programId, id: msg.id || crypto.randomUUID(), created_at: msg.created_at || Date.now() });
  save('wrenChat', list);
  return getProgramWrenMessages(programId);
}

// ---------- Per-program store helpers ----------
// Core primitives every program-scoped getter/mutator below builds on. A
// program row (from `load('wrenProgram', [])`) looks like:
//   { id, program_json: { weeks: [...], meta: {...} }, active, archived,
//     name, created_at, updated_at }
// `meta` holds schedule-confirmation/deload/injury/skip/off-week state that
// used to live as flat global KV keys shared by every program — it now
// travels with the specific program it belongs to, riding the same
// program_json blob (and therefore the same wrenProgram sync entity) with
// zero DB migration required for that part.
function getRawProgram(id) {
  if (!id) return null;
  return load('wrenProgram', []).find(p => p.id === id) || null;
}

// Defensive: saveProgram()/setActiveProgram() write with no server
// transaction, so two rows can in theory both read `active: true` at once.
// Prefer the most recently touched one rather than silently taking
// whichever happens to sort first.
function getActiveProgramRaw() {
  const actives = load('wrenProgram', []).filter(p => p.active);
  if (actives.length <= 1) return actives[0] || null;
  return actives
    .slice()
    .sort((a, b) => (Number(b.updated_at) || Number(b.created_at) || 0) - (Number(a.updated_at) || Number(a.created_at) || 0))[0];
}

// Every program-scoped getter/mutator takes an optional trailing
// `programId` and falls back to the active program when omitted, so every
// pre-multi-program call site keeps working unchanged.
function resolveProgramId(programId) {
  return programId || getActiveProgramRaw()?.id || null;
}

function getProgramMeta(programId) {
  const raw = getRawProgram(resolveProgramId(programId));
  const pj = raw?.program_json;
  return pj && typeof pj === 'object' && pj.meta && typeof pj.meta === 'object' ? pj.meta : {};
}

// Read-modify-write one program's meta object. `updater(meta) => nextMeta`.
function updateProgramMeta(programId, updater) {
  const id = resolveProgramId(programId);
  if (!id) return {};
  const list = load('wrenProgram', []);
  const idx = list.findIndex(p => p.id === id);
  if (idx === -1) return {};
  const entry = list[idx];
  const pj = entry.program_json && typeof entry.program_json === 'object' ? entry.program_json : {};
  const meta = pj.meta && typeof pj.meta === 'object' ? pj.meta : {};
  const nextMeta = updater(meta) || meta;
  list[idx] = { ...entry, program_json: { ...pj, meta: nextMeta }, updated_at: Date.now() };
  save('wrenProgram', list);
  return nextMeta;
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

// ---------- Deload weeks (per program) ----------
// Deload is no longer auto-assigned every 4th week — it now only takes
// effect for weeks Lauren has explicitly confirmed with Wren. These
// helpers manage the persisted list, scoped to one program's own meta
// (defaults to whichever program is active when `programId` is omitted).
export function getDeloadWeeks(programId) {
  const v = getProgramMeta(programId).deloadWeeks;
  return Array.isArray(v) ? v.map(n => Number(n)).filter(Number.isFinite) : [];
}

export function isDeloadWeek(weekNum, programId) {
  if (!Number.isFinite(weekNum) || weekNum <= 0) return false;
  return getDeloadWeeks(programId).includes(Number(weekNum));
}

export function addDeloadWeek(weekNum, programId) {
  const n = Number(weekNum);
  if (!Number.isFinite(n) || n <= 0) return getDeloadWeeks(programId);
  const set = new Set(getDeloadWeeks(programId));
  set.add(n);
  const next = [...set].sort((a, b) => a - b);
  updateProgramMeta(programId, meta => ({ ...meta, deloadWeeks: next }));
  return next;
}

export function removeDeloadWeek(weekNum, programId) {
  const n = Number(weekNum);
  const next = getDeloadWeeks(programId).filter(x => x !== n);
  updateProgramMeta(programId, meta => ({ ...meta, deloadWeeks: next }));
  return next;
}

// ---------- Injury weeks (per program) ----------
// A week Lauren flagged as injured — she was hurt and trained reduced (or not
// at all). Purely a marker: it surfaces an "Injured" sign on the week in the
// Program view and tells the missed-session logic not to nag her for the
// sessions she couldn't do. It does NOT rewrite the week's sessions (that's the
// separate, larger Injury-Week override feature) and does NOT change set/rep
// math. Mirrors the deload-week store, scoped the same way.
export function getInjuryWeeks(programId) {
  const v = getProgramMeta(programId).injuryWeeks;
  return Array.isArray(v) ? v.map(n => Number(n)).filter(Number.isFinite) : [];
}

export function isInjuryWeek(weekNum, programId) {
  if (!Number.isFinite(weekNum) || weekNum <= 0) return false;
  return getInjuryWeeks(programId).includes(Number(weekNum));
}

export function addInjuryWeek(weekNum, programId) {
  const n = Number(weekNum);
  if (!Number.isFinite(n) || n <= 0) return getInjuryWeeks(programId);
  const set = new Set(getInjuryWeeks(programId));
  set.add(n);
  const next = [...set].sort((a, b) => a - b);
  updateProgramMeta(programId, meta => ({ ...meta, injuryWeeks: next }));
  return next;
}

export function removeInjuryWeek(weekNum, programId) {
  const n = Number(weekNum);
  const next = getInjuryWeeks(programId).filter(x => x !== n);
  updateProgramMeta(programId, meta => ({ ...meta, injuryWeeks: next }));
  return next;
}

// ---------- Off weeks (injury / vacation, calendar-based, per program) ----------
// Distinct from the training-week-number injuryWeeks above. This one is
// keyed by CALENDAR week (Monday-anchored, e.g. "2026-07-20") because it
// drives pausing week progression (see getCurrentWeekAndMesocycle in
// wrenHelpers.js) — a training week number can't be the key for that, since
// the number itself is only knowable once you already know which past
// calendar weeks were paused. Set directly from the home screen (not via
// Wren chat). Reason is 'injury' or 'vacation'; both mean "no training
// expected this week, don't advance the program." Scoped to the program
// that's paused, so switching to a different active program doesn't inherit
// an off-week that only ever applied to the one you paused.
//
// Shape: { [weekKey]: { reason: 'injury'|'vacation', createdAt } }
const OFF_WEEK_REASONS = new Set(['injury', 'vacation']);

// Monday-anchored key for the calendar week containing `d`, e.g. "2026-07-20".
// Alias for currentWeekKey (defined further down) — same bucketing, named for
// clarity at off-week call sites that pass an arbitrary date, not just "now".
export function weekKeyFor(d = new Date()) {
  return currentWeekKey(d);
}

export function getOffWeeks(programId) {
  const v = getProgramMeta(programId).offWeeks;
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

export function getOffWeek(weekKey, programId) {
  const entry = getOffWeeks(programId)[weekKey];
  return entry && OFF_WEEK_REASONS.has(entry.reason) ? entry.reason : null;
}

export function setOffWeek(weekKey, reason, programId) {
  if (!weekKey || !OFF_WEEK_REASONS.has(reason)) return getOffWeeks(programId);
  const next = { ...getOffWeeks(programId), [weekKey]: { reason, createdAt: Date.now() } };
  updateProgramMeta(programId, meta => ({ ...meta, offWeeks: next }));
  return next;
}

export function clearOffWeek(weekKey, programId) {
  const current = getOffWeeks(programId);
  if (!(weekKey in current)) return current;
  const next = { ...current };
  delete next[weekKey];
  updateProgramMeta(programId, meta => ({ ...meta, offWeeks: next }));
  return next;
}

// Which day (if any) Lauren plans to do each saved workout during a given
// off week. Separate from the recurring A/B/C `scheduled_day` on program
// sessions — this is ad hoc and scoped to just that one calendar week, so
// picking "Wednesday" for a workout during one injury week doesn't stick
// around for every week after. Shape: { [weekKey]: { [workoutId]: day } }
export function getOffWeekWorkoutDays(weekKey, programId) {
  const all = getProgramMeta(programId).offWeekWorkoutDays;
  const forWeek = all && typeof all === 'object' ? all[weekKey] : null;
  return forWeek && typeof forWeek === 'object' ? forWeek : {};
}

export function setOffWeekWorkoutDay(weekKey, workoutId, day, programId) {
  if (!weekKey || !workoutId) return;
  const all = getProgramMeta(programId).offWeekWorkoutDays || {};
  const forWeek = { ...(all[weekKey] || {}) };
  if (day) forWeek[workoutId] = day;
  else delete forWeek[workoutId];
  const next = { ...all, [weekKey]: forWeek };
  updateProgramMeta(programId, meta => ({ ...meta, offWeekWorkoutDays: next }));
}

// ---------- Skipped sessions (per program) ----------
// A specific lifting session (A/B/C) Lauren has intentionally skipped for a
// given program week — e.g. she's injured and dropping Session C this week.
// Keyed by program WEEK NUMBER + session label (not calendar date) so it lines
// up with how deload/injury weeks and the Program view identify sessions. A
// skip is a marker: the session shows "Skipped" instead of looking un-done,
// and the weekly-miss logic treats it as resolved (not a miss), so no nag and
// no punishment. Distinct from a logged session — nothing was trained.
//
// Shape: { week:number, label:'A'|'B'|'C', reason:string, createdAt:number }
export function getSkippedSessions(programId) {
  const v = getProgramMeta(programId).skippedSessions;
  return Array.isArray(v)
    ? v.filter(s => s && Number.isFinite(Number(s.week)) && s.label)
    : [];
}

export function getSkippedSessionsForWeek(weekNum, programId) {
  const n = Number(weekNum);
  return getSkippedSessions(programId).filter(s => Number(s.week) === n);
}

export function isSessionSkipped(weekNum, label, programId) {
  const n = Number(weekNum);
  const L = String(label || '').toUpperCase();
  if (!Number.isFinite(n) || n <= 0 || !L) return false;
  return getSkippedSessions(programId).some(s => Number(s.week) === n && String(s.label).toUpperCase() === L);
}

export function addSkippedSession(weekNum, label, reason = '', programId) {
  const n = Number(weekNum);
  const L = String(label || '').toUpperCase();
  if (!Number.isFinite(n) || n <= 0 || !L) return getSkippedSessions(programId);
  if (isSessionSkipped(n, L, programId)) return getSkippedSessions(programId); // idempotent
  const next = [...getSkippedSessions(programId), {
    week: n, label: L, reason: String(reason || '').trim(), createdAt: Date.now(),
  }];
  updateProgramMeta(programId, meta => ({ ...meta, skippedSessions: next }));
  return next;
}

export function removeSkippedSession(weekNum, label, programId) {
  const n = Number(weekNum);
  const L = String(label || '').toUpperCase();
  const next = getSkippedSessions(programId).filter(s => !(Number(s.week) === n && String(s.label).toUpperCase() === L));
  updateProgramMeta(programId, meta => ({ ...meta, skippedSessions: next }));
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
// Context tags Lauren can attach to a weigh-in. These don't change the
// number — they tell Wren WHY the scale might be up so a spike reads as water,
// not fat: `period` (luteal-phase / menstrual water retention), `alcohol`
// (drank the day before — sodium + glycogen rebound), `restaurant` (ate out —
// restaurant food is salt-heavy). Stored only when true to keep entries lean;
// missing = false. Always returns a full object so callers can read flags
// without guarding.
const WEIGH_IN_TAG_KEYS = ['period', 'alcohol', 'restaurant'];
function normalizeWeighInTags(src) {
  const out = {};
  for (const k of WEIGH_IN_TAG_KEYS) out[k] = !!(src && src[k]);
  return out;
}
// True if any context tag is set — used to decide whether to persist a `tags`
// object on the entry at all.
function hasAnyTag(tags) {
  return WEIGH_IN_TAG_KEYS.some((k) => tags[k]);
}
// Free-text note Lauren can attach to a weigh-in ("slept badly", "big carb
// day", "felt bloated"). Stored only when non-empty; trimmed and capped so a
// runaway paste can't bloat the synced blob.
const WEIGH_IN_NOTE_MAX = 280;
function normalizeWeighInNote(src) {
  const s = String(src ?? '').trim();
  return s ? s.slice(0, WEIGH_IN_NOTE_MAX) : '';
}
export function getWeightLog() {
  const v = load('nourishWeightLog', []);
  if (!Array.isArray(v)) return [];
  return v
    .map((r) => ({
      ts: Number(r?.ts) || 0,
      weight: Number(r?.weight) || 0,
      // Older entries predate tags/note — normalize so every row has the full
      // shape and the UI/Wren never have to null-check.
      tags: normalizeWeighInTags(r?.tags),
      note: normalizeWeighInNote(r?.note),
    }))
    .filter((r) => r.ts > 0 && r.weight > 0)
    .sort((a, b) => a.ts - b.ts);
}
// Build the persisted entry, attaching `tags`/`note` only when present.
function makeWeighIn(weight, ts, tags, note) {
  const norm = normalizeWeighInTags(tags);
  const entry = { ts: Number(ts) || Date.now(), weight };
  if (hasAnyTag(norm)) entry.tags = norm;
  const n = normalizeWeighInNote(note);
  if (n) entry.note = n;
  return entry;
}
// Append a new reading. Does NOT dedupe — call replaceWeightForDate first
// if you want the same-day overwrite behavior the UI uses.
export function addWeight(weight, ts = Date.now(), tags = null, note = '') {
  const w = Number(weight);
  if (!Number.isFinite(w) || w <= 0) return getWeightLog();
  const list = getWeightLog();
  list.push(makeWeighIn(w, ts, tags, note));
  list.sort((a, b) => a.ts - b.ts);
  save('nourishWeightLog', list);
  return list;
}
// Replace any existing entries for the same local calendar day as `ts` with
// a single new reading. Returns the new log.
export function replaceWeightForDate(weight, ts = Date.now(), tags = null, note = '') {
  const w = Number(weight);
  if (!Number.isFinite(w) || w <= 0) return getWeightLog();
  const targetKey = localDateKey(ts);
  const filtered = getWeightLog().filter((r) => localDateKey(r.ts) !== targetKey);
  filtered.push(makeWeighIn(w, ts, tags, note));
  filtered.sort((a, b) => a.ts - b.ts);
  save('nourishWeightLog', filtered);
  return filtered;
}
// Delete the weigh-in with this exact timestamp. `ts` is the stable per-entry
// id the UI lists by (one reading per millisecond), so this removes exactly the
// tapped row. Returns the new log. Pairs with addWeight/replaceWeightForDate so
// Lauren can delete a mis-dated entry and re-add it for the correct date.
export function deleteWeight(ts) {
  const t = Number(ts);
  if (!Number.isFinite(t)) return getWeightLog();
  const next = getWeightLog().filter((r) => r.ts !== t);
  save('nourishWeightLog', next);
  return next;
}
// Is there already a reading on the same local calendar day as `ts`? Used to
// decide whether logging for a date should overwrite or append. Generalizes
// hasWeightToday() to any date.
export function hasWeightForDate(ts) {
  const key = localDateKey(ts);
  return getWeightLog().some((r) => localDateKey(r.ts) === key);
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
// Midnight of the Monday that opens the calendar week containing `ts`.
function mondayOfWeek(ts) {
  const d = new Date(Number(ts) || Date.now());
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1; // Mon=0..Sun=6
  d.setDate(d.getDate() - day);
  return d.getTime();
}
// Per-week average weight, oldest→newest, one point per week that has at
// least one reading. Each entry: { weekStart (ms, Monday midnight), avg
// (rounded 0.1), count }. This is the smoothed trend that cancels daily water
// noise — the right series for spotting a real cut/maintain direction and the
// one Wren should reason over instead of single readings. `weeks` caps how
// far back we return (most recent N weeks); pass 0/undefined for all of it.
export function getWeeklyAvgSeries(weeks = 0) {
  const log = getWeightLog();
  if (!log.length) return [];
  const buckets = new Map(); // weekStart -> { sum, count }
  for (const r of log) {
    const ws = mondayOfWeek(r.ts);
    const b = buckets.get(ws) || { sum: 0, count: 0 };
    b.sum += r.weight;
    b.count += 1;
    buckets.set(ws, b);
  }
  const series = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekStart, b]) => ({
      weekStart,
      avg: +(b.sum / b.count).toFixed(1),
      count: b.count,
    }));
  return weeks > 0 ? series.slice(-weeks) : series;
}
// Weigh-ins grouped by Monday-anchored week for the history view — newest week
// first, each week carrying its own average and its readings (newest first).
// Uses the SAME mondayOfWeek bucketing as getWeeklyAvgSeries so the grouped
// list and the trend chart always agree on week boundaries and averages.
// Each group: { weekStart (ms, Monday midnight), avg (0.1), count, entries }.
export function getWeighInsByWeek() {
  const log = getWeightLog(); // ascending by ts, normalized shape
  const buckets = new Map(); // weekStart -> { weekStart, sum, count, entries }
  for (const r of log) {
    const ws = mondayOfWeek(r.ts);
    let b = buckets.get(ws);
    if (!b) { b = { weekStart: ws, sum: 0, count: 0, entries: [] }; buckets.set(ws, b); }
    b.sum += r.weight;
    b.count += 1;
    b.entries.push(r);
  }
  return [...buckets.values()]
    .sort((a, b) => b.weekStart - a.weekStart) // newest week first
    .map((b) => ({
      weekStart: b.weekStart,
      avg: +(b.sum / b.count).toFixed(1),
      count: b.count,
      entries: b.entries.slice().sort((x, y) => y.ts - x.ts), // newest first within the week
    }));
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
  return normalizeProgram(getActiveProgramRaw());
}

// Legacy full-rebuild path: replaces the active program wholesale and
// activates the replacement. Used by the general Wren "Chat" tab's
// generate_program action, unchanged from before multi-program support.
// Creating an ADDITIONAL program (from the Programs list) goes through
// createProgram() + updateProgramJson() instead — see those below.
export function saveProgram(program) {
  const list = load('wrenProgram', []).map(p => ({ ...p, active: false }));
  list.push({
    ...program,
    id: program.id || crypto.randomUUID(),
    active: true,
    archived: false,
    created_at: program.created_at || Date.now(),
    updated_at: Date.now(),
  });
  save('wrenProgram', list);
  return list;
}

// ---------- Multi-program management ----------
export function getProgram(id) {
  return normalizeProgram(getRawProgram(id));
}

// All programs (active first, then most-recently-touched), normalized.
// Archived programs are hidden by default — pass includeArchived to see them.
export function getPrograms({ includeArchived = false } = {}) {
  const list = load('wrenProgram', []);
  const filtered = includeArchived ? list : list.filter(p => !p.archived);
  return filtered
    .slice()
    .sort((a, b) => {
      if (!!a.active !== !!b.active) return a.active ? -1 : 1;
      return (Number(b.updated_at) || Number(b.created_at) || 0) - (Number(a.updated_at) || Number(a.created_at) || 0);
    })
    .map(normalizeProgram);
}

// Reserve a new, inactive, empty-shell program — e.g. before opening a
// scoped Wren chat to generate its content, or as a blank starting point
// for manual editing. Never activates; see setActiveProgram().
export function createProgram({ name = null } = {}) {
  const list = load('wrenProgram', []);
  const now = Date.now();
  const entry = {
    id: crypto.randomUUID(),
    program_json: { weeks: [], meta: {} },
    active: false,
    archived: false,
    name: name ? String(name).trim() : null,
    created_at: now,
    updated_at: now,
  };
  save('wrenProgram', [...list, entry]);
  return entry;
}

// Deep-clones another program's weeks (including each session's
// scheduled_day) into a brand-new, inactive program. Deliberately does NOT
// carry over meta (deload/injury/skip/off-week history) — that history
// belongs to the runs of the original program, not a fresh copy.
export function duplicateProgram(id, { name } = {}) {
  const source = getRawProgram(id);
  if (!source) return null;
  const list = load('wrenProgram', []);
  const now = Date.now();
  const sourcePj = source.program_json && typeof source.program_json === 'object' ? source.program_json : {};
  const clonedWeeks = Array.isArray(sourcePj.weeks) ? JSON.parse(JSON.stringify(sourcePj.weeks)) : [];
  const entry = {
    id: crypto.randomUUID(),
    program_json: { ...sourcePj, weeks: clonedWeeks, meta: {} },
    active: false,
    archived: false,
    name: name ? String(name).trim() : (source.name ? `${source.name} (copy)` : null),
    created_at: now,
    updated_at: now,
  };
  save('wrenProgram', [...list, entry]);
  return entry;
}

export function renameProgram(id, name) {
  const list = load('wrenProgram', []);
  const idx = list.findIndex(p => p.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], name: String(name || '').trim() || null, updated_at: Date.now() };
  save('wrenProgram', list);
  return list[idx];
}

// Archived programs are hidden from getPrograms() by default but never
// deleted — consistent with the rest of this store (deactivate/tombstone,
// never hard-delete). The active program can't be archived; switch active
// programs first.
export function archiveProgram(id) {
  const list = load('wrenProgram', []);
  const idx = list.findIndex(p => p.id === id);
  if (idx === -1 || list[idx].active) return idx === -1 ? null : list[idx];
  list[idx] = { ...list[idx], archived: true, updated_at: Date.now() };
  save('wrenProgram', list);
  return list[idx];
}

export function unarchiveProgram(id) {
  const list = load('wrenProgram', []);
  const idx = list.findIndex(p => p.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], archived: false, updated_at: Date.now() };
  save('wrenProgram', list);
  return list[idx];
}

// The ONLY function that flips which program is active — every other
// mutator here just edits a program's own content. Un-archives the target
// (can't be both archived and active) and deactivates whatever was active.
export function setActiveProgram(id) {
  const list = load('wrenProgram', []);
  if (!list.some(p => p.id === id)) return null;
  const now = Date.now();
  const next = list.map(p => {
    if (p.id === id) return { ...p, active: true, archived: false, updated_at: now };
    if (p.active) return { ...p, active: false, updated_at: now };
    return p;
  });
  save('wrenProgram', next);
  return next.find(p => p.id === id);
}

// Replace a program's weeks wholesale (e.g. Wren's generate_program acting
// on a specific, possibly non-active, program) while preserving its name,
// meta, and active flag — unlike saveProgram(), this never activates.
export function updateProgramJson(id, programJson) {
  const list = load('wrenProgram', []);
  const idx = list.findIndex(p => p.id === id);
  if (idx === -1) return null;
  const entry = list[idx];
  const prevPj = entry.program_json && typeof entry.program_json === 'object' ? entry.program_json : {};
  const nextPj = { ...(programJson || {}), meta: prevPj.meta || {} };
  list[idx] = { ...entry, program_json: nextPj, updated_at: Date.now() };
  save('wrenProgram', list);
  return list[idx];
}

// Every session label already present across a program's weeks, upper-cased.
function collectProgramSessionLabels(program) {
  const labels = new Set();
  for (const wk of program?.weeks || []) {
    const raw = wk?.sessions;
    if (!raw) continue;
    const entries = Array.isArray(raw)
      ? raw.map((s, i) => s?.session_label || s?.label || String.fromCharCode(65 + i))
      : Object.entries(raw).map(([k, s]) => s?.session_label || s?.label || k);
    for (const l of entries) if (l) labels.add(String(l).toUpperCase());
  }
  return labels;
}

// Sessions logged against a specific program. Prefers the robust
// program_id column (every session logged after multi-program support
// shipped); falls back to the same Session-label + date-window matching
// ProgramView.jsx already did for legacy sessions logged before program_id
// existed. That fallback is inherently ambiguous if two different programs
// both used "Session A/B/C" before this shipped — accepted for old data,
// self-heals going forward since every new session gets a real program_id.
export function getSessionsForProgram(id) {
  const raw = getRawProgram(id);
  if (!raw) return [];
  const all = getSessions();
  const tagged = all.filter(s => s.programId === id);
  if (tagged.length) return tagged;
  const program = raw.program_json || raw;
  const labels = collectProgramSessionLabels(program);
  if (!labels.size) return [];
  const createdAt = Number(raw.created_at) || 0;
  return all.filter(s => {
    const m = /^Session\s+([A-Za-z])/.exec(s.workoutName || '');
    return m && labels.has(m[1].toUpperCase()) && (s.finishedAt || 0) >= createdAt;
  });
}

// A program's "start date" = the date of its first logged session, per
// user decision — NOT creation/activation time. Returns null (not started
// yet) until something's actually been logged against it.
export function getProgramStartDate(id) {
  const sessions = getSessionsForProgram(id);
  if (!sessions.length) return null;
  const earliest = Math.min(...sessions.map(s => s.finishedAt || Infinity));
  return Number.isFinite(earliest) ? new Date(earliest) : null;
}

// One-time, per-device migration: copies the legacy flat global KV keys
// (deloadWeeks, injuryWeeks, skippedSessions, offWeeks, offWeekWorkoutDays,
// scheduleWeekConfirmed) into the active program's own meta, so switching
// programs doesn't silently drop Lauren's real, currently-live deload/
// injury/skip state. Guarded by a local-only marker so it only ever runs
// once per device. Only fills fields meta doesn't already have — protects
// a second device (whose local legacy KV is empty/stale) from clobbering
// meta a first device already migrated and synced. Old KV keys are left in
// place (non-destructive), matching this store's existing conventions.
const PROGRAM_STATE_MIGRATION_KEY = 'programStateMigratedV1';

export function migrateGlobalProgramStateToActiveProgram() {
  if (load(PROGRAM_STATE_MIGRATION_KEY, false)) return;
  const active = getActiveProgramRaw();
  if (!active) { save(PROGRAM_STATE_MIGRATION_KEY, true); return; }

  updateProgramMeta(active.id, (meta) => {
    const next = { ...meta };
    if (!next.deloadWeeks?.length) {
      const legacy = load('deloadWeeks', []);
      if (Array.isArray(legacy) && legacy.length) next.deloadWeeks = legacy;
    }
    if (!next.injuryWeeks?.length) {
      const legacy = load('injuryWeeks', []);
      if (Array.isArray(legacy) && legacy.length) next.injuryWeeks = legacy;
    }
    if (!next.skippedSessions?.length) {
      const legacy = load('skippedSessions', []);
      if (Array.isArray(legacy) && legacy.length) next.skippedSessions = legacy;
    }
    if (!next.offWeeks || !Object.keys(next.offWeeks).length) {
      const legacy = load('offWeeks', {});
      if (legacy && typeof legacy === 'object' && Object.keys(legacy).length) next.offWeeks = legacy;
    }
    if (!next.offWeekWorkoutDays || !Object.keys(next.offWeekWorkoutDays).length) {
      const legacy = load('offWeekWorkoutDays', {});
      if (legacy && typeof legacy === 'object' && Object.keys(legacy).length) next.offWeekWorkoutDays = legacy;
    }
    if (!next.scheduleConfirmedWeekKey) {
      const legacy = load('scheduleWeekConfirmed', null);
      if (legacy) next.scheduleConfirmedWeekKey = legacy;
    }
    return next;
  });

  save(PROGRAM_STATE_MIGRATION_KEY, true);
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
  // Format from LOCAL date fields, not toISOString() (which is UTC) — in any
  // UTC+ timezone, local midnight Monday can fall on the previous UTC
  // calendar day, so an ISO-string slice silently produces a Sunday key.
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Monday-anchored key for next week. Used when Lauren plans next week
// after finishing all of this week's sessions.
export function nextWeekKey() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return currentWeekKey(d);
}

// ---------- Cardio sessions (user-added, week-scoped) ----------
// Lifting comes from the Wren program (A/B/C, generated). Cardio is
// user-added and week-only — it doesn't carry over when Monday rolls
// around. Stored as a flat array; consumers filter by weekKey on read.
//
// Shape: { id, name, day, weekKey, createdAt }
//   day:     full weekday name ('Monday' … 'Sunday')
//   weekKey: Monday-anchored YYYY-MM-DD (matches currentWeekKey output)
const CARDIO_KEY = 'cardioSessions';

function loadCardioList() {
  const v = load(CARDIO_KEY, []);
  return Array.isArray(v) ? v : [];
}

export function getCardioSessionsForWeek(weekKey = currentWeekKey()) {
  return loadCardioList()
    .filter((s) => s && s.weekKey === weekKey)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export function addCardioSession({ name, day, weekKey = currentWeekKey() }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) return null;
  if (!day) return null;
  const entry = {
    id: `cardio_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: cleanName,
    day: String(day),
    weekKey,
    createdAt: Date.now(),
  };
  const next = [...loadCardioList(), entry];
  save(CARDIO_KEY, pruneCardioList(next));
  return entry;
}

export function removeCardioSession(id) {
  if (!id) return;
  const next = loadCardioList().filter((s) => s.id !== id);
  save(CARDIO_KEY, next);
}

// Defensive cleanup: drop entries from more than ~4 weeks ago. Cardio is
// week-scoped and the UI only ever asks for the current week, so old rows
// would just sit forever. Runs inline on add so the list never grows.
function pruneCardioList(list) {
  const cutoff = Date.now() - 28 * 86400000;
  return list.filter((s) => (Number(s.createdAt) || 0) >= cutoff);
}

// Has Lauren set/confirmed her training days for the current week yet?
// (scoped to a program; defaults to whichever program is active)
export function isScheduleConfirmedThisWeek(programId) {
  return getProgramMeta(programId).scheduleConfirmedWeekKey === currentWeekKey();
}

// Has Lauren already planned NEXT week? Stays true through this week and
// rolls over: once next Monday arrives, currentWeekKey advances to that
// value and isScheduleConfirmedThisWeek() also returns true.
export function isNextWeekScheduleConfirmed(programId) {
  return getProgramMeta(programId).scheduleConfirmedWeekKey === nextWeekKey();
}

export function markScheduleConfirmed(programId) {
  updateProgramMeta(programId, meta => ({ ...meta, scheduleConfirmedWeekKey: currentWeekKey() }));
}

export function markNextWeekScheduleConfirmed(programId) {
  updateProgramMeta(programId, meta => ({ ...meta, scheduleConfirmedWeekKey: nextWeekKey() }));
}

// Update which weekday each session falls on, across every week of a program,
// in place (no new program record). `dayByLabel` maps a session label to a
// full weekday name, e.g. { A: 'Monday', B: 'Wednesday', C: 'Friday' }.
// Options:
//   confirmFor — 'current' (default) marks this week confirmed; 'next' marks
//                next week (used when planning ahead after finishing the
//                current week); 'none' skips the confirmation update.
//   programId  — defaults to the active program.
export function setProgramSchedule(dayByLabel, { confirmFor = 'current', programId } = {}) {
  if (!dayByLabel || !Object.keys(dayByLabel).length) return null;
  const id = resolveProgramId(programId);
  const list = load('wrenProgram', []);
  const idx = list.findIndex(p => p.id === id);
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
  list[idx] = entry.program_json ? { ...entry, program_json: newProgram, updated_at: Date.now() } : newProgram;
  save('wrenProgram', list);
  if (confirmFor === 'next') markNextWeekScheduleConfirmed(id);
  else if (confirmFor === 'current') markScheduleConfirmed(id);
  return list[idx];
}

// Apply a single in-place edit to one session (by label) across every week of
// a program — so Wren (or the program's own detail-page editor) can tweak
// workouts without rebuilding every week. `op` supports exactly one
// operation:
//   { session_label, swap_from, swap_to }              — replace an exercise
//   { session_label, add_exercise, reps, sets }         — add an exercise
//   { session_label, remove_exercise }                   — remove an exercise
//   { session_label, exercise, reps }                    — change an exercise's reps
//   { session_label, exercise, sets }                    — change an exercise's sets
//   { session_label, superset_a, superset_b }            — link two exercises as a superset
//   { session_label, unlink_superset }                   — break any superset link involving this exercise
//   { session_label, order: [...exerciseNames] }         — reorder exercises in the session
// (sets may be combined with reps on the same op.) `programId` defaults to
// the active program.
export function editProgramSession(op, programId) {
  if (!op || !op.session_label) return null;

  // Side-effects on the sets-overrides bag. Done up front so a swap/remove
  // can't leave a stale override pointing at an exercise that no longer
  // exists in any session, and so a new `sets` value lands even when no
  // structural program change is needed (sets-only edit). Sets overrides
  // stay global across programs (keyed by exercise name only) — not
  // scoped per-program in this pass.
  const setsNum = Number(op.sets);
  const hasSets = Number.isFinite(setsNum) && setsNum > 0;
  if (op.swap_from) clearSetsOverride(op.swap_from);
  if (op.remove_exercise) clearSetsOverride(op.remove_exercise);
  if (hasSets && op.exercise) setSetsOverride(op.exercise, setsNum);
  if (hasSets && op.add_exercise) setSetsOverride(op.add_exercise, setsNum);
  const id = resolveProgramId(programId);
  const list = load('wrenProgram', []);
  const idx = list.findIndex(p => p.id === id);
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
  list[idx] = entry.program_json ? { ...entry, program_json: newProgram, updated_at: Date.now() } : newProgram;
  save('wrenProgram', list);
  return list[idx];
}

// A brand-new blank program (createProgram) starts with zero weeks — there's
// nothing to add a session to yet. Seed 12 empty weeks the first time a day
// gets added, matching every other program's week count in this app today
// (see MESO_LABELS in ProgramView.jsx). Not a hard limit — Wren-generated
// programs can still be any length via generate_program/updateProgramJson.
const DEFAULT_NEW_PROGRAM_WEEKS = 12;

// Add a brand-new session (day) with the given label to every week of a
// program — mirrors how existing session labels already span every week,
// rather than inventing a per-week day concept. No-op (per week) if that
// label already exists there. `programId` defaults to the active program.
export function addProgramSession(label, { exercises = [] } = {}, programId) {
  const L = String(label || '').trim().toUpperCase();
  if (!L) return null;
  const id = resolveProgramId(programId);
  const list = load('wrenProgram', []);
  const idx = list.findIndex(p => p.id === id);
  if (idx === -1) return null;
  const entry = list[idx];
  const program = entry.program_json || entry;
  const baseWeeks = program?.weeks?.length
    ? program.weeks
    : Array.from({ length: DEFAULT_NEW_PROGRAM_WEEKS }, (_, i) => ({ week_number: i + 1, sessions: [] }));

  const newWeeks = baseWeeks.map(wk => {
    if (!wk) return wk;
    const newSession = { session_label: L, exercises: exercises.map(e => ({ ...e })) };
    if (Array.isArray(wk.sessions)) {
      if (wk.sessions.some(s => String(s?.session_label || '').toUpperCase() === L)) return wk;
      return { ...wk, sessions: [...wk.sessions, newSession] };
    }
    if (wk.sessions && typeof wk.sessions === 'object') {
      if (L in wk.sessions) return wk;
      return { ...wk, sessions: { ...wk.sessions, [L]: newSession } };
    }
    return { ...wk, sessions: [newSession] };
  });

  const newProgram = { ...program, weeks: newWeeks };
  list[idx] = entry.program_json ? { ...entry, program_json: newProgram, updated_at: Date.now() } : newProgram;
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
