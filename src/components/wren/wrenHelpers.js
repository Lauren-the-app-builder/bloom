// Pure utility functions for the Wren coaching system.

import { load } from '../../lib/storage';

// ---------- Plateau detection ----------
// Flag exercises with no weight or rep improvement across the last 3+ sessions.
export function detectPlateaus(sessions, exerciseNames) {
  const flags = [];
  for (const name of exerciseNames) {
    // Find last 3 sessions containing this exercise (excluding past entries).
    const relevant = sessions
      .filter(s => s.exercises?.[name]?.length && !(s.workoutName || '').includes('(past entry)'))
      .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))
      .slice(0, 3);
    if (relevant.length < 3) continue;
    // Check: same max weight across all 3, no total-rep increase.
    const maxWeights = relevant.map(s => Math.max(...s.exercises[name].map(set => Number(set.weight) || 0)));
    const totalReps = relevant.map(s => s.exercises[name].reduce((n, set) => n + (Number(set.reps) || 0), 0));
    const sameWeight = maxWeights.every(w => w === maxWeights[0]);
    const noRepGain = totalReps[0] <= totalReps[2]; // newest ≤ oldest
    if (sameWeight && noRepGain) {
      flags.push({ exercise: name, weight: maxWeights[0], sessions: 3 });
    }
  }
  return flags;
}

// ---------- Missed session detection ----------
// Compare schedule + logged sessions to find unlogged scheduled days in the lookback window.
export function computeMissedSessions(schedule, workouts, sessions, lookbackDays = 7) {
  const missed = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let i = 1; i <= lookbackDays; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dayOfWeek = d.getDay(); // 0=Sun
    const scheduledId = schedule?.[dayOfWeek];
    if (!scheduledId) continue;
    const workout = workouts.find(w => w.id === scheduledId);
    if (!workout) continue;
    // Check if a session was logged for that workout on that date.
    const dayStart = d.getTime();
    const dayEnd = dayStart + 86400000;
    const logged = sessions.some(s =>
      s.workoutName === workout.name &&
      Number(s.finishedAt) >= dayStart &&
      Number(s.finishedAt) < dayEnd &&
      !(s.workoutName || '').includes('(past entry)')
    );
    if (!logged) {
      missed.push({
        date: d.toISOString().slice(0, 10),
        dayOfWeek,
        workoutName: workout.name,
        workoutId: workout.id,
      });
    }
  }
  return missed;
}

// ---------- Week / mesocycle computation ----------
// Fixed program start date. Wren's generated startDate is often wrong (places
// the user 12 weeks deep), so we ignore the data and use this canonical date.
// TODO: make this user-configurable via settings.
const PROGRAM_START = new Date('2026-05-25T00:00:00');

export function getCurrentWeekAndMesocycle(rawProgram) {
  const program = rawProgram?.program_json || rawProgram || null;
  if (!program?.weeks?.length) {
    return { week: 0, mesocycle: 0, phase: 'none', isDeload: false, hasStarted: false, startDate: PROGRAM_START };
  }
  const startDate = PROGRAM_START;
  const now = new Date();
  const diffMs = now - startDate;
  // weekIndex 0 = week 1; max at last week of the program.
  const weekIndex = Math.max(0, Math.floor(diffMs / (7 * 86400000)));
  const clamped = Math.min(weekIndex, program.weeks.length - 1);
  const weekNum = clamped + 1;
  return {
    week: weekNum,
    mesocycle: Math.floor(clamped / 4) + 1,
    phase: 'normal',
    // Deload weeks are 4, 8, 12 — derived from week number, not data.
    isDeload: weekNum > 0 && weekNum % 4 === 0,
    hasStarted: now >= startDate,
    startDate,
  };
}

