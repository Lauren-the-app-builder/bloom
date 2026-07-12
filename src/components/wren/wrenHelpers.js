// Pure utility functions for the Wren coaching system.

import { load, isDeloadWeek, getDeloadWeeks, isInjuryWeek, getInjuryWeeks, getWrenNotes, getCalorieGoal, getCurrentWeight, getWeeklyAvgWeight, getWeeklyAvgSeries, getWeightChange, getWeightLog, getNourishPhase, getCardioSessionsForWeek } from '../../lib/storage';
import { comboKey, comboLabel } from './tokens';

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

// ---------- Weekly miss check ----------
// Sunday-anchored: at the end of each program week, count how many of the
// scheduled sessions weren't logged. Because Lauren flexes her days within
// the week, day-by-day detection lights up false positives (training A on
// Tuesday instead of Monday would still flag Monday). This runs once a
// week and only counts what's truly short.
//
// Returns { isCheckDay, scheduledCount, loggedCount, missedCount }.
// isCheckDay is true on Sunday (day 0) and remains the gate the banner
// uses — pass `force: true` to bypass for things like Wren's context.
export function computeWeeklyMissesForProgram(program, sessions, { now = new Date(), force = false } = {}) {
  const day = now.getDay();
  const isCheckDay = day === 0; // Sunday
  if (!isCheckDay && !force) {
    return { isCheckDay: false, scheduledCount: 0, loggedCount: 0, missedCount: 0 };
  }

  const programData = program?.program_json || program || null;
  const { week: currentWeek, startDate, hasStarted } = getCurrentWeekAndMesocycle(program);
  if (!hasStarted || !programData?.weeks?.length || currentWeek <= 0) {
    return { isCheckDay, scheduledCount: 0, loggedCount: 0, missedCount: 0 };
  }

  const weekIdx = Math.min(Math.max(0, currentWeek - 1), programData.weeks.length - 1);
  const wkData = programData.weeks[weekIdx];
  const wkSessions = Array.isArray(wkData?.sessions)
    ? wkData.sessions
    : (wkData?.sessions ? Object.values(wkData.sessions) : []);
  const scheduledCount = wkSessions.length;

  const weekStart = startDate.getTime() + (currentWeek - 1) * 7 * 86400000;
  const weekEnd = weekStart + 7 * 86400000;
  const loggedCount = (sessions || []).filter(s =>
    Number(s.finishedAt) >= weekStart &&
    Number(s.finishedAt) < weekEnd &&
    !(s.workoutName || '').includes('(past entry)')
  ).length;

  // An injured week is never treated as "short" — Lauren trained around an
  // injury, so unlogged sessions here are expected, not a miss. We keep the
  // real logged/scheduled counts (so the UI can still show "2 of 3") but zero
  // out missedCount so the Sunday nag, the missed-session banner, and the
  // punishment system all stay quiet. Matches Wren's rule that injury never
  // counts toward a punishment.
  const injured = isInjuryWeek(currentWeek);
  const missedCount = injured ? 0 : Math.max(0, scheduledCount - loggedCount);
  return { isCheckDay, scheduledCount, loggedCount, missedCount, injured, weekNumber: currentWeek };
}

