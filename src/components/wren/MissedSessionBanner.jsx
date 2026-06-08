import React, { useMemo } from 'react';
import { Calendar, Sparkles } from 'lucide-react';
import { c, wren } from './tokens';
import { getSessions, getActiveProgram, addMissedSession } from '../../lib/storage';
import { computeMissedSessions, computeWeeklyMissesForProgram } from './wrenHelpers';

// Two paths exist here:
//   1) Wren program: weekly check that only fires on Sunday. If Lauren is
//      short on her week's sessions, the banner prompts her to talk to
//      Wren — no day-by-day shaming for a flex schedule.
//   2) Legacy myWorkouts: kept the original day-by-day banner for the
//      pre-Wren flow, so users still on that path aren't broken.
export default function MissedSessionBanner({ schedule, myWorkouts, sessionsBump, setTab, setActiveWorkout }) {
  const sessions = useMemo(() => getSessions(), [sessionsBump]);
  const program = useMemo(() => getActiveProgram(), [sessionsBump]);

  // Wren program path — Sunday-only.
  const weekly = useMemo(
    () => computeWeeklyMissesForProgram(program, sessions),
    [program, sessions]
  );

  // Legacy path — day-by-day, lookback 7 days.
  const missedLegacy = useMemo(() => {
    if (!schedule || !myWorkouts?.length) return [];
    return computeMissedSessions(schedule, myWorkouts, sessions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, myWorkouts, sessionsBump]);

  // Weekly check takes priority when there's an active program.
  if (program && weekly.isCheckDay && weekly.missedCount > 0) {
    const { missedCount, loggedCount, scheduledCount, weekNumber } = weekly;
    const handleTalkToWren = () => {
      // Record the weekly short so Wren's punishment tier picks it up and
      // it persists through the conversation.
      addMissedSession({
        type: 'weekly_short',
        session_date: new Date().toISOString().slice(0, 10),
        week_number: weekNumber,
        missed_count: missedCount,
        logged_count: loggedCount,
        scheduled_count: scheduledCount,
      });
      if (setTab) setTab('coach');
    };
    return (
      <div style={{
        padding: 16, borderRadius: 16, background: wren.nudgeBg, marginBottom: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)', borderLeft: `4px solid ${c.blush}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Calendar size={16} color={c.rosedeep} />
          <span style={{ fontSize: 14, fontWeight: 700, color: c.charcoal }}>
            Week {weekNumber} — {missedCount} session{missedCount === 1 ? '' : 's'} short
          </span>
        </div>
        <div style={{ fontSize: 12, color: c.charcoal, lineHeight: 1.5, marginBottom: 12 }}>
          You logged <strong>{loggedCount} of {scheduledCount}</strong> sessions this week.
          {' '}Talk to Wren about what happened.
        </div>
        <button
          onClick={handleTalkToWren}
          style={{
            width: '100%', padding: '9px 0', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: c.rosedeep, color: c.white, fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Sparkles size={12} /> Talk to Wren
        </button>
      </div>
    );
  }

  // Legacy day-by-day banner — only when there's no Wren program AND a
  // missed session was detected the old way.
  if (!program && missedLegacy.length) {
    const latest = missedLegacy[0];
    const handleLogIt = () => {
      const workout = myWorkouts.find(w => w.id === latest.workoutId);
      if (workout && setActiveWorkout) setActiveWorkout(workout);
    };
    const handleSkipped = () => {
      addMissedSession({
        type: 'skipped',
        session_date: latest.date,
        workout_name: latest.workoutName,
        workout_id: latest.workoutId,
        day_of_week: latest.dayOfWeek,
      });
      if (setTab) setTab('coach');
    };
    const dayName = new Date(latest.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
    return (
      <div style={{
        padding: 16, borderRadius: 16, background: wren.nudgeBg, marginBottom: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)', borderLeft: `4px solid ${c.blush}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Calendar size={16} color={c.rosedeep} />
          <span style={{ fontSize: 14, fontWeight: 700, color: c.charcoal }}>
            Missed session
          </span>
        </div>
        <div style={{ fontSize: 12, color: c.charcoal, lineHeight: 1.5, marginBottom: 12 }}>
          It looks like you missed <strong>{latest.workoutName}</strong> on {dayName} ({latest.date}).
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleLogIt} style={{
            flex: 1, padding: '9px 0', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: c.blush, color: c.white, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
          }}>I trained, log it</button>
          <button onClick={handleSkipped} style={{
            flex: 1, padding: '9px 0', borderRadius: 999, border: `1px solid ${c.line}`, cursor: 'pointer',
            background: c.white, color: c.charcoal, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
          }}>I skipped it</button>
        </div>
      </div>
    );
  }

  return null;
}
