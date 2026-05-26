import React, { useMemo } from 'react';
import { Sparkles, Trophy, Target } from 'lucide-react';
import { c, wren } from './tokens';
import { getActiveProgram, getSessions } from '../../lib/storage';
import { getCurrentWeekAndMesocycle, computeMissedSessions } from './wrenHelpers';
import MissedSessionBanner from './MissedSessionBanner';

export default function NudgeCard({ schedule, myWorkouts, sessionsBump, setTab, setActiveWorkout }) {
  const mode = useMemo(() => {
    if (!schedule || !myWorkouts?.length) return null;

    const now = new Date();
    const today = now.getDay(); // 0=Sun
    const scheduledId = schedule[today];
    const sessions = getSessions();

    // Check for missed sessions first (mode 3)
    const missed = computeMissedSessions(schedule, myWorkouts, sessions);
    if (missed.length > 0) return { type: 'missed', missed };

    // No workout scheduled today (mode 4)
    if (!scheduledId) return null;

    const workout = myWorkouts.find(w => w.id === scheduledId);
    if (!workout) return null;

    // Check if today's session is already logged (mode 2)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 86400000;
    const doneToday = sessions.some(s =>
      s.workoutName === workout.name &&
      Number(s.finishedAt) >= todayStart &&
      Number(s.finishedAt) < todayEnd &&
      !(s.workoutName || '').includes('(past entry)')
    );

    if (doneToday) return { type: 'done', workout };

    // Mode 1: scheduled but not yet done
    const program = getActiveProgram();
    const { week, phase, isDeload } = getCurrentWeekAndMesocycle(program);
    return { type: 'targets', workout, week, phase, isDeload };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, myWorkouts, sessionsBump]);

  if (!mode) return null;

  // Mode 3: missed sessions
  if (mode.type === 'missed') {
    return (
      <MissedSessionBanner
        schedule={schedule}
        myWorkouts={myWorkouts}
        sessionsBump={sessionsBump}
        setTab={setTab}
        setActiveWorkout={setActiveWorkout}
      />
    );
  }

  // Mode 2: session done
  if (mode.type === 'done') {
    return (
      <div style={{
        padding: 16, borderRadius: 16, background: c.white, marginBottom: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)', borderLeft: `4px solid #4a8a5a`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Trophy size={16} color="#4a8a5a" />
          <span style={{ fontSize: 14, fontWeight: 700, color: c.charcoal }}>Nice work</span>
        </div>
        <div style={{ fontSize: 12, color: c.muted, lineHeight: 1.5 }}>
          You crushed {mode.workout.name} today. Rest up and recover for your next session.
        </div>
      </div>
    );
  }

  // Mode 1: targets for today
  const instruction = mode.isDeload
    ? `Deload week: focus on form and lighter loads during ${mode.workout.name}. Recovery is part of the plan.`
    : `Time for ${mode.workout.name}. Push for progressive overload where you can.`;

  return (
    <div style={{
      padding: 16, borderRadius: 16, background: c.white, marginBottom: 12,
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)', borderLeft: `4px solid ${c.blush}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Target size={16} color={c.rosedeep} />
        <span style={{ fontSize: 14, fontWeight: 700, color: c.charcoal }}>
          Wren's targets for today
        </span>
      </div>
      <div style={{ fontSize: 12, color: c.muted, lineHeight: 1.5 }}>
        {instruction}
      </div>
    </div>
  );
}
