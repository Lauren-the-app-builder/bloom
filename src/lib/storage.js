import { useState, useEffect } from 'react';
import { queue, KV_KEYS } from './sync';

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
  const list = load('sessions', []).filter(s => s.finishedAt !== finishedAt);
  save('sessions', list);
  return list;
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
  const base = canonicalSetsFor(name);
  return isDeload ? deloadSets(base) : base;
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

// Normalize a program: override exercise sets to canonical, fix is_deload so
// only standard deload weeks (4, 8, 12) are marked. Converts object-shaped
// sessions to array form for consistent consumption.
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
      is_deload: weekNum > 0 && weekNum % 4 === 0,
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
function mutateProgramSessions(label, mutator) {
  try {
    const list = load('wrenProgram', []);
    let changed = false;
    for (const entry of list) {
      const program = entry?.program_json || entry;
      if (!program?.weeks?.length) continue;
      for (const wk of program.weeks) {
        const sessions = Array.isArray(wk?.sessions)
          ? wk.sessions
          : (wk?.sessions && typeof wk.sessions === 'object' ? Object.values(wk.sessions) : []);
        for (const sess of sessions) {
          if (String(sess?.session_label || '').toUpperCase() !== String(label).toUpperCase()) continue;
          if (!Array.isArray(sess.exercises)) continue;
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

// Idempotent migration: Session B replaces "Bent-over barbell row" (which
// Lauren swapped out mid-workout) with "Straight arm pulldown" (3x12-15).
// Matches with or without a hyphen and with the legacy "(overhand, upright
// torso)" parenthetical.
export function ensureSessionBPulldown() {
  const lower = (s) => String(s || '').toLowerCase();
  return mutateProgramSessions('B', (sess) => {
    const idx = sess.exercises.findIndex(e => {
      const n = lower(e?.name);
      return n.includes('bent-over barbell row') || n.includes('bent over barbell row');
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

// Has Lauren set/confirmed her training days for the current week yet?
export function isScheduleConfirmedThisWeek() {
  return load('scheduleWeekConfirmed', null) === currentWeekKey();
}

export function markScheduleConfirmed() {
  save('scheduleWeekConfirmed', currentWeekKey());
}

// Update which weekday each session falls on, across every week of the active
// program, in place (no new program record). `dayByLabel` maps a session label
// to a full weekday name, e.g. { A: 'Monday', B: 'Wednesday', C: 'Friday' }.
export function setProgramSchedule(dayByLabel) {
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
  markScheduleConfirmed();
  return list[idx];
}

// Apply a single in-place edit to one session (by label) across every week of
// the active program — so Wren can tweak workouts without rebuilding all 12
// weeks. `op` supports exactly one operation:
//   { session_label, swap_from, swap_to }      — replace an exercise
//   { session_label, add_exercise, reps }       — add an exercise
//   { session_label, remove_exercise }          — remove an exercise
//   { session_label, exercise, reps }            — change an exercise's reps
export function editProgramSession(op) {
  if (!op || !op.session_label) return null;
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
