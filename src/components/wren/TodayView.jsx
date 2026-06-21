import React, { useState } from 'react';
import { Play, Leaf, Check, Sparkles, Heart, CalendarDays, History, Settings, ChevronRight, CalendarRange, Zap } from 'lucide-react';
import { c } from './tokens';
import { getActiveProgram, getSessions, setsForExercise, setProgramSchedule, isScheduleConfirmedThisWeek, markScheduleConfirmed, isNextWeekScheduleConfirmed, markNextWeekScheduleConfirmed, isDeloadWeek, deleteSession, addWrenMessage, getCardioSessionsForWeek, addCardioSession, removeCardioSession } from '../../lib/storage';
import { computeActiveNudge, markTriggerSeen } from './wrenTriggers';
import { getCurrentWeekAndMesocycle } from './wrenHelpers';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const SESSION_COLORS = {
  A: { gradient: 'linear-gradient(160deg, #C8B4E8 0%, #F4B8D4 50%, #FFD3B8 100%)', shadow: 'rgba(200,180,232,0.35)' },
  B: { gradient: 'linear-gradient(160deg, #B4D4F0 0%, #C8B4E8 50%, #F4B8D4 100%)', shadow: 'rgba(180,212,240,0.35)' },
  C: { gradient: 'linear-gradient(160deg, #FFD3B8 0%, #F4B8D4 50%, #C8B4E8 100%)', shadow: 'rgba(244,184,212,0.35)' },
};

