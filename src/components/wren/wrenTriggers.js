// Wren-initiated nudges.
//
// Each trigger is a pure function over the current state. When it fires,
// it returns a message Wren wants to send proactively. The Today screen
// surfaces one trigger at a time as a card; tapping it appends the
// message to the chat as an assistant turn and flips to the Wren tab.
//
// We track which triggers have been seen in localStorage so the same
// nudge doesn't re-fire on every render.

import { load, save, getSessions, getActiveProgram, getMissedSessions, isNextWeekScheduleConfirmed } from '../../lib/storage';
import { computeWeeklyMissesForProgram, detectPlateaus, getCurrentWeekAndMesocycle } from './wrenHelpers';

const SEEN_KEY = 'wrenTriggersSeen';

// Read the set of trigger keys Lauren has already acknowledged. Each key
// is the trigger id plus a scope (e.g. the week number) so the same
// trigger can fire again in a future week.
function getSeen() {
  const v = load(SEEN_KEY, []);
  return new Set(Array.isArray(v) ? v : []);
}
export function markTriggerSeen(key) {
  const set = getSeen();
  set.add(key);
  save(SEEN_KEY, [...set]);
}
function isSeen(key) { return getSeen().has(key); }

// Each trigger returns { id, key, title, message } or null. id identifies
// the trigger type; key is the scoped seen-id; title is the card heading;
// message is what Wren writes into chat when Lauren taps the card.
function triggerPlanNextWeek(program, sessions) {
  const day = new Date().getDay(); // 0 = Sunday
  if (day !== 0) return null;
  const weekly = computeWeeklyMissesForProgram(program, sessions);
  if (!weekly.isCheckDay || weekly.scheduledCount === 0) return null;
  if (isNextWeekScheduleConfirmed()) return null;
  const key = `plan_next_week:${weekly.weekNumber || 0}`;
  if (isSeen(key)) return null;
  return {
    id: 'plan_next_week',
    key,
    title: 'Hey — quick check-in',
    message: `Sunday already. Want to lock in your training days for next week? Mon/Wed/Fri usually works for you but tell me if you've got something different on the calendar.`,
  };
}

function triggerWeekShort(program, sessions) {
  const weekly = computeWeeklyMissesForProgram(program, sessions);
  if (!weekly.isCheckDay) return null;
  if (weekly.missedCount <= 0) return null;
  const key = `week_short:${weekly.weekNumber || 0}`;
  if (isSeen(key)) return null;
  return {
    id: 'week_short',
    key,
    title: `You're ${weekly.missedCount} session${weekly.missedCount === 1 ? '' : 's'} short`,
    message: `You logged ${weekly.loggedCount} of ${weekly.scheduledCount} this week. What happened? Tell me straight — I'm not here to judge, I just need the real reason so I know what to adjust.`,
  };
}

function triggerPlateau(program, sessions, myWorkouts) {
  const allEx = new Set();
  myWorkouts.forEach(w => w.exercises?.forEach(e => allEx.add(e)));
  const flags = detectPlateaus(sessions, [...allEx]);
  if (!flags.length) return null;
  // Stable per-exercise key keyed to month so the nudge can repeat in
  // future months if the plateau persists.
  const monthKey = new Date().toISOString().slice(0, 7);
  const first = flags[0];
  const key = `plateau:${first.exercise}:${monthKey}`;
  if (isSeen(key)) return null;
  return {
    id: 'plateau',
    key,
    title: "I'm seeing a plateau",
    message: `You've been stuck on ${first.exercise} at ${first.weight}kg for ${first.sessions} sessions with no rep improvement. Want to talk through options? Could be a deload, an eccentric focus block, a variation swap — your call.`,
  };
}

function triggerDrainedRun(sessions) {
  const sorted = [...sessions]
    .filter(s => !(s.workoutName || '').includes('(past entry)'))
    .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
  const last3 = sorted.slice(0, 3);
  if (last3.length < 3) return null;
  const heavyMoods = new Set(['drained', 'off']);
  const allHeavy = last3.every(s => s.feedback && heavyMoods.has(s.feedback.mood));
  if (!allHeavy) return null;
  // Anchor the key to the most recent session so a fresh feedback entry
  // moves the nudge forward instead of being permanently dismissed.
  const key = `drained_run:${last3[0].finishedAt}`;
  if (isSeen(key)) return null;
  return {
    id: 'drained_run',
    key,
    title: 'Three rough ones in a row',
    message: `Your last three sessions all came back drained or off. That's not nothing. Talk to me — how's sleep, stress, life load? Could be time to back off the volume for a week.`,
  };
}

// Public entry point — returns the highest-priority active nudge, or null.
// Priority order matches the array.
export function computeActiveNudge({ program, sessions, myWorkouts = [], missedSessions = [] }) {
  void missedSessions;
  const wrappers = [
    () => triggerPlanNextWeek(program, sessions),
    () => triggerWeekShort(program, sessions),
    () => triggerPlateau(program, sessions, myWorkouts),
    () => triggerDrainedRun(sessions),
  ];
  for (const w of wrappers) {
    let res = null;
    try { res = w(); } catch { res = null; }
    if (res) return res;
  }
  return null;
}

// For tests / dev: forget all seen triggers so they fire again.
export function resetTriggersSeen() {
  save(SEEN_KEY, []);
}

// Surface the program week so the Today screen can show a tiny context
// crumb on the card.
export function currentWeekNumber(program) {
  return getCurrentWeekAndMesocycle(program).week || 0;
}
