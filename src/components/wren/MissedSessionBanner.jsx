import React, { useMemo } from 'react';
import { Calendar } from 'lucide-react';
import { c, wren } from './tokens';
import { getSessions, addMissedSession } from '../../lib/storage';
import { computeMissedSessions } from './wrenHelpers';

export default function MissedSessionBanner({ schedule, myWorkouts, sessionsBump, setTab, setActiveWorkout }) {
  const missed = useMemo(() => {
    if (!schedule || !myWorkouts?.length) return [];
    const sessions = getSessions();
    return computeMissedSessions(schedule, myWorkouts, sessions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, myWorkouts, sessionsBump]);

  if (!missed.length) return null;

  const latest = missed[0]; // Most recent missed session

  function handleLogIt() {
    const workout = myWorkouts.find(w => w.id === latest.workoutId);
    if (workout && setActiveWorkout) {
      setActiveWorkout(workout);
    }
  }

  function handleSkipped() {
    addMissedSession({
      type: 'skipped',
      session_date: latest.date,
      workout_name: latest.workoutName,
      workout_id: latest.workoutId,
      day_of_week: latest.dayOfWeek,
    });
    if (setTab) setTab('coach');
  }

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
        <button
          onClick={handleLogIt}
          style={{
            flex: 1, padding: '9px 0', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: c.blush, color: c.white, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
          }}
        >
          I trained, log it
        </button>
        <button
          onClick={handleSkipped}
          style={{
            flex: 1, padding: '9px 0', borderRadius: 999, border: `1px solid ${c.line}`, cursor: 'pointer',
            background: c.white, color: c.charcoal, fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
          }}
        >
          I skipped it
        </button>
      </div>
    </div>
  );
}