export default function TodayView({ onStartWorkout, onStartCardio, sessionsBump, onAskWren, onViewProgram, onOpenHistory, onOpenSettings, background = 'sunset' }) {
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
    lauren: { src: '/Lauren.png', ...SUNSET_LIKE },
  };
  const heroBg = BG_CONFIG[background] || BG_CONFIG.sunset;
  // Bumped after a manual schedule change to force a re-read of the program.
  const [scheduleBump, setScheduleBump] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState({});
  // Cardio is user-added, week-scoped, and stored separately from the
  // Wren-generated lifting program. Re-read on each scheduleBump so adds /
  // removes / mark-done events refresh the list.
  const cardioForWeek = getCardioSessionsForWeek();
  // Inline "Add a cardio session" form state inside the Edit panel.
  const [addingCardio, setAddingCardio] = useState(false);
  const [cardioNameDraft, setCardioNameDraft] = useState('');
  const [cardioDayDraft, setCardioDayDraft] = useState('');
  void scheduleBump;
  const rawProgram = getActiveProgram();
  const program = rawProgram?.program_json || rawProgram || null;
  const { week: currentWeek, hasStarted, startDate } = getCurrentWeekAndMesocycle(rawProgram);
  // Deload is opt-in — only true when Lauren has confirmed the current
  // week as a deload (via Wren). No more automatic week-4/8/12 rule.
  const isDeload = hasStarted && currentWeek > 0 && isDeloadWeek(currentWeek);

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
    // Bottom of each exercise's rep range. After a weight bump the
    // recommendation should be to start at the bottom and work up, so we
    // pass this through alongside the top target.
    const bottomTargets = {};
    const rests = {};
    const supersets = [];
    const setsConfig = {};

    for (const ex of session.exercises) {
      const repStr = String(ex.reps || '10');
      const parts = repStr.split('-');
      const topRep = parseInt(parts[parts.length - 1]) || 10;
      // For single-number rep targets ("10") the bottom equals the top.
      const bottomRep = parts.length > 1 ? (parseInt(parts[0]) || topRep) : topRep;
      targets[ex.name] = topRep;
      bottomTargets[ex.name] = bottomRep;
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
      bottomTargets,
      rests,
      supersets,
      setsConfig,
      tag: null,
      deload: isDeload,
    };
  };

  const allSessions = currentWeekData?.sessions || [];

  // Count UNIQUE session labels logged since the start of the current PROGRAM
  // week (not calendar week). Counting raw records would double-count if she
  // logged the same Session X twice, or include a non-program one-off workout
  // that doesn't have an A/B/C label — both inflated this number above what
  // the day-tiles below actually showed as done. Mirrors the doneLabels logic.
  // (sessionsBump above forces a re-render after a workout completes.)
  const sessionsThisWeek = (() => {
    if (!startDate || !hasStarted) return 0;
    const weekStart = startDate.getTime() + (currentWeek - 1) * 7 * 86400000;
    const labels = new Set();
    for (const s of getSessions()) {
      if (Number(s.finishedAt) < weekStart) continue;
      if ((s.workoutName || '').includes('(past entry)')) continue;
      const m = /^Session\s+([A-Za-z])/.exec(s.workoutName || '');
      if (m) labels.add(m[1].toUpperCase());
    }
    return labels.size;
  })();

  // Active Wren-initiated nudge, if any. We bump nudgeBump after dismiss
  // to recompute (the underlying triggers respect a per-key seen-set).
  const [nudgeBump, setNudgeBump] = useState(0);
  void nudgeBump;
  const activeNudge = (() => {
    if (!program) return null;
    return computeActiveNudge({
      program: rawProgram,
      sessions: getSessions(),
      myWorkouts: [],
      missedSessions: [],
    });
  })();

  // Which cardio names have been logged for this calendar week. Cardio
  // sessions write a session record with workoutName "Cardio: <name>" so
  // we can match by name → done. Keyed by lowercase name for tolerance.
  const doneCardioNames = (() => {
    const set = new Set();
    const now = new Date();
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - dow);
    const ws = weekStart.getTime();
    for (const s of getSessions()) {
      if (Number(s.finishedAt) < ws) continue;
      const m = /^Cardio:\s*(.+)$/i.exec(s.workoutName || '');
      if (m) set.add(m[1].trim().toLowerCase());
    }
    return set;
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
  // Which session labels had a 20-min HIIT finisher attached this week,
  // so the row can render a ⚡ next to its done check.
  const hiitLabels = (() => {
    const set = new Set();
    if (!startDate || !hasStarted) return set;
    const weekStart = startDate.getTime() + (currentWeek - 1) * 7 * 86400000;
    for (const s of getSessions()) {
      if (Number(s.finishedAt) < weekStart) continue;
      if ((s.workoutName || '').includes('(past entry)')) continue;
      if (!s.hiitFinisher) continue;
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
          sunset is visible above it. Lauren mode hides this whole block
          (the title moves inside the New Week card instead) and uses
          a deeper bottom pad so the card clears Lauren's head. */}
      {background !== 'lauren' && (
      <div style={{ padding: '6px 6px 175px', textAlign: 'left' }}>
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
      )}
      {/* Lauren mode: empty spacer that mirrors the title block's bottom
          padding so the New Week card sits below Lauren's head, not
          across it. */}
      {background === 'lauren' && <div style={{ height: 220 }} />}

      {/* Wren-initiated nudge — shown when a trigger fires (Sunday with no
          next-week plan, week short, plateau, drained run). Tapping
          posts Wren's message into the chat and jumps to the coach tab;
          dismissing marks the key seen so it won't keep re-appearing. */}
      {activeNudge && (
        <div style={{
          borderRadius: 22, padding: 16, marginBottom: 4,
          background: `linear-gradient(135deg, ${c.rosedeep} 0%, ${c.rose} 100%)`,
          color: 'white', position: 'relative',
          boxShadow: '0 8px 24px rgba(201,122,174,0.30)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Sparkles size={14} color="white" />
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: 1.2,
              textTransform: 'uppercase', opacity: 0.95,
              textShadow: '0 1px 4px rgba(80,40,90,0.3)',
            }}>
              Wren says
            </span>
          </div>
          <div style={{
            fontSize: 14, fontWeight: 700, marginBottom: 4,
            textShadow: '0 1px 4px rgba(80,40,90,0.25)',
          }}>
            {activeNudge.title}
          </div>
          <div style={{
            fontSize: 12, lineHeight: 1.5, opacity: 0.95,
            textShadow: '0 1px 3px rgba(80,40,90,0.25)',
            marginBottom: 12,
          }}>
            {activeNudge.message}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                // Post Wren's message into the chat as an assistant turn,
                // mark this trigger seen so it doesn't re-fire, then jump
                // to the coach tab.
                addWrenMessage({ role: 'assistant', content: activeNudge.message, proactive: true });
                markTriggerSeen(activeNudge.key);
                setNudgeBump(b => b + 1);
                if (onViewProgram) {
                  // We don't have a direct onOpenChat callback; reuse the
                  // ask-Wren path which the parent already wires to the
                  // coach tab in chat mode.
                  onAskWren && onAskWren();
                } else if (onAskWren) {
                  onAskWren();
                }
              }}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 999, border: 'none', cursor: 'pointer',
                background: 'white', color: c.rosedeep,
                fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
              }}
            >
              Open chat
            </button>
            <button
              onClick={() => {
                markTriggerSeen(activeNudge.key);
                setNudgeBump(b => b + 1);
              }}
              style={{
                padding: '9px 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.6)',
                background: 'transparent', color: 'white', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              }}
            >
              Not now
            </button>
          </div>
        </div>
      )}

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
            // Sunset keeps the original soft white outline; Lauren drops it
            // so the pink gradient banner blends straight into the card edge.
            border: background === 'lauren' ? 'none' : '1px solid rgba(255,255,255,0.7)',
            boxShadow: '0 12px 32px rgba(180,140,200,0.18)',
            // Clip the gradient banner cleanly to the rounded top corners
            // (only needed in Lauren mode where the banner spans card edge
            // to card edge via negative margins).
            overflow: background === 'lauren' ? 'hidden' : 'visible',
          }}>
            {/* Lauren mode: Bloom + date headline banner inside the top
                of the card — pink→purple gradient, white text, no
                divider. Negative margins extend it to the card edges
                and the top corners match the card's 28px radius so it
                reads as the card's own header. */}
            {background === 'lauren' && (
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 8,
                margin: '-18px -18px 14px',
                padding: '14px 18px',
                background: `linear-gradient(135deg, ${c.rosedeep} 0%, ${c.rose} 100%)`,
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
              }}>
                <h1 style={{
                  fontSize: 22, margin: 0, fontWeight: 800, letterSpacing: -0.6,
                  color: 'white',
                  textShadow: '0 1px 4px rgba(80,40,90,0.25)',
                }}>
                  Bloom
                </h1>
                <Heart
                  size={11}
                  style={{ color: 'white', filter: 'drop-shadow(0 1px 2px rgba(80,40,90,0.3))' }}
                  fill="white"
                />
                <span style={{
                  fontSize: 11, color: 'rgba(255,255,255,0.95)',
                  fontWeight: 500, marginLeft: 4,
                  textShadow: '0 1px 3px rgba(80,40,90,0.3)',
                }}>
                  {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  {program ? ` · Week ${currentWeek}` : ''}
                  {isDeload ? ' · Deload' : ''}
                </span>
              </div>
            )}
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
                    const hasHiit = hiitLabels.has(String(s.session_label).toUpperCase());
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
                          <div style={{ fontSize: 13, fontWeight: 600, color: c.charcoal, display: 'flex', alignItems: 'center', gap: 5 }}>
                            Session {s.session_label}
                            {/* HIIT finisher glyph — only renders when the
                                completed session record has hiitFinisher:true,
                                so the row visibly differs from a plain lift. */}
                            {hasHiit && <Zap size={11} fill="#E25A75" color="#E25A75" />}
                          </div>
                          <div style={{ fontSize: 11, color: c.muted }}>
                            {s.scheduled_day || 'unscheduled'}{hasHiit ? ' · + HIIT' : ''}
                          </div>
                        </div>
                        {done ? (
                          /* Quiet circle-check: outline ring with a slim
                             check. Tap to undo if the session was
                             accidentally logged — removes the most recent
                             matching session record from this week. */
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!startDate) return;
                              const weekStart = startDate.getTime() + (currentWeek - 1) * 7 * 86400000;
                              const weekEnd = weekStart + 7 * 86400000;
                              const matches = getSessions().filter(sess => {
                                const t = Number(sess.finishedAt);
                                if (!Number.isFinite(t)) return false;
                                if (t < weekStart || t >= weekEnd) return false;
                                if ((sess.workoutName || '').includes('(past entry)')) return false;
                                const m = /^Session\s+([A-Za-z])/.exec(sess.workoutName || '');
                                return m && m[1].toUpperCase() === String(s.session_label).toUpperCase();
                              });
                              if (!matches.length) return;
                              const ok = window.confirm(
                                matches.length === 1
                                  ? `Mark Session ${s.session_label} as not done?\n\nThis removes the Session ${s.session_label} log from this week.`
                                  : `Mark Session ${s.session_label} as not done?\n\nThis removes ${matches.length} Session ${s.session_label} logs from this week (including any with sets recorded in the Program view).`
                              );
                              if (!ok) return;
                              for (const m of matches) deleteSession(m.finishedAt);
                              setScheduleBump(b => b + 1);
                            }}
                            title="Mark as not done"
                            style={{
                              width: 22, height: 22, borderRadius: '50%',
                              border: `1.5px solid ${c.muted}`,
                              background: 'transparent',
                              padding: 0, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0, fontFamily: 'inherit',
                            }}
                          >
                            <Check size={12} color={c.muted} strokeWidth={2.5} />
                          </button>
                        ) : isToday ? (
                          <span style={{ fontSize: 10, fontWeight: 700, color: c.rosedeep, background: c.blushLight, padding: '2px 8px', borderRadius: 999 }}>Today</span>
                        ) : (
                          <Play size={12} color={c.muted} style={{ flexShrink: 0 }} />
                        )}
                      </button>
                    );
                  })}
                  {/* Cardio sessions for this week — added by Lauren (or by
                      Wren). Different badge color (cardio orange) so they
                      read as distinct from the lifting program. Tapping
                      the round circle marks done; tapping the row itself
                      doesn't start a workout (cardio has no on-screen
                      flow yet — done is just a log). */}
                  {cardioForWeek.map((cs) => {
                    const done = doneCardioNames.has(cs.name.trim().toLowerCase());
                    const isToday = cs.day && cs.day.toLowerCase() === dayName.toLowerCase();
                    return (
                      <button
                        key={cs.id}
                        onClick={() => { if (!done && onStartCardio) onStartCardio(cs); }}
                        disabled={done}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', borderRadius: 16, background: c.white,
                          border: `1px solid ${c.line}`, width: '100%',
                          textAlign: 'left', fontFamily: 'inherit',
                          cursor: done ? 'default' : 'pointer',
                        }}
                      >
                        <div style={{
                          width: 26, height: 26, borderRadius: 8, background: '#FFF0E8',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#D4844A', fontSize: 10, fontWeight: 800, flexShrink: 0,
                          opacity: done ? 0.5 : 1, letterSpacing: 0.5,
                        }}>
                          C
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13, fontWeight: 600, color: c.charcoal,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {cs.name}
                          </div>
                          <div style={{ fontSize: 11, color: c.muted }}>{cs.day} · Cardio</div>
                        </div>
                        {done ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Undo: find this week's matching cardio
                              // session record and delete it. Mirrors the
                              // lifting undo flow above.
                              const now = new Date();
                              const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
                              const wkStart = new Date(now);
                              wkStart.setHours(0, 0, 0, 0);
                              wkStart.setDate(wkStart.getDate() - dow);
                              const ws = wkStart.getTime();
                              const target = `cardio: ${cs.name.trim().toLowerCase()}`;
                              const matches = getSessions().filter((sess) => {
                                const t = Number(sess.finishedAt);
                                if (!Number.isFinite(t) || t < ws) return false;
                                return (sess.workoutName || '').trim().toLowerCase() === target;
                              });
                              if (!matches.length) return;
                              const ok = window.confirm(`Mark ${cs.name} as not done?`);
                              if (!ok) return;
                              for (const m of matches) deleteSession(m.finishedAt);
                              setScheduleBump((b) => b + 1);
                            }}
                            title="Mark as not done"
                            style={{
                              width: 22, height: 22, borderRadius: '50%',
                              border: `1.5px solid ${c.muted}`,
                              background: 'transparent', padding: 0, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0, fontFamily: 'inherit',
                            }}
                          >
                            <Check size={12} color={c.muted} strokeWidth={2.5} />
                          </button>
                        ) : isToday ? (
                          // Passive 'Today' tag — matches lifting rows. To
                          // record a cardio session Lauren has to tap the
                          // row itself (which opens CardioLog with the
                          // timer + zone + felt fields). No quick-mark.
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

                {/* Cardio block — separate from the lifting day-pickers
                    because cardio is user-added, week-scoped, and only
                    cardio rows are removable (lifting A/B/C is the
                    program and is intentionally not deletable here). */}
                <div style={{
                  marginTop: 6, paddingTop: 14, borderTop: `1px solid ${c.line}`,
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: c.charcoal }}>
                    Cardio this week
                  </div>
                  {cardioForWeek.length === 0 && !addingCardio && (
                    <div style={{ fontSize: 12, color: c.muted }}>
                      None yet. Tap below to add one.
                    </div>
                  )}
                  {cardioForWeek.map((cs) => (
                    <div
                      key={cs.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', borderRadius: 12, background: c.white,
                        border: `1px solid ${c.line}`,
                      }}
                    >
                      <div style={{
                        width: 26, height: 26, borderRadius: 8, background: '#FFF0E8',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#D4844A', fontSize: 10, fontWeight: 800, flexShrink: 0,
                        letterSpacing: 0.5,
                      }}>
                        C
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 600, color: c.charcoal,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {cs.name}
                        </div>
                        <div style={{ fontSize: 11, color: c.muted }}>{cs.day}</div>
                      </div>
                      <button
                        onClick={() => {
                          removeCardioSession(cs.id);
                          setScheduleBump((b) => b + 1);
                        }}
                        aria-label="Remove"
                        title="Remove"
                        style={{
                          width: 24, height: 24, borderRadius: '50%',
                          background: '#FDE8E8', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <span style={{ color: '#E05050', fontWeight: 700, fontSize: 13, lineHeight: 1 }}>×</span>
                      </button>
                    </div>
                  ))}

                  {!addingCardio && (
                    <button
                      onClick={() => {
                        setAddingCardio(true);
                        setCardioNameDraft('');
                        setCardioDayDraft('');
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 10px', borderRadius: 12,
                        background: c.white, border: `1px dashed ${c.line}`,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <div style={{
                        width: 22, height: 22, borderRadius: 6, background: c.blushLight,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: c.rosedeep, fontWeight: 700, fontSize: 14, lineHeight: 1,
                      }}>+</div>
                      <span style={{ fontSize: 12, color: c.rosedeep, fontWeight: 600 }}>
                        Add a cardio session
                      </span>
                    </button>
                  )}

                  {addingCardio && (
                    <div style={{
                      background: c.white, border: `1px solid ${c.line}`,
                      borderRadius: 12, padding: 12, display: 'flex',
                      flexDirection: 'column', gap: 10,
                    }}>
                      <div>
                        <div style={{
                          fontSize: 10, fontWeight: 700, color: c.rosedeep,
                          letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4,
                        }}>Session name</div>
                        <input
                          type="text"
                          autoFocus
                          placeholder="e.g. Spin class, HIIT, Run…"
                          value={cardioNameDraft}
                          onChange={(e) => setCardioNameDraft(e.target.value)}
                          style={{
                            width: '100%', fontSize: 13, padding: '8px 10px',
                            border: `1px solid ${c.line}`, borderRadius: 10,
                            background: c.cream, color: c.charcoal, outline: 'none',
                            fontFamily: 'inherit', boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <div>
                        <div style={{
                          fontSize: 10, fontWeight: 700, color: c.rosedeep,
                          letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4,
                        }}>Day</div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {WEEKDAYS.map((day) => {
                            const active = cardioDayDraft === day;
                            return (
                              <button
                                key={day}
                                onClick={() => setCardioDayDraft(day)}
                                style={{
                                  padding: '6px 9px', borderRadius: 999, cursor: 'pointer',
                                  fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                                  border: `1px solid ${active ? c.rosedeep : c.line}`,
                                  background: active ? c.rosedeep : c.white,
                                  color: active ? 'white' : c.charcoal,
                                }}
                              >
                                {day.slice(0, 3)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => {
                            const trimmed = cardioNameDraft.trim();
                            if (!trimmed || !cardioDayDraft) return;
                            addCardioSession({ name: trimmed, day: cardioDayDraft });
                            setAddingCardio(false);
                            setCardioNameDraft('');
                            setCardioDayDraft('');
                            setScheduleBump((b) => b + 1);
                          }}
                          disabled={!cardioNameDraft.trim() || !cardioDayDraft}
                          style={{
                            flex: 1, padding: '9px 0', borderRadius: 10, border: 'none',
                            cursor: cardioNameDraft.trim() && cardioDayDraft ? 'pointer' : 'default',
                            background: c.rosedeep, color: 'white',
                            fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                            opacity: cardioNameDraft.trim() && cardioDayDraft ? 1 : 0.55,
                          }}
                        >
                          Add to this week
                        </button>
                        <button
                          onClick={() => { setAddingCardio(false); setCardioNameDraft(''); setCardioDayDraft(''); }}
                          style={{
                            padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
                            background: c.white, color: c.muted, fontSize: 13, fontWeight: 700,
                            fontFamily: 'inherit', border: `1px solid ${c.line}`,
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

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
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2e7d4a', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            Session {todaySession.session_label} complete — rest up
            {/* If today's session also had a HIIT finisher, surface that
                in the done banner so Lauren remembers she did it. */}
            {hiitLabels.has(String(todaySession.session_label).toUpperCase()) && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#E25A75' }}>
                · <Zap size={11} fill="#E25A75" color="#E25A75" /> HIIT
              </span>
            )}
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
