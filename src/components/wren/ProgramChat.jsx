import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Sparkles, ChevronRight } from 'lucide-react';
import { c } from './tokens';
import {
  getProgramWrenMessages, addProgramWrenMessage, getProgram, updateProgramJson,
  setProgramSchedule, editProgramSession, addProgramSession, getSessions, getMissedSessions,
  addDeloadWeek, removeDeloadWeek, addInjuryWeek, removeInjuryWeek,
  addSkippedSession, removeSkippedSession, addWrenNote, getWrenNotes, removeWrenNote,
  addCardioSession,
} from '../../lib/storage';
import { buildWrenContext, getCurrentWeekAndMesocycle } from './wrenHelpers';
import { askWren } from '../../lib/wren';
import { renderContent } from './chatRender';

// Wren chat scoped to ONE program — forked from WrenChat.jsx. Every action
// this dispatches is applied with `programId` explicitly, so this thread
// can never touch a different program, active or not (see the user-facing
// decision recorded in the plan: "Wren only ever edits the program whose
// page is open"). No onboarding sequence here — that's the general Chat
// tab's job for Lauren's very first program.
export default function ProgramChat({ programId, onProgramChanged }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    setMessages(getProgramWrenMessages(programId));
  }, [programId]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, loading, scrollToBottom]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => { scrollToBottom(); };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, [scrollToBottom]);

  async function sendMessage(text) {
    addProgramWrenMessage(programId, { role: 'user', content: text });
    const updated = getProgramWrenMessages(programId);
    setMessages(updated);
    setInput('');
    setLoading(true);

    try {
      const program = getProgram(programId);
      const sessions = getSessions();
      const missedSessions = getMissedSessions();
      const ctx = buildWrenContext({ schedule: {}, myWorkouts: [], sessions, unit: 'kg', program, missedSessions, scoped: true });
      ctx.fullHistory = updated.map(m => ({ role: m.role, content: m.content }));
      const { reply, actions } = await askWren(text, ctx);

      if (actions?.length) {
        for (const action of actions) {
          if (action.type === 'generate_program' && action.program) {
            const p = action.program;
            const hasWeeks = Array.isArray(p.weeks) && p.weeks.length > 0;
            const hasExercises = hasWeeks && p.weeks.some(w =>
              Array.isArray(w.sessions) && w.sessions.some(s =>
                Array.isArray(s.exercises) && s.exercises.length > 0
              )
            );
            // Never activates — this program stays exactly as active/
            // inactive as it was. Activation is an explicit "Make active"
            // action on the program's own page.
            if (hasWeeks && hasExercises) updateProgramJson(programId, p);
          }
          if (action.type === 'set_schedule' && Array.isArray(action.assignments)) {
            const dayByLabel = {};
            for (const a of action.assignments) {
              if (a?.session_label && a?.day) dayByLabel[String(a.session_label).trim()] = String(a.day).trim();
            }
            setProgramSchedule(dayByLabel, { programId });
          }
          if (action.type === 'apply_deload' && Number.isFinite(Number(action.week_number))) {
            addDeloadWeek(Number(action.week_number), programId);
          }
          if (action.type === 'remove_deload' && Number.isFinite(Number(action.week_number))) {
            removeDeloadWeek(Number(action.week_number), programId);
          }
          if (action.type === 'mark_injured' && Number.isFinite(Number(action.week_number))) {
            addInjuryWeek(Number(action.week_number), programId);
          }
          if (action.type === 'unmark_injured' && Number.isFinite(Number(action.week_number))) {
            removeInjuryWeek(Number(action.week_number), programId);
          }
          if ((action.type === 'skip_session' || action.type === 'unskip_session') && action.session_label) {
            const wk = Number.isFinite(Number(action.week_number))
              ? Number(action.week_number)
              : (getCurrentWeekAndMesocycle(program).week || 0);
            if (wk > 0) {
              if (action.type === 'skip_session') {
                addSkippedSession(wk, action.session_label, action.reason || '', programId);
              } else {
                removeSkippedSession(wk, action.session_label, programId);
              }
            }
          }
          if (action.type === 'remember' && action.fact) {
            addWrenNote({ text: action.fact, source: 'wren' });
          }
          if (action.type === 'forget_note' && action.fact) {
            const target = (action.fact || '').trim().toLowerCase();
            const match = getWrenNotes().find(n => String(n.text || '').toLowerCase() === target);
            if (match) removeWrenNote(match.id);
          }
          if (action.type === 'add_cardio_session' && action.name && action.day) {
            addCardioSession({ name: action.name, day: action.day });
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
              sets: action.sets,
              superset_a: action.superset_a,
              superset_b: action.superset_b,
              unlink_superset: action.unlink_superset,
              order: action.order,
            }, programId);
          }
          if (action.type === 'add_day' && action.session_label) {
            addProgramSession(action.session_label, {}, programId);
          }
        }
        onProgramChanged && onProgramChanged();
      }

      addProgramWrenMessage(programId, { role: 'assistant', content: reply });
      setMessages(getProgramWrenMessages(programId));
    } catch {
      addProgramWrenMessage(programId, { role: 'assistant', content: "Couldn't respond right now. Try again." });
      setMessages(getProgramWrenMessages(programId));
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

  const showWelcome = messages.length === 0 && !loading;
  const quickPrompts = [
    'Build this from scratch',
    'Add a day',
    'Change an exercise',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#FAF7F8' }}>
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto', minHeight: 0,
          padding: '12px 12px 8px',
          WebkitOverflowScrolling: 'touch',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {showWelcome && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '24px 16px', gap: 18,
          }}>
            <Sparkles size={26} style={{ color: c.rosedeep }} />
            <div style={{ textAlign: 'center', fontSize: 14, color: c.muted, maxWidth: 260 }}>
              Ask Wren for advice on this program, or have her build/edit it.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 300 }}>
              {quickPrompts.map(p => (
                <button
                  key={p}
                  onClick={() => sendMessage(p)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 8, padding: '11px 16px', borderRadius: 999,
                    border: `1px solid ${c.line}`, background: c.white,
                    fontSize: 13, fontWeight: 500, color: c.charcoal, fontFamily: 'inherit',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span>{p}</span>
                  <ChevronRight size={14} color={c.rosedeep} />
                </button>
              ))}
            </div>
          </div>
        )}

        {!showWelcome && <div style={{ flex: 1 }} />}

        {messages.map((msg, i) => {
          const isUser = msg.role === 'user';
          const isFirst = i === 0 || messages[i - 1]?.role !== msg.role;
          return (
            <div
              key={msg.id || i}
              style={{
                display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
                marginBottom: 4, marginTop: isFirst ? 8 : 0,
              }}
            >
              {!isUser && isFirst && (
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${c.rosedeep}, ${c.rose})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginRight: 6, flexShrink: 0, marginTop: 2,
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
                  ? { background: c.charcoal, color: 'white', borderBottomRightRadius: 6 }
                  : { background: c.white, border: `1px solid ${c.line}`, color: c.charcoal, borderBottomLeftRadius: isFirst ? 6 : 20 }
                ),
              }}>
                {isUser ? msg.content : renderContent(msg.content)}
              </div>
            </div>
          );
        })}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 4 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%',
              background: `linear-gradient(135deg, ${c.rosedeep}, ${c.rose})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Sparkles size={11} color="white" />
            </div>
            <div style={{
              padding: '10px 14px', borderRadius: 20, borderBottomLeftRadius: 6,
              background: c.white, border: `1px solid ${c.line}`,
              display: 'flex', gap: 5, alignItems: 'center',
            }}>
              {[0, 1, 2].map(j => (
                <div key={j} style={{
                  width: 7, height: 7, borderRadius: '50%', background: c.rose,
                  animation: `bounce 1.4s ease-in-out ${j * 0.15}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} style={{ height: 1 }} />
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px 14px',
          background: c.white,
          borderTop: `1px solid ${c.line}`,
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Message Wren about this program..."
          disabled={loading}
          style={{
            flex: 1, padding: '11px 16px', borderRadius: 999,
            border: `1px solid ${c.line}`,
            fontSize: 14, fontFamily: 'inherit', color: c.charcoal, outline: 'none',
            background: c.paper,
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          style={{
            width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: input.trim() && !loading ? `linear-gradient(135deg, ${c.rosedeep}, ${c.rose})` : c.line,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
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
      `}</style>
    </div>
  );
}
