import React, { useState } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { c } from './tokens';
import { getActiveProgram, setsForExercise, getSessions, load } from '../../lib/storage';
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

// Phase labels for each mesocycle, used by the Journey card.
const PHASE_FOR_WEEK = (wk) => {
  if (wk <= 4) return 'Foundation';
  if (wk <= 8) return 'Build';
  return 'Peak';
};

// Single stat tile inside the Journey card. Hoisted out of the parent so it
// keeps a stable component identity across renders.
function JourneyStat({ value, label, accent }) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      padding: '6px 4px',
    }}>
      <div style={{
        fontSize: 17, fontWeight: 800, color: 'white', letterSpacing: -0.3,
        textShadow: '0 1px 6px rgba(80,40,90,0.45)',
        display: 'flex', alignItems: 'baseline', gap: 1,
      }}>
        {value}
        {accent && (
          <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, marginLeft: 1 }}>{accent}</span>
        )}
      </div>
      <div style={{
        fontSize: 9.5, fontWeight: 600, color: 'rgba(255,255,255,0.92)',
        textShadow: '0 1px 4px rgba(80,40,90,0.4)',
        letterSpacing: 0.2, textAlign: 'center', lineHeight: 1.2,
      }}>
        {label}
      </div>
    </div>
  );
}

export default function ProgramView() {
  const rawProgram = getActiveProgram();
  // The program data lives inside program_json (from Supabase schema).
  const program = rawProgram?.program_json || rawProgram || null;
  const { week: currentWeek, startDate, hasStarted } = getCurrentWeekAndMesocycle(program);
  const [expandedWeek, setExpandedWeek] = useState(null);
  const [collapsedMeso, setCollapsedMeso] = useState({});

  const unit = load('unit', 'kg');
  const sessionsLog = getSessions().filter(s => !(s.workoutName || '').includes('(past entry)'));
  // The logged session (if any) for a given program week + session label,
  // matched by "Session X" name within that week's 7-day window.
  const loggedFor = (weekNum, label) => {
    if (!startDate) return null;
    const start = startDate.getTime() + (weekNum - 1) * 7 * 86400000;
    const end = start + 7 * 86400000;
    const matches = sessionsLog.filter(s => {
      const m = /^Session\s+([A-Za-z])/.exec(s.workoutName || '');
      return m && m[1].toUpperCase() === String(label).toUpperCase()
        && Number(s.finishedAt) >= start && Number(s.finishedAt) < end;
    });
    if (!matches.length) return null;
    return matches.sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))[0];
  };
  // All logged sets for an exercise in a session (in the order performed).
  // Matches case-insensitively and trims whitespace so program/log names
  // don't need to agree exactly on capitalisation (e.g. "Straight arm
  // pulldown" vs "Straight Arm Pulldown" still resolve to the same logged
  // sets).
  const loggedSets = (loggedSession, exName) => {
    if (!loggedSession?.exercises || !exName) return null;
    const target = String(exName).toLowerCase().trim();
    for (const [name, setsArr] of Object.entries(loggedSession.exercises)) {
      if (String(name).toLowerCase().trim() === target && Array.isArray(setsArr) && setsArr.length) {
        return setsArr;
      }
    }
    return null;
  };

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

  // ----- Journey stats -----
  const totalWeeks = program.weeks.length || 12;
  // Sessions this program week vs. total scheduled for this week.
  const weekIdx = Math.min(Math.max(0, currentWeek - 1), program.weeks.length - 1);
  const currentWeekData = program.weeks[weekIdx];
  const scheduledThisWeek = currentWeekData?.sessions?.length || 0;
  const sessionsThisWeek = (() => {
    if (!startDate || !hasStarted) return 0;
    const weekStart = startDate.getTime() + (currentWeek - 1) * 7 * 86400000;
    return sessionsLog.filter(s => Number(s.finishedAt) >= weekStart).length;
  })();
  // Day streak: unique calendar days with a logged session since program start.
  const dayStreak = (() => {
    if (!startDate || !hasStarted) return 0;
    const startMs = startDate.getTime();
    const days = new Set();
    for (const s of sessionsLog) {
      const t = Number(s.finishedAt);
      if (!Number.isFinite(t) || t < startMs) continue;
      const d = new Date(t);
      days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
    return days.size;
  })();
  // Progress %: clamp to [0, 100], based on currentWeek / total.
  const progressPct = hasStarted
    ? Math.max(0, Math.min(100, Math.round((currentWeek / totalWeeks) * 100)))
    : 0;
  // Estimated finish: startDate + totalWeeks * 7 days.
  const finishDate = (() => {
    if (!startDate) return null;
    const d = new Date(startDate);
    d.setDate(d.getDate() + totalWeeks * 7);
    return d;
  })();
  const finishLabel = finishDate
    ? finishDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';
  const phaseLabel = PHASE_FOR_WEEK(currentWeek);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
      {mesocycles.map((weeks, mi) => {
        if (!weeks.length) return null;
        const isCollapsed = collapsedMeso[mi];
        const label = MESO_LABELS[mi];
        // Flower accent marks the mesocycle currently in progress.
        const isCurrentMeso = currentWeek > 0 && Math.floor((currentWeek - 1) / 4) === mi;

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
              {isCurrentMeso && (
                <img
                  src="/flower.png"
                  alt=""
                  aria-hidden="true"
                  style={{
                    height: 38, width: 'auto', marginLeft: 'auto', marginRight: -4,
                    marginTop: -10, marginBottom: -10,
                    filter: 'drop-shadow(0 2px 4px rgba(201,122,174,0.18))',
                    pointerEvents: 'none',
                  }}
                />
              )}
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
                            const logged = loggedFor(wNum, label);
                            return (
                              <div key={si} style={{ marginBottom: si < (wk.sessions.length || Object.keys(wk.sessions).length) - 1 ? 10 : 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: c.charcoal }}>Session {label}</span>
                                  {logged && (
                                    <span style={{ fontSize: 9, fontWeight: 700, color: '#2e7d4a', background: '#e6f5ea', padding: '1px 7px', borderRadius: 999 }}>✓ Done</span>
                                  )}
                                </div>
                                {(sess.exercises || []).map((ex, ei) => {
                                  const exName = ex.name || ex.exercise;
                                  const done = logged ? loggedSets(logged, exName) : null;
                                  return (
                                    <div key={ei} style={{
                                      padding: '5px 0', fontSize: 12, color: c.charcoal,
                                      borderBottom: ei < sess.exercises.length - 1 ? `1px solid ${c.line}` : 'none',
                                    }}>
                                      {done ? (
                                        <>
                                          <span>{exName}</span>
                                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                            {done.map((s, j) => (
                                              <span key={j} style={{
                                                fontSize: 10, fontWeight: 700, color: '#2e7d4a',
                                                background: '#e6f5ea', padding: '2px 7px', borderRadius: 999,
                                              }}>
                                                {s.weight}{unit} × {s.reps}
                                              </span>
                                            ))}
                                          </div>
                                        </>
                                      ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                          <span>{exName}</span>
                                          <span style={{ color: c.muted, fontSize: 11 }}>
                                            {setsForExercise(exName, isDeloadWk)}x{ex.reps || '?'}{ex.weight ? ` @ ${ex.weight}` : ''}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
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

      {/* Your Journey — sunset card with computed program stats. */}
      {hasStarted && (
        <div style={{
          marginTop: 8, marginBottom: 4,
          borderRadius: 22, overflow: 'hidden',
          position: 'relative',
          backgroundImage: 'url(/sunset.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          boxShadow: '0 12px 28px rgba(180,140,200,0.22)',
        }}>
          {/* Soft scrim so text reads against the bright sky. */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(80,50,90,0.05) 0%, rgba(80,50,90,0.28) 100%)',
            pointerEvents: 'none',
          }} />
          <div style={{ position: 'relative', padding: '18px 18px 16px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
            }}>
              <Sparkles size={11} color="white" style={{ filter: 'drop-shadow(0 1px 3px rgba(80,40,90,0.4))' }} />
              <span style={{
                fontSize: 9.5, fontWeight: 800, letterSpacing: 1.4,
                color: 'white', textTransform: 'uppercase',
                textShadow: '0 1px 4px rgba(80,40,90,0.4)',
              }}>
                Your Journey
              </span>
            </div>
            <div style={{
              fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: -0.4,
              textShadow: '0 2px 8px rgba(80,40,90,0.4)',
            }}>
              Week {currentWeek} of {totalWeeks}
            </div>
            <div style={{
              fontSize: 12, color: 'rgba(255,255,255,0.92)', marginTop: 2, fontWeight: 500,
              textShadow: '0 1px 6px rgba(80,40,90,0.4)',
            }}>
              {phaseLabel} phase · {progressPct}% complete
            </div>

            <div style={{
              display: 'flex', alignItems: 'stretch', gap: 4,
              marginTop: 14, paddingTop: 12,
              borderTop: '1px solid rgba(255,255,255,0.25)',
            }}>
              <JourneyStat
                value={sessionsThisWeek}
                accent={scheduledThisWeek ? `/${scheduledThisWeek}` : null}
                label="Sessions"
              />
              <JourneyStat value={dayStreak} label="Day streak" />
              <JourneyStat value={progressPct} accent="%" label="Progress" />
              <JourneyStat value={finishLabel} label="Est. finish" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
