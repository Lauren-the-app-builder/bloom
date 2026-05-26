import React, { useState } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { c } from './tokens';
import { getActiveProgram, setsForExercise } from '../../lib/storage';
import { getCurrentWeekAndMesocycle } from './wrenHelpers';

const MESO_LABELS = [
  { title: 'Mesocycle 1', subtitle: 'Foundation' },
  { title: 'Mesocycle 2', subtitle: 'Build' },
  { title: 'Mesocycle 3', subtitle: 'Peak' },
];

function weekStatus(weekNum, currentWeek) {
  if (weekNum < currentWeek) return 'done';
  if (weekNum === currentWeek) return 'current';
  return 'upcoming';
}

const STATUS_STYLES = {
  done: { background: '#e6f5ea', color: '#2e7d4a', label: 'Done' },
  current: { background: c.blush, color: c.white, label: 'Current' },
  upcoming: { background: c.line, color: c.muted, label: 'Upcoming' },
  deload: { background: '#ede4f7', color: '#7040A0', label: 'Deload' },
};

export default function ProgramView() {
  const rawProgram = getActiveProgram();
  // The program data lives inside program_json (from Supabase schema).
  const program = rawProgram?.program_json || rawProgram || null;
  const { week: currentWeek } = getCurrentWeekAndMesocycle(program);
  const [expandedWeek, setExpandedWeek] = useState(null);
  const [collapsedMeso, setCollapsedMeso] = useState({});

  if (!program || !program.weeks?.length) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: 32, textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', background: c.line,
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        }}>
          <Sparkles size={24} color={c.muted} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: c.charcoal, marginBottom: 6 }}>
          No program yet
        </div>
        <div style={{ fontSize: 12, color: c.muted, maxWidth: 220 }}>
          Chat with Wren to create your program
        </div>
      </div>
    );
  }

  // Group weeks by mesocycle (4 weeks each)
  const mesocycles = [0, 1, 2].map(mi => {
    const start = mi * 4;
    return program.weeks.slice(start, start + 4);
  });

  function toggleMeso(idx) {
    setCollapsedMeso(prev => ({ ...prev, [idx]: !prev[idx] }));
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
      {mesocycles.map((weeks, mi) => {
        if (!weeks.length) return null;
        const isCollapsed = collapsedMeso[mi];
        const label = MESO_LABELS[mi];

        return (
          <div key={mi} style={{ marginBottom: 16 }}>
            {/* Mesocycle header */}
            <button
              onClick={() => toggleMeso(mi)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px', borderRadius: 14, border: 'none', cursor: 'pointer',
                background: c.paper, fontFamily: 'inherit',
              }}
            >
              <ChevronRight
                size={16}
                color={c.charcoal}
                style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.15s ease' }}
              />
              <span style={{ fontSize: 14, fontWeight: 700, color: c.charcoal }}>
                {label.title}
              </span>
              <span style={{ fontSize: 12, color: c.muted }}>
                — {label.subtitle}
              </span>
            </button>

            {/* Weeks */}
            {!isCollapsed && (
              <div style={{ marginTop: 6 }}>
                {weeks.map((wk, wi) => {
                  const wNum = wk.week_number || mi * 4 + wi + 1;
                  // Deload is fixed by week number (4, 8, 12), not data.
                  const isDeloadWk = wNum > 0 && wNum % 4 === 0;
                  const status = isDeloadWk ? 'deload' : weekStatus(wNum, currentWeek);
                  const st = STATUS_STYLES[status];
                  const isExpanded = expandedWeek === wNum;

                  return (
                    <div key={wNum} style={{ marginBottom: 4 }}>
                      <button
                        onClick={() => setExpandedWeek(isExpanded ? null : wNum)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 14px', borderRadius: 12, border: `1px solid ${c.line}`,
                          background: c.white, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600, color: c.charcoal, minWidth: 56 }}>
                          Week {wNum}
                        </span>
                        <span style={{ fontSize: 12, color: c.muted, flex: 1, textAlign: 'left' }}>
                          {wk.phase || ''}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                          background: st.background, color: st.color,
                        }}>
                          {st.label}
                        </span>
                      </button>

                      {/* Expanded week detail */}
                      {isExpanded && wk.sessions && (
                        <div style={{
                          margin: '4px 0 8px', padding: '12px 14px', borderRadius: 12,
                          background: c.paper, border: `1px solid ${c.line}`,
                        }}>
                          {isDeloadWk && (
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#7040A0', background: '#ede4f7', borderRadius: 8, padding: '6px 10px', marginBottom: 10, lineHeight: 1.4 }}>
                              🌙 Deload week — fewer sets and ~10% lighter loads. Recover and let your body adapt.
                            </div>
                          )}
                          {(Array.isArray(wk.sessions) ? wk.sessions : Object.entries(wk.sessions).map(([k, v]) => ({ label: k, ...v }))).map((sess, si) => {
                            const label = sess.label || sess.name || String.fromCharCode(65 + si); // A, B, C
                            return (
                              <div key={si} style={{ marginBottom: si < (wk.sessions.length || Object.keys(wk.sessions).length) - 1 ? 10 : 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: c.charcoal, marginBottom: 4 }}>
                                  Session {label}
                                </div>
                                {(sess.exercises || []).map((ex, ei) => (
                                  <div key={ei} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '4px 0', fontSize: 12, color: c.charcoal,
                                    borderBottom: ei < sess.exercises.length - 1 ? `1px solid ${c.line}` : 'none',
                                  }}>
                                    <span>{ex.name || ex.exercise}</span>
                                    <span style={{ color: c.muted, fontSize: 11 }}>
                                      {setsForExercise(ex.name || ex.exercise, isDeloadWk)}x{ex.reps || '?'}{ex.weight ? ` @ ${ex.weight}` : ''}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
