import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Sparkles, ChevronRight } from 'lucide-react';
import { c } from './tokens';
import { getWrenMessages, addWrenMessage, resetWrenChat, getActiveProgram, saveProgram, setProgramSchedule, editProgramSession, getSessions, getMissedSessions, addMissedSession } from '../../lib/storage';

// If the gap since Lauren's last interaction with Wren exceeds this, the
// chat starts fresh on next open — Wren has no memory of the old thread,
// and the visible chat is empty (the old thread is archived, not deleted).
const WREN_SESSION_GAP_MS = 6 * 60 * 60 * 1000; // 6 hours
import { buildWrenContext } from './wrenHelpers';
import { askWren } from '../../lib/wren';

function renderContent(text) {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return i > 0 ? <div key={i} style={{ height: 6 }} /> : null;
    const isBullet = /^[-•]\s/.test(trimmed);
    const content = isBullet ? trimmed.slice(2) : trimmed;
    const parts = content.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
    if (isBullet) {
      return <div key={i} style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <span style={{ color: c.rosedeep, fontWeight: 700, flexShrink: 0 }}>·</span>
        <span>{parts}</span>
      </div>;
    }
    return <div key={i} style={{ marginTop: i > 0 ? 3 : 0 }}>{parts}</div>;
  });
}

