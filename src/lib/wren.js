// Wren — the AI coach. Calls /api/wren which proxies to Claude.

const API = '/api/wren';

export async function askWren(message, context = {}, midWorkout = false) {
  const {
    currentWeek,
    currentMesocycle,
    phase,
    isDeload,
    plateauFlags = [],
    missedSessionCount = 0,
    missedSessionDetails = [],
    thisWeekSessions = [],
    lastSessionData,
    schedule = {},
    unit = 'kg',
    workoutNames = [],
    activeProgram,
    fullHistory = [],
    myWorkouts = [],
    sessions = [],
    exerciseDb,
    bandsBestReps = {},
    bandsSummary = {},
    weeklyMiss = null,
    deloadWeeks = [],
    recentSessionFeedback = [],
    recentExerciseAdjustments = [],
  } = context;

  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      context: {
        myWorkouts,
        schedule,
        sessions,
        exerciseDb,
        fullHistory,
        currentWeek,
        currentMesocycle,
        phase,
        isDeload,
        plateauFlags,
        missedSessionCount,
        missedSessionDetails,
        thisWeekSessions,
        lastSessionData,
        workoutNames,
        activeProgram,
        unit,
        bandsBestReps,
        bandsSummary,
        weeklyMiss,
        deloadWeeks,
        recentSessionFeedback,
        recentExerciseAdjustments,
      },
      midWorkout,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return { reply: data.reply, actions: data.actions || [] };
}

export async function askWrenReaction(sessionData, context = {}) {
  const prompt = `I just finished a session. Here is the data:\n${JSON.stringify(sessionData)}\n\nGive me a 2-4 sentence post-session reaction based on this data and my recent history.`;

  return askWren(prompt, context, false);
}