// ---------- Missed session detection (legacy day-based) ----------
// Compare schedule + logged sessions to find unlogged scheduled days in the lookback window.
// Kept for the legacy myWorkouts flow; the Wren program flow uses
// computeWeeklyMissesForProgram instead.
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
    // Deload is opt-in now — only true for weeks Lauren has confirmed
    // with Wren (stored via addDeloadWeek).
    isDeload: isDeloadWeek(weekNum),
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

  // Weekly miss check — forced so Wren sees this any day, not just Sundays.
  // She uses it to know how the current week is tracking.
  const weeklyMiss = computeWeeklyMissesForProgram(program, sessions, { force: true });
  // Confirmed deload weeks — Lauren has explicitly agreed to these.
  const deloadWeeks = getDeloadWeeks();
  // Weeks Lauren flagged as injured — she trained reduced/not at all.
  const injuryWeeks = getInjuryWeeks();
  // Long-term memory — facts Wren has saved with the remember action.
  const wrenNotes = getWrenNotes();

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

  // Build per-exercise best weight/reps from ALL session history. Bands
  // sets (no weight) are tracked separately as bandsBestReps — keyed by
  // exercise and combo — so Wren can see Lauren's PR rep count per combo.
  const liftBests = {};
  const bandsBestReps = {}; // { [exerciseName]: { [comboKey]: { combo: [...], reps: N, date: ms } } }
  for (const s of sessions) {
    if ((s.workoutName || '').includes('(past entry)')) continue;
    for (const [name, sets] of Object.entries(s.exercises || {})) {
      for (const set of sets) {
        if (Array.isArray(set.bands)) {
          const key = comboKey(set.bands);
          const reps = Number(set.reps) || 0;
          const bucket = bandsBestReps[name] || (bandsBestReps[name] = {});
          if (!bucket[key] || reps > bucket[key].reps) {
            bucket[key] = { combo: [...set.bands], reps, date: Number(s.finishedAt) || 0 };
          }
          continue;
        }
        const w = Number(set.weight) || 0;
        const r = Number(set.reps) || 0;
        if (!liftBests[name] || w > liftBests[name].weight || (w === liftBests[name].weight && r > liftBests[name].reps)) {
          liftBests[name] = { weight: w, reps: r };
        }
      }
    }
  }

  // Human-readable summary Wren can quote back, e.g.
  //   "Assisted Pull-Ups (bands): best 9 reps on Green + Blue; 6 reps on Green ×2"
  const bandsSummary = {};
  for (const [name, byCombo] of Object.entries(bandsBestReps)) {
    bandsSummary[name] = Object.values(byCombo)
      .sort((a, b) => b.reps - a.reps)
      .map(b => `${b.reps} reps on ${comboLabel(b.combo)}`)
      .join('; ');
  }

  return {
    currentWeek: week,
    currentMesocycle: mesocycle,
    phase,
    isDeload,
    plateauFlags,
    liftBests,
    bandsBestReps,
    bandsSummary,
    missedSessionCount: recentMisses.length,
    missedSessionDetails: recentMisses,
    weeklyMiss,
    deloadWeeks,
    injuryWeeks,
    wrenNotes,
    thisWeekSessions: thisWeekSessions.map(s => s.workoutName),
    lastSessionData: lastSession ? {
      name: lastSession.workoutName,
      date: new Date(lastSession.finishedAt).toLocaleDateString(),
      exercises: lastSession.exercises,
      durationMin: Math.round((lastSession.durationSec || 0) / 60),
      feedback: lastSession.feedback || null,
      // Lauren-attached 20-min HIIT finisher (omit when absent so the
      // payload stays tight). Wren factors this into volume/recovery.
      ...(lastSession.hiitFinisher ? { hiitFinisher: true } : {}),
      // Deload day — light/off session that still counts. Flag it so Wren
      // reads the lower numbers as intentional, not a regression, and
      // doesn't use them as the progression baseline.
      ...(lastSession.deload ? { deload: true } : {}),
    } : null,
    // Roll up Lauren's feedback from the last 10 sessions so Wren can
    // notice patterns (e.g. "drained on every Friday session").
    recentSessionFeedback: sorted.slice(0, 10)
      .filter(s => s.feedback && (s.feedback.mood || s.feedback.notes))
      .map(s => ({
        name: s.workoutName,
        date: new Date(s.finishedAt).toLocaleDateString(),
        mood: s.feedback.mood || null,
        notes: s.feedback.notes || null,
        // Cardio sessions carry { zone } in a sidecar — surface it so Wren
        // can read intensity alongside mood without parsing the name.
        cardio: s.cardio || null,
      })),
    // Per-exercise technique adjustments Lauren has flagged in the last
    // ~12 sessions. Wren must NOT read drops on these exercises as
    // regression while a recent adjustment is on file.
    recentExerciseAdjustments: sorted.slice(0, 12)
      .filter(s => s.exerciseAdjustments && Object.keys(s.exerciseAdjustments).length)
      .map(s => ({
        date: new Date(s.finishedAt).toLocaleDateString(),
        workoutName: s.workoutName,
        changes: s.exerciseAdjustments, // { [exerciseName]: 'Slowed eccentric to 3s' }
      })),
    // Recent lift sessions Lauren tagged with a 20-min HIIT finisher.
    // Wren reads this to factor in true session volume and weekly
    // conditioning load — e.g. "you've added HIIT after every Friday
    // session for three weeks, that's a lot of accumulated intensity".
    // Last ~14 sessions so a fortnight of pattern is visible.
    recentHiitFinishers: sorted.slice(0, 14)
      .filter(s => s.hiitFinisher)
      .map(s => ({
        date: new Date(s.finishedAt).toLocaleDateString(),
        workoutName: s.workoutName,
        durationMin: 20,
      })),
    schedule,
    unit,
    workoutNames: myWorkouts.map(w => w.name),
    // Cardio is week-scoped and user-added (or Wren-added via
    // add_cardio_session). Hand the current week's list to the API so
    // Wren can reference it without re-deriving — and so she doesn't
    // double-add the same one when Lauren mentions it twice.
    cardioThisWeek: getCardioSessionsForWeek().map(s => ({ name: s.name, day: s.day })),
    // Nourish screen snapshot — calorie goal + weight trend. Wren references
    // this so she can speak to Lauren's nutrition + weight without us
    // re-deriving it server-side. Numbers are all lbs (Nourish is fixed
    // to lbs, independent of the kg/lb workout toggle).
    nourish: (() => {
      const cur = getCurrentWeight();
      const log = getWeightLog();
      return {
        // phase: 'cut' | 'maintain' | null. Frames how Wren reads the weight
        // trend — flat weekly avg means "good" on maintain but "stalled" on cut.
        phase: getNourishPhase(),
        calorie_goal: getCalorieGoal() || null,
        weight_unit: 'lbs',
        weight_current: cur ? {
          weight: cur.weight,
          date: new Date(cur.ts).toLocaleDateString(),
          // Context tags Lauren attached to this weigh-in (water-retention
          // cues, not fat): on her period, drank alcohol the day before, ate
          // at a restaurant. Only the true ones are surfaced.
          tags: cur.tags ? Object.keys(cur.tags).filter((k) => cur.tags[k]) : [],
          // Free-text note Lauren left on this weigh-in — extra context in her
          // own words (sleep, bloating, a big meal). Read it alongside tags.
          note: cur.note || null,
        } : null,
        weight_weekly_avg: getWeeklyAvgWeight(),
        // Smoothed week-over-week trend (last 8 weekly averages, oldest→newest).
        // This cancels daily water noise — the series Wren should reason over to
        // judge cut/maintain direction, not single readings. Each: { week, avg }.
        weekly_avg_trend: getWeeklyAvgSeries(8).map((p) => ({
          week: new Date(p.weekStart).toLocaleDateString(),
          avg: p.avg,
        })),
        weight_change_daily: getWeightChange('daily'),
        weight_change_weekly: getWeightChange('weekly'),
        weight_change_monthly: getWeightChange('monthly'),
        weight_log_count: log.length,
        // Last ~10 weigh-ins that carry context (a tag OR a free-text note), so
        // Wren can correlate a spike with its cause and explain it as water
        // (e.g. "you ate out and it's a period week — that bump is salt +
        // hormones, not fat"). Context-free readings are omitted to keep the
        // payload tight.
        recent_tagged_weigh_ins: log.slice(-10)
          .filter((r) => (r.tags && (r.tags.period || r.tags.alcohol || r.tags.restaurant)) || r.note)
          .map((r) => ({
            date: new Date(r.ts).toLocaleDateString(),
            weight: r.weight,
            tags: r.tags ? Object.keys(r.tags).filter((k) => r.tags[k]) : [],
            note: r.note || null,
          })),
      };
    })(),
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