export default function WrenChat({ schedule, myWorkouts, unit, sessionsBump, onStartWorkout, onViewProgram }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [programJustGenerated, setProgramJustGenerated] = useState(false);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const didOnboard = useRef(false);

  useEffect(() => {
    // If the last exchange was a long time ago, archive it and start fresh.
    const existing = getWrenMessages();
    if (existing.length > 0) {
      const last = existing[existing.length - 1];
      const gap = Date.now() - (Number(last.created_at) || 0);
      if (gap > WREN_SESSION_GAP_MS) {
        resetWrenChat();
        setMessages([]);
        return;
      }
    }
    setMessages(existing);
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, loading, scrollToBottom]);

  // Handle iOS keyboard
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => { scrollToBottom(); };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, [scrollToBottom]);

  // Onboarding — pre-fill with Lauren's existing session data so Wren doesn't re-ask
  useEffect(() => {
    if (didOnboard.current) return;
    const msgs = getWrenMessages();
    const program = getActiveProgram();
    if (msgs.length === 0 && !program) {
      didOnboard.current = true;
      // Build a summary of known lift data from existing sessions
      const sessions = getSessions().filter(s => !(s.workoutName || '').includes('(past entry)'));
      const liftSummary = {};
      for (const s of sessions) {
        for (const [name, sets] of Object.entries(s.exercises || {})) {
          const maxW = Math.max(...sets.map(st => Number(st.weight) || 0));
          const maxR = Math.max(...sets.map(st => Number(st.reps) || 0));
          if (!liftSummary[name] || maxW > liftSummary[name].weight) {
            liftSummary[name] = { weight: maxW, reps: maxR };
          }
        }
      }
      const liftLines = Object.entries(liftSummary)
        .filter(([, v]) => v.weight > 0)
        .map(([name, v]) => `${name}: ${v.weight}kg × ${v.reps}`)
        .join(', ');

      const context = `Lauren just opened Bloom for the first time. Greet her warmly — be friendly and human. Say hi, introduce yourself briefly (you're Wren, her coach), and ask if there's anything she wants to share before you build her program.

You already know the following from her training history (DO NOT ask about these again, but DO keep them in mind):
${liftLines ? `Current bests: ${liftLines}` : 'No previous lift data yet.'}
Goal: lean, muscular physique. Big focus on shoulders. Wants her first unassisted pull-up this year.
Structure: 3x full body per week, days flex. Hyrox on Saturdays (awareness only).
Program starts: Monday May 25th.
Exercises to AVOID: squats, Bulgarian split squats, deadlifts, lunges. Hip thrusts OK but no single-leg.
Assisted pull-ups: uses resistance bands (heavy → medium → light → none).

DO NOT generate the program yet. Just introduce yourself and ask if she has anything to add. Keep it to 2-3 sentences. Be warm.`;

      sendMessage(context, true);
    }
  }, []);

  async function sendMessage(text, isSystem = false) {
    // System messages are instructions to Wren — never saved or shown.
    if (!isSystem) {
      addWrenMessage({ role: 'user', content: text });
    }
    const updated = getWrenMessages();
    setMessages(updated);
    setInput('');
    setLoading(true);

    try {
      const sessions = getSessions();
      const program = getActiveProgram();
      const missedSessions = getMissedSessions();
      const ctx = buildWrenContext({ schedule, myWorkouts, sessions, unit, program, missedSessions });
      ctx.fullHistory = updated.map(m => ({ role: m.role, content: m.content }));
      // For system-triggered messages, send as the user message but don't save to history
      const messageToSend = isSystem ? text : text;
      const { reply, actions } = await askWren(messageToSend, ctx);

      let didGenerateProgram = false;
      if (actions?.length) {
        for (const action of actions) {
          if (action.type === 'generate_program' && action.program) {
            // Validate: must have a weeks array with at least 1 week containing sessions
            const p = action.program;
            const hasWeeks = Array.isArray(p.weeks) && p.weeks.length > 0;
            const hasExercises = hasWeeks && p.weeks.some(w =>
              Array.isArray(w.sessions) && w.sessions.some(s =>
                Array.isArray(s.exercises) && s.exercises.length > 0
              )
            );
            if (hasWeeks && hasExercises) {
              saveProgram({ program_json: p });
              didGenerateProgram = true;
            }
            // If validation fails, silently skip — don't nuke the existing program
          }
          if (action.type === 'assign_punishment' && action.description) {
            addMissedSession({
              session_type: 'punishment', punishment_assigned: true,
              punishment_description: action.description,
              session_date: new Date().toISOString().slice(0, 10),
            });
          }
          if (action.type === 'set_schedule' && Array.isArray(action.assignments)) {
            const dayByLabel = {};
            for (const a of action.assignments) {
              if (a?.session_label && a?.day) dayByLabel[String(a.session_label).trim()] = String(a.day).trim();
            }
            setProgramSchedule(dayByLabel);
          }
          if (action.type === 'edit_workout' && action.session_label) {
            editProgramSession({
              session_label: action.session_label,
              swap_from: action.swap_from,
              swap_to: action.swap_to,
              add_exercise: action.add_exercise,
              remove_exercise: action.remove_exercise,
              exercise: action.exercise,
              reps: action.reps,
            });
          }
        }
      }

      addWrenMessage({ role: 'assistant', content: reply, hasProgram: didGenerateProgram });
      setMessages(getWrenMessages());
      if (didGenerateProgram) setProgramJustGenerated(true);
    } catch {
      addWrenMessage({ role: 'assistant', content: "Couldn't respond right now. Try again." });
      setMessages(getWrenMessages());
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    sendMessage(text);
  }

  const visibleMessages = messages.filter(m => !m.isSystem);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Scrollable message area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto', minHeight: 0,
          padding: '12px 12px 8px',
          WebkitOverflowScrolling: 'touch',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Spacer pushes messages to bottom when there are few */}
        <div style={{ flex: 1 }} />

        {visibleMessages.map((msg, i) => {
          const isUser = msg.role === 'user';
          const isFirst = i === 0 || visibleMessages[i - 1]?.role !== msg.role;
          return (
            <div
              key={msg.id || i}
              style={{
                display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
                marginBottom: 4, marginTop: isFirst ? 8 : 0,
                animation: 'msgIn 0.2s ease-out',
              }}
            >
              {!isUser && isFirst && (
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${c.rosedeep}, ${c.rose})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginRight: 6, flexShrink: 0, marginTop: 2,
                  boxShadow: '0 1px 4px rgba(201,122,174,0.25)',
                }}>
                  <Sparkles size={11} color="white" />
                </div>
              )}
              {!isUser && !isFirst && <div style={{ width: 30, flexShrink: 0 }} />}
              <div style={{
                maxWidth: '82%',
                padding: isUser ? '9px 14px' : '10px 14px',
                borderRadius: 20,
                fontSize: 14, lineHeight: 1.5,
                ...(isUser
                  ? {
                      background: c.charcoal, color: 'white',
                      borderBottomRightRadius: 6,
                    }
                  : {
                      background: 'white', color: c.charcoal,
                      borderBottomLeftRadius: isFirst ? 6 : 20,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                    }
                ),
              }}>
                {isUser ? msg.content : renderContent(msg.content)}
              </div>
            </div>
          );
        })}

        {/* Program card — shows when a program exists */}
        {getActiveProgram() && (
          <div
            onClick={() => onViewProgram && onViewProgram()}
            style={{
              margin: '10px 0 4px 30px', padding: '12px 14px', borderRadius: 16,
              background: `linear-gradient(135deg, ${c.blush}, ${c.blushLight})`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              boxShadow: '0 2px 8px rgba(180,140,200,0.15)',
              cursor: 'pointer',
            }}
          >
            <div>
              <p style={{ fontSize: 10, fontWeight: 800, color: c.rosedeep, margin: 0, letterSpacing: 0.8 }}>YOUR PROGRAM</p>
              <p style={{ fontSize: 12, color: c.charcoal, margin: '2px 0 0' }}>Tap to view your 12-week plan</p>
            </div>
            <ChevronRight size={16} color={c.rosedeep} />
          </div>
        )}

        {/* Typing indicator */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 4 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: `linear-gradient(135deg, ${c.rosedeep}, ${c.rose})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              boxShadow: '0 1px 4px rgba(201,122,174,0.25)',
            }}>
              <Sparkles size={11} color="white" />
            </div>
            <div style={{
              padding: '10px 14px', borderRadius: 20, borderBottomLeftRadius: 6,
              background: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              display: 'flex', gap: 5, alignItems: 'center',
            }}>
              {[0, 1, 2].map(j => (
                <div key={j} style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: c.rose,
                  animation: `bounce 1.4s ease-in-out ${j * 0.15}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} style={{ height: 1 }} />
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px 14px',
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(240,232,238,0.5)',
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Message Wren..."
          disabled={loading}
          style={{
            flex: 1, padding: '11px 16px', borderRadius: 999,
            border: '1px solid rgba(240,232,238,0.8)',
            fontSize: 14, fontFamily: 'inherit', color: c.charcoal, outline: 'none',
            background: 'white',
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          style={{
            width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: input.trim() && !loading
              ? `linear-gradient(135deg, ${c.rosedeep}, ${c.rose})`
              : 'rgba(240,232,238,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s ease',
            boxShadow: input.trim() && !loading ? '0 2px 8px rgba(201,122,174,0.3)' : 'none',
          }}
        >
          <Send size={15} color={input.trim() && !loading ? 'white' : c.muted} style={{ marginLeft: 1 }} />
        </button>
      </form>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
        @keyframes msgIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
