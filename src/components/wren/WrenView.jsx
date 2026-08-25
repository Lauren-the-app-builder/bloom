import React from 'react';
import { Sparkles, Settings, ListChecks } from 'lucide-react';
import { c } from './tokens';
import { getActiveProgram } from '../../lib/storage';
import { getCurrentWeekAndMesocycle } from './wrenHelpers';
import WrenChat from './WrenChat';

// The Wren tab is chat-only now — program browsing/editing lives on its own
// Programs tab (see ProgramsView/ProgramDetailView). `onOpenPrograms`
// navigates there, both from the header pill and from WrenChat's own
// "view program" card.
export default function WrenView({ schedule, myWorkouts, setMyWorkouts, unit, allExercises, sessionsBump, onOpenSettings, onStartWorkout, onOpenPrograms }) {
  const program = getActiveProgram();
  const { week, hasStarted } = getCurrentWeekAndMesocycle(program);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      flex: 1, minHeight: 0, overflow: 'hidden',
      background: '#FAF7F8',
      position: 'relative',
    }}>
      {/* Sky background sits behind the header so it stretches edge to
          edge, top to bottom. A soft white wash lightens the image so it
          reads as a pastel backdrop. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'url(/Wren.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(255,255,255,0.22)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 16px 12px',
        flexShrink: 0, zIndex: 10,
        position: 'relative',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: `linear-gradient(135deg, ${c.rosedeep}, ${c.rose})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          boxShadow: '0 2px 8px rgba(201,122,174,0.3)',
        }}>
          <Sparkles size={16} color="white" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 16, fontWeight: 800, letterSpacing: -0.3,
            color: 'white',
            textShadow: '0 1px 6px rgba(80,40,90,0.25)',
          }}>Bloom</div>
          <div style={{
            fontSize: 10, marginTop: 0,
            color: 'rgba(255,255,255,0.92)',
            textShadow: '0 1px 4px rgba(80,40,90,0.3)',
          }}>
            {program && hasStarted ? `${week} week${week === 1 ? '' : 's'} of these workouts` : 'Your AI coach'}
          </div>
        </div>
        {onOpenPrograms && (
          <button
            onClick={onOpenPrograms}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
              fontSize: 10, fontWeight: 700, fontFamily: 'inherit', letterSpacing: 0.3,
              background: 'rgba(255,255,255,0.55)', color: c.charcoal,
              backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
            }}
          >
            <ListChecks size={12} /> Programs
          </button>
        )}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(255,255,255,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            }}
          >
            <Settings size={13} color={c.muted} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{
        flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        position: 'relative', zIndex: 1,
      }}>
        <WrenChat schedule={schedule} myWorkouts={myWorkouts} setMyWorkouts={setMyWorkouts} unit={unit} sessionsBump={sessionsBump} onStartWorkout={onStartWorkout} onViewProgram={onOpenPrograms} />
      </div>
    </div>
  );
}