// ---------- Build enriched context for API calls ----------
export function buildWrenContext({ schedule, myWorkouts, sessions, unit, program, missedSessions }) {
  const allExNames = new Set();
  myWorkouts.forEach(w => w.exercises?.forEach(e => allExNames.add(e)));
  const plateauFlags = detectPlateaus(sessions, [...allExNames]);

  const { week, mesocycle, phase, isDeload } = getCurrentWeekAndMesocycle(program);

  // Count missed sessions in last 28 days.
  const cutoff28 = Date.now() - 28 * 86400000;
  const recentMisses = (missedSessions || []).filter(m => new Date(m.session_date || m.date).getTime() > cutoff28);

  // Figure out this week's session status.
  const startOfWeek = (() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const off = d.getDay() === 0 ? 6 : d.getDay() - 1;
    d.setDate(d.getDate() - off);
    return d.getTime();
  })();
  const thisWeekSessions = sessions.filter(s => Number(s.finishedAt) >= startOfWeek);

  // Last session data.
  const sorted = sessions
    .filter(s => !(s.workoutName || '').includes('(past entry)'))
    .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
  const lastSession = sorted[0] || null;

  // Build per-exercise best weight/reps from ALL session history.
  const liftBests = {};
  for (const s of sessions) {
    if ((s.workoutName || '').includes('(past entry)')) continue;
    for (const [name, sets] of Object.entries(s.exercises || {})) {
      for (const set of sets) {
        const w = Number(set.weight) || 0;
        const r = Number(set.reps) || 0;
        if (!liftBests[name] || w > liftBests[name].weight || (w === liftBests[name].weight && r > liftBests[name].reps)) {
          liftBests[name] = { weight: w, reps: r };
        }
      }
    }
  }

  return {
    currentWeek: week,
    currentMesocycle: mesocycle,
    phase,
    isDeload,
    plateauFlags,
    liftBests,
    missedSessionCount: recentMisses.length,
    missedSessionDetails: recentMisses,
    thisWeekSessions: thisWeekSessions.map(s => s.workoutName),
    lastSessionData: lastSession ? {
      name: lastSession.workoutName,
      date: new Date(lastSession.finishedAt).toLocaleDateString(),
      exercises: lastSession.exercises,
      durationMin: Math.round((lastSession.durationSec || 0) / 60),
    } : null,
    schedule,
    unit,
    workoutNames: myWorkouts.map(w => w.name),
  };
}

// ---------- Punishment thresholds ----------
export function shouldAssignPunishment(missedCount) {
  if (missedCount >= 4) return { level: 'restructure', description: 'Open a direct conversation about whether the program is realistic.' };
  if (missedCount >= 3) return { level: 'cardio', description: '20-minute cardio finisher: 4×400m run at uncomfortable pace, or 20 min rowing at 75% effort.' };
  if (missedCount >= 2) return { level: 'hiit', description: '10-minute HIIT finisher: 5 rounds of 30s assault bike + 30s rest, or 10 burpees + 10 KB swings ×3.' };
  return null;
}

// ---------- Band progression for assisted pull-ups ----------
const BAND_ORDER = ['heavy', 'medium', 'light', 'none'];
export function getBandProgression(sessions, exerciseName = 'Assisted Pull-Ups') {
  const relevant = sessions
    .filter(s => s.exercises?.[exerciseName]?.length)
    .sort((a, b) => (a.finishedAt || 0) - (b.finishedAt || 0));
  return relevant.map(s => {
    const sets = s.exercises[exerciseName];
    // Band is stored on each set; use the most common one.
    const bands = sets.map(st => st.band || 'heavy');
    const counts = {};
    bands.forEach(b => { counts[b] = (counts[b] || 0) + 1; });
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'heavy';
    return {
      date: new Date(s.finishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      band: dominant,
      bandIndex: BAND_ORDER.indexOf(dominant),
      sets: sets.length,
    };
  });
}

export function shouldProgressBand(sessions, exerciseName = 'Assisted Pull-Ups', targetReps = 10) {
  const recent = sessions
    .filter(s => s.exercises?.[exerciseName]?.length && !(s.workoutName || '').includes('(past entry)'))
    .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))
    .slice(0, 3);
  if (recent.length < 2) return null;
  const currentBand = (recent[0].exercises[exerciseName][0]?.band) || 'heavy';
  const allHit = recent.slice(0, 2).every(s =>
    s.exercises[exerciseName].every(set => (Number(set.reps) || 0) >= targetReps && (set.band || 'heavy') === currentBand)
  );
  if (!allHit) return null;
  const nextIdx = BAND_ORDER.indexOf(currentBand) + 1;
  if (nextIdx >= BAND_ORDER.length) return null;
  return { currentBand, nextBand: BAND_ORDER[nextIdx] };
}
