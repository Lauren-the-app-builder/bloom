import React, { useState } from 'react';
import { Sparkles, Settings } from 'lucide-react';
import { c } from './tokens';
import { getActiveProgram } from '../../lib/storage';
import { getCurrentWeekAndMesocycle } from './wrenHelpers';
import WrenChat from './WrenChat';
import ProgramView from './ProgramView';

export default function WrenView({ schedule, myWorkouts, unit, allExercises, sessionsBump, onOpenSettings, onStartWorkout }) {
  const [view, setView] = useState('chat');
  const program = getActiveProgram();
  const { week } = getCurrentWeekAndMesocycle(program);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      flex: 1, minHeight: 0, overflow: 'hidden',
      background: '#FAF7F8',
    }}>
      {/* Sticky header — always visible */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 16px 10px',
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(240,232,238,0.6)',
        flexShrink: 0, zIndex: 10,
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
          <div style={{ fontSize: 16, fontWeight: 800, color: c.charcoal, letterSpacing: -0.3 }}>Bloom</div>
          <div style={{ fontSize: 10, color: c.muted, marginTop: 0 }}>
            {program ? `Week ${week} of 12` : 'Your AI coach'}
          </div>
        </div>
        {/* Toggle */}
        <div style={{
          display: 'flex', background: 'rgba(240,232,238,0.6)', borderRadius: 999, padding: 2,
        }}>
          {['chat', 'program'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '4px 11px', borderRadius: 999, border: 'none', cursor: 'pointer',
                fontSize: 10, fontWeight: 700, fontFamily: 'inherit', letterSpacing: 0.3,
                background: view === v ? 'white' : 'transparent',
                color: view === v ? c.charcoal : c.muted,
                boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {v === 'chat' ? 'Chat' : 'Program'}
            </button>
          ))}
        </div>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'white', border: '1px solid rgba(240,232,238,0.8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <Settings size={13} color={c.muted} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {view === 'chat' ? (
          <WrenChat schedule={schedule} myWorkouts={myWorkouts} unit={unit} sessionsBump={sessionsBump} onStartWorkout={onStartWorkout} onViewProgram={() => setView('program')} />
        ) : (
          <ProgramView />
        )}
      </div>
    </div>
  );
}
