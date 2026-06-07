import React, { useState } from 'react';
import { Play, Leaf, Check, Sparkles, Heart, CalendarDays, History, Settings, ChevronRight, CalendarRange } from 'lucide-react';
import { c } from './tokens';
import { getActiveProgram, getSessions, setsForExercise, setProgramSchedule, isScheduleConfirmedThisWeek, markScheduleConfirmed, isNextWeekScheduleConfirmed, markNextWeekScheduleConfirmed } from '../../lib/storage';
import { getCurrentWeekAndMesocycle } from './wrenHelpers';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Sunday'];

const SESSION_COLORS = {
  A: { gradient: 'linear-gradient(160deg, #C8B4E8 0%, #F4B8D4 50%, #FFD3B8 100%)', shadow: 'rgba(200,180,232,0.35)' },
  B: { gradient: 'linear-gradient(160deg, #B4D4F0 0%, #C8B4E8 50%, #F4B8D4 100%)', shadow: 'rgba(180,212,240,0.35)' },
  C: { gradient: 'linear-gradient(160deg, #FFD3B8 0%, #F4B8D4 50%, #C8B4E8 100%)', shadow: 'rgba(244,184,212,0.35)' },
};

export default function TodayView({ onStartWorkout, sessionsBump, onAskWren, onViewProgram, onOpenHistory, onOpenSettings, background = 'sunset' }) {
  // Per-background hero config. Sunset's values are LOCKED — that look is
  // the one the design was tuned for. Lauren shares sunset's size + mask
  // but uses a small vertical offset so her head sits below the date,
  // instead of behind it.
  const SUNSET_LIKE = {
    size: '140% auto',
    position: 'top center',
    mask: 'linear-gradient(#000 0%, #000 36%, transparent 60%)',
  };
  const BG_CONFIG = {
    sunset: { src: '/sunset.png', ...SUNSET_LIKE },
    // 'center 80px' = horizontally centered, top of image 80px below the
    // top of the hero — pushes Lauren's head clear of the "Bloom" title
    // and the date line.
    lauren: { src: '/Lauren.png', ...SUNSET_LIKE, position: 'center 80px' },
  };
  const heroBg = BG_CONFIG[background] || BG_CONFIG.sunset;
  // Bumped after a manual schedule change to force a re-read of the program.
  const [scheduleBump, setScheduleBump] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState({});
  void scheduleBump;
  const rawProgram = getActiveProgram();
  const program = rawProgram?.program_json || rawProgram || null;
  const { week: currentWeek, hasStarted, startDate } = getCurrentWeekAndMesocycle(rawProgram);
  // Compute deload directly from the week number — ignore whatever the
  // (possibly wrong) program data says. Deload weeks are 4, 8, 12.
  const isDeload = hasStarted && currentWeek > 0 && currentWeek % 4 === 0;

  // Deload weeks cut volume ~40% (≈60% of the sets, min 1) and load ~10%.
  const setsFor = (name) => setsForExercise(name, isDeload);

  const today = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });

  // Find the current week by week_number (matches how ProgramView labels weeks).
  // Falls back to array position if week_number is missing.
  let currentWeekData = null;
  if (program?.weeks?.length) {
    const byNumber = program.weeks.find((w, i) => (w.week_number || i + 1) === currentWeek);
    if (byNumber) {
      currentWeekData = byNumber;
    } else {
      const weekIdx = Math.min(Math.max(0, currentWeek - 1), program.weeks.length - 1);
      currentWeekData = program.weeks[weekIdx] || null;
    }
  }

  const todaySession = currentWeekData?.sessions?.find(s =>
    s.scheduled_day?.toLowerCase() === dayName.toLowerCase()
  ) || null;

  const todayStart = (() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
  })();

  void sessionsBump;
  const doneToday = !!todaySession && getSessions().some(s =>
    Number(s.finishedAt) >= todayStart &&
    !(s.workoutName || '').includes('(past entry)')
  );

  const buildWorkoutFromSession = (session) => {
    if (!session) return null;
    const exercises = session.exercises.map(e => e.name);
    const targets = {};
    const rests = {};
    const supersets = [];
    const setsConfig = {};

    for (const ex of session.exercises) {
      const repStr = String(ex.reps || '10');
      const topRep = parseInt(repStr.split('-').pop()) || 10;
      targets[ex.name] = topRep;
      // Always use the canonical set count for this exercise, regardless of
      // what the program JSON says. Wren's generated sets are often wrong.
      // On deload weeks this is reduced to cut volume.
      setsConfig[ex.name] = setsFor(ex.name);
      if (ex.superset_with) {
        const existing = supersets.find(g => g.includes(ex.name) || g.includes(ex.superset_with));
        if (existing) {
          if (!existing.includes(ex.name)) existing.push(ex.name);
        } else {
          supersets.push([ex.name, ex.superset_with]);
        }
      }
    }

    return {
      id: `wren_${session.session_label}_${currentWeek}`,
      name: `Session ${session.session_label}`,
      exercises,
      targets,
      rests,
      supersets,
      setsConfig,
      tag: null,
      deload: isDeload,
    };
  };

  const allSessions = currentWeekData?.sessions || [];

  // Count sessions logged since the start of the current PROGRAM week (not
  // calendar week). Before the program starts this is 0. The program is
  // week-aligned to startDate (May 25, a Monday), so program week N begins at
  // startDate + (N-1) * 7 days.
  // (sessionsBump above forces a re-render after a workout completes.)
  const sessionsThisWeek = (() => {
    if (!startDate || !hasStarted) return 0;
    const weekStart = startDate.getTime() + (currentWeek - 1) * 7 * 86400000;
    return getSessions().filter(s =>
      Number(s.finishedAt) >= weekStart &&
      !(s.workoutName || '').includes('(past entry)')
    ).length;
  })();

  // Which session labels (A/B/C) have been completed this program week.
  const doneLabels = (() => {
    const set = new Set();
    if (!startDate || !hasStarted) return set;
    const weekStart = startDate.getTime() + (currentWeek - 1) * 7 * 86400000;
    for (const s of getSessions()) {
      if (Number(s.finishedAt) < weekStart) continue;
      if ((s.workoutName || '').includes('(past entry)')) continue;
      const m = /^Session\s+([A-Za-z])/.exec(s.workoutName || '');
      if (m) set.add(m[1].toUpperCase());
    }
    return set;
  })();

  return (
    <div style={{
      flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      position: 'relative',
      // Page background — purple-pink vertical gradient that picks up where
      // the sunset's flowers fade and continues down the page. Designed so
      // the bottom edge of the hero blends into it with no visible seam.
      background: 'linear-gradient(180deg, #E5C8D9 0%, #DCB8CE 22%, #D0A8C5 42%, #C9A4C5 58%, #D8B7CF 75%, #ECCFD8 90%, #F8E8E2 100%)',
    }}>
      {/* Sunset hero — scaled up so the image fills more vertical space
          and extends well past the New Week card on the sides. The mask
          reaches full transparency right at the image's bottom edge, so
          the image dissolves into the purple page gradient without a
          hard seam. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 720,
          backgroundImage: `url(${heroBg.src})`,
          backgroundSize: heroBg.size,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: heroBg.position,
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          // Softer pastel feel.
          filter: 'saturate(0.78) brightness(1.05)',
          // Mask comes from BG_CONFIG so each background can tune its own
          // fade. Sunset's mask is identical to the previous value.
          maskImage: heroBg.mask,
          WebkitMaskImage: heroBg.mask,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Floating top-right action buttons — sit on the hero */}
      <div style={{
        position: 'absolute', top: 16, right: 16,
        display: 'flex', gap: 8, zIndex: 3,
      }}>
        {onOpenHistory && (
          <button
            onClick={onOpenHistory}
            title="Workout history"
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(255,255,255,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              boxShadow: '0 2px 10px rgba(120,80,140,0.18)',
            }}
          >
            <History size={14} color={c.charcoal} />
          </button>
        )}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(255,255,255,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              boxShadow: '0 2px 10px rgba(120,80,140,0.18)',
            }}
          >
            <Settings size={14} color={c.charcoal} />
          </button>
        )}
      </div>

    <div style={{
      padding: '22px 16px calc(40px + env(safe-area-inset-bottom)) 16px',
      display: 'flex', flexDirection: 'column', gap: 14,
      position: 'relative', zIndex: 1,
    }}>
      {/* Title sits over the lightest part of the sunset. The large
          bottom padding pushes the New Week card down so more of the
          sunset is visible above it. */}
      <div style={{ padding: '6px 6px 175px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <h1 style={{
            fontSize: 32, margin: 0, fontWeight: 800, letterSpacing: -0.8,
            color: c.charcoal,
          }}>
            Bloom
          </h1>
          <Heart size={13} style={{ color: c.rosedeep }} fill={c.rosedeep} />
        </div>
        <div style={{
          fontSize: 13, color: c.charcoal, marginTop: 4, fontWeight: 500, opacity: 0.78,
        }}>
          {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          {program ? ` · Week ${currentWeek}` : ''}
          {isDeload ? ' · Deload' : ''}
        </div>
      </div>

      {/* This week's schedule — always visible, editable, marks done sessions.
          Once all of this week's sessions are logged (and next week isn't
          already planned), this same card morphs into a 'Plan next week'
          mode: the title, edit button, and save action all switch over,
          so Lauren never sees a separate prompt. */}
      {hasStarted && allSessions.length > 0 && (() => {
        const confirmed = isScheduleConfirmedThisWeek();
        const allDone = sessionsThisWeek >= allSessions.length;
        const planningNext = allDone && !isNextWeekScheduleConfirmed();
        return (
          <div style={{
            borderRadius: 28, padding: 18,
            // Translucent white card sitting on the sunset — lets a hint of
            // the image bleed through but keeps text fully legible.
            background: 'rgba(255,255,255,0.86)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.7)',
            boxShadow: '0 12px 32px rgba(180,140,200,0.18)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%', background: c.white,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <CalendarDays size={17} color={c.rosedeep} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.charcoal }}>
                  {planningNext
                    ? `Week ${currentWeek} complete 🎉`
                    : confirmed ? 'This week' : 'New week, Lauren! 🌱'}
                </div>
                <div style={{ fontSize: 12, color: c.muted, marginTop: 2, lineHeight: 1.45 }}>
                  {planningNext
                    ? 'Plan your sessions for next week'
                    : confirmed ? 'Your training days' : 'Which days are you training this week?'}
                </div>
              </div>
              {!pickerOpen && (
                <button
                  onClick={() => {
                    // Prefill from the current week's days so common
                    // patterns (Mon/Wed/Fri etc) carry over.
                    const init = {};
                    for (const s of allSessions) init[s.session_label] = s.scheduled_day || '';
                    setDraft(init);
                    setPickerOpen(true);
                  }}
                  style={{
                    background: planningNext ? c.rosedeep : c.white,
                    border: planningNext ? 'none' : `1px solid ${c.line}`,
                    borderRadius: 999,
                    padding: '5px 14px', fontSize: 12, fontWeight: 700,
                    color: planningNext ? 'white' : c.rosedeep,
                    cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                  }}
                >
                  {planningNext ? 'Plan' : 'Edit'}
                </button>
              )}
            </div>

            {!pickerOpen ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {allSessions.map(s => {
                    const sc = SESSION_COLORS[s.session_label] || SESSION_COLORS.A;
                    const done = doneLabels.has(String(s.session_label).toUpperCase());
                    const isToday = s.scheduled_day && s.scheduled_day.toLowerCase() === dayName.toLowerCase();
                    return (
                      <button
                        key={s.session_label}
                        onClick={() => {
                          const w = buildWorkoutFromSession(s);
                          if (w && onStartWorkout) onStartWorkout(w);
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', borderRadius: 16, background: c.white,
                          border: `1px solid ${c.line}`, cursor: 'pointer', textAlign: 'left',
                          fontFamily: 'inherit', width: '100%',
                        }}
                      >
                        <div style={{
                          width: 26, height: 26, borderRadius: 8, background: sc.gradient,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'white', fontSize: 12, fontWeight: 800, flexShrink: 0,
                          opacity: done ? 0.5 : 1,
                        }}>
                          {s.session_label}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: c.charcoal }}>
                            Session {s.session_label}
                          </div>
                          <div style={{ fontSize: 11, color: c.muted }}>{s.scheduled_day || 'unscheduled'}</div>
                        </div>
                        {done ? (
                          /* Quiet circle-check: outline ring with a slim check. */
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%',
                            border: `1.5px solid ${c.muted}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <Check size={12} color={c.muted} strokeWidth={2.5} />
                          </div>
                        ) : isToday ? (
                          <span style={{ fontSize: 10, fontWeight: 700, color: c.rosedeep, background: c.blushLight, padding: '2px 8px', borderRadius: 999 }}>Today</span>
                        ) : (
                          <Play size={12} color={c.muted} style={{ flexShrink: 0 }} />
                        )}
                      </button>
                    );
                  })}
                </div>
                {!confirmed && (
                  <button
                    onClick={() => onAskWren && onAskWren()}
                    style={{
                      width: '100%', marginTop: 10, padding: '10px 0', borderRadius: 14, cursor: 'pointer',
                      background: c.white, color: c.rosedeep, fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                      border: `1px solid ${c.line}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <Sparkles size={13} color={c.rosedeep} />
                    Ask Wren to set them
                  </button>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {allSessions.map(s => (
                  <div key={s.session_label}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: c.charcoal, marginBottom: 5 }}>
                      Session {s.session_label}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {WEEKDAYS.map(day => {
                        const active = draft[s.session_label] === day;
                        const taken = !active && Object.entries(draft).some(([lbl, d]) => lbl !== s.session_label && d === day);
                        return (
                          <button
                            key={day}
                            onClick={() => setDraft(d => ({ ...d, [s.session_label]: day }))}
                            style={{
                              padding: '6px 9px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                              fontSize: 11, fontWeight: 700,
                              border: `1px solid ${active ? c.rosedeep : c.line}`,
                              background: active ? c.rosedeep : c.white,
                              color: active ? 'white' : taken ? c.muted : c.charcoal,
                              opacity: taken ? 0.55 : 1,
                            }}
                          >
                            {day.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  <button
                    onClick={() => {
                      const dayByLabel = {};
                      for (const [lbl, day] of Object.entries(draft)) if (day) dayByLabel[lbl] = day;
                      // In planningNext mode the save writes the days AND
                      // marks NEXT week confirmed, so the prompt won't fire
                      // again when Monday rolls over.
                      if (Object.keys(dayByLabel).length) {
                        setProgramSchedule(dayByLabel, planningNext ? { confirmFor: 'next' } : undefined);
                      } else if (planningNext) {
                        // Edge case: empty draft + planning next week — just
                        // mark next week confirmed so the card stops asking.
                        markNextWeekScheduleConfirmed();
                      } else {
                        markScheduleConfirmed();
                      }
                      setPickerOpen(false);
                      setScheduleBump(b => b + 1);
                    }}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
                      background: c.rosedeep, color: 'white', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                    }}
                  >
                    {planningNext ? 'Save next week' : 'Save days'}
                  </button>
                  <button
                    onClick={() => setPickerOpen(false)}
                    style={{
                      padding: '10px 16px', borderRadius: 12, cursor: 'pointer',
                      background: c.white, color: c.muted, fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                      border: `1px solid ${c.line}`,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Done banner — compact, only when today's session is finished */}
      {todaySession && doneToday && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', borderRadius: 14,
          background: 'linear-gradient(135deg, #e6f5ea 0%, #d4f0de 100%)',
          border: '1px solid #c3e6cd',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: '#4a8a5a',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Check size={16} color="white" strokeWidth={3} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2e7d4a' }}>
            Session {todaySession.session_label} complete — rest up
          </div>
        </div>
      )}

      {/* Hero preview card — today's session if scheduled and not done, else
          the next upcoming session in the week. Always shown when there's
          something coming up. */}
      {(() => {
        if (!program) return null;
        // Build a lookup of scheduled_day → session.
        const sessByDay = {};
        for (const s of allSessions) {
          if (s.scheduled_day) sessByDay[s.scheduled_day.toLowerCase()] = s;
        }
        // Find the next not-yet-done session in the next 7 days starting today.
        let pick = null;
        for (let offset = 0; offset < 7; offset++) {
          const d = new Date(today);
          d.setDate(today.getDate() + offset);
          const dn = d.toLocaleDateString('en-US', { weekday: 'long' });
          const s = sessByDay[dn.toLowerCase()];
          if (!s) continue;
          if (offset === 0 && doneLabels.has(String(s.session_label).toUpperCase())) continue;
          pick = { session: s, daysAhead: offset, dayName: dn };
          break;
        }
        if (!pick) return null;

        const colors = SESSION_COLORS[pick.session.session_label] || SESSION_COLORS.A;
        const headLabel = pick.daysAhead === 0
          ? `Today · ${pick.dayName}`
          : pick.daysAhead === 1
            ? `Tomorrow · ${pick.dayName}`
            : `Next · ${pick.dayName}`;
        return (
          <div style={{
            borderRadius: 32, overflow: 'hidden',
            background: colors.gradient,
            boxShadow: `0 16px 36px ${colors.shadow}`,
            color: 'white', position: 'relative',
          }}>
            <div style={{ padding: '22px 22px 14px', position: 'relative' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, opacity: 0.9, textTransform: 'uppercase', textShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
                Session {pick.session.session_label} · {headLabel}{isDeload ? ' · 🌙 Deload' : ''}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, textShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
                {pick.session.exercises.length} exercises
              </div>
            </div>

            <div style={{ padding: '0 18px 12px' }}>
              {pick.session.exercises.map((ex, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '7px 4px',
                  borderBottom: i < pick.session.exercises.length - 1 ? '1px solid rgba(255,255,255,0.12)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {ex.superset_with && (
                      <span style={{ fontSize: 8, fontWeight: 700, background: 'rgba(255,255,255,0.2)', padding: '1px 5px', borderRadius: 999, letterSpacing: 0.5 }}>SS</span>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 500, textShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>{ex.name}</span>
                  </div>
                  <span style={{ fontSize: 11, opacity: 0.8 }}>{setsFor(ex.name)}×{ex.reps || '?'}</span>
                </div>
              ))}
            </div>

            <div style={{ padding: '6px 18px 18px' }}>
              <button
                onClick={() => {
                  const w = buildWorkoutFromSession(pick.session);
                  if (w && onStartWorkout) onStartWorkout(w);
                }}
                style={{
                  width: '100%', padding: '14px 0', borderRadius: 16,
                  border: 'none', cursor: 'pointer',
                  background: `linear-gradient(135deg, ${c.blush} 0%, ${c.rosedeep} 100%)`,
                  color: 'white',
                  fontSize: 15, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 6px 16px rgba(201,122,174,0.35)',
                }}
              >
                <Play size={16} fill="white" color="white" /> {pick.daysAhead === 0 ? 'Start Workout' : 'Start this workout'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* View program — quick jump from Today into Wren's Program tab. */}
      {program && onViewProgram && (
        <button
          onClick={onViewProgram}
          style={{
            width: '100%', padding: '14px 18px', borderRadius: 18,
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 6px 20px rgba(180,140,200,0.14)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 30, height: 30, borderRadius: '50%',
              background: `linear-gradient(135deg, ${c.blush}, ${c.rose})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <CalendarRange size={15} color="white" />
            </span>
            <span style={{ textAlign: 'left' }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: c.charcoal }}>
                View program
              </span>
              <span style={{ display: 'block', fontSize: 11, color: c.muted, marginTop: 1 }}>
                Your 12-week plan
              </span>
            </span>
          </span>
          <ChevronRight size={16} color={c.muted} />
        </button>
      )}

      {/* Program not started yet */}
      {program && !hasStarted && (
        <div style={{
          borderRadius: 24, padding: 28,
          background: `linear-gradient(135deg, ${c.blushLight} 0%, white 100%)`,
          border: `1px solid ${c.line}`, textAlign: 'center',
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', background: c.blush,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
          }}>
            <Leaf size={24} color={c.rosedeep} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: c.charcoal }}>
            Program starts soon
          </div>
          <div style={{ fontSize: 12, color: c.muted, marginTop: 4 }}>
            {`Week 1 begins ${startDate ? startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'soon'}`}
          </div>
        </div>
      )}

      {/* No program */}
      {!program && (
        <div style={{
          borderRadius: 20, padding: 28, background: c.white,
          border: `1px solid ${c.line}`, textAlign: 'center',
        }}>
          <Sparkles size={22} color={c.muted} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: c.charcoal }}>No program yet</div>
          <div style={{ fontSize: 12, color: c.muted, marginTop: 4 }}>Chat with Wren to get started</div>
        </div>
      )}

      {/* Footer */}
      {program && (
        <div style={{ padding: '8px 0 20px', textAlign: 'center' }}>
          <div style={{
            background: `linear-gradient(135deg, ${c.blushLight} 0%, white 100%)`,
            borderRadius: 20, padding: '20px 16px',
            border: `1px solid ${c.line}`,
          }}>
            <Sparkles size={16} color={c.rosedeep} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: c.charcoal, lineHeight: 1.5 }}>
              {hasStarted
                ? `Week ${currentWeek}${isDeload ? ' · Deload' : ''}`
                : `Week 1 starts ${(() => {
                    if (!startDate) return 'soon';
                    const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
                    const startMid = new Date(startDate); startMid.setHours(0, 0, 0, 0);
                    const days = Math.round((startMid - todayMid) / 86400000);
                    if (days <= 0) return 'today';
                    if (days === 1) return 'tomorrow';
                    if (days < 7) return startDate.toLocaleDateString('en-US', { weekday: 'long' });
                    return startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
                  })()}`}
            </div>
            <div style={{ fontSize: 11, color: c.muted, marginTop: 8 }}>
              {allSessions.length > 0
                ? `${sessionsThisWeek} of ${allSessions.length} sessions done this week`
                : `${sessionsThisWeek} session${sessionsThisWeek === 1 ? '' : 's'} done this week`}
            </div>
            {/* Pink gradient progress bar — fills proportional to sessions done. */}
            {allSessions.length > 0 && (
              <div style={{
                marginTop: 12, height: 6, borderRadius: 999,
                background: 'rgba(180,140,200,0.18)', overflow: 'hidden',
              }}>
                <div style={{
                  width: `${Math.min(100, Math.round((sessionsThisWeek / allSessions.length) * 100))}%`,
                  height: '100%',
                  background: `linear-gradient(90deg, ${c.blush} 0%, ${c.rosedeep} 100%)`,
                  borderRadius: 999, transition: 'width 0.3s ease',
                }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
