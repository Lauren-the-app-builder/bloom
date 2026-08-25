import React, { useState } from 'react';
import { Sparkles, Pencil, X, Plus, Trash2, ChevronRight } from 'lucide-react';
import { c, SESSION_COLORS } from './tokens';
import {
  getActiveProgram, getProgram, setsForExercise, getRestOverride, setRestOverride, clearRestOverride,
  editProgramSession,
} from '../../lib/storage';
import { getCurrentWeekAndMesocycle } from './wrenHelpers';

// Every session in a program's structure, read from its first week — every
// week is kept structurally identical by editProgramSession/
// addProgramSession, so week 1 IS the program as far as editing goes.
function collectSessions(program) {
  const week = program?.weeks?.[0];
  if (!week?.sessions) return [];
  return Array.isArray(week.sessions)
    ? week.sessions.map((s, i) => ({ ...s, session_label: s.session_label || s.label || String.fromCharCode(65 + i) }))
    : Object.entries(week.sessions).map(([k, s]) => ({ ...s, session_label: s.session_label || k }));
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: 9, fontWeight: 700, color: c.muted, marginBottom: 2, letterSpacing: 0.4 }}>{children}</div>;
}

function CommitInput({ value, onChange, onCommit, placeholder, width, textAlign = 'left' }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      placeholder={placeholder}
      style={{
        width, padding: '7px 9px', borderRadius: 8, border: `1px solid ${c.line}`,
        fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', textAlign, background: c.paper,
      }}
    />
  );
}

// One exercise — collapsed to a single summary row by default (name +
// "3×8-10 · 90s rest") so a full session fits without much scrolling; tap
// to expand into the editable fields. Name/reps/sets go through
// editProgramSession (they're part of the program's own structure); rest
// is a standalone override (see getRestOverride/setRestOverride in
// storage.js) — same idea as sets, but with no "canonical" pattern to fall
// back to, so it's blank until set.
function ExerciseRow({ programId, sessionLabel, exercise, isFirst, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(exercise.name);
  const [reps, setReps] = useState(exercise.reps || '');
  const [sets, setSets] = useState(String(setsForExercise(exercise.name, false)));
  const [rest, setRest] = useState(String(getRestOverride(exercise.name) || ''));

  const summary = `${sets}×${reps || '?'}${rest ? ` · ${rest}s rest` : ''}`;

  const commitName = () => {
    setEditingName(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === exercise.name) { setName(exercise.name); return; }
    editProgramSession({ session_label: sessionLabel, swap_from: exercise.name, swap_to: trimmed }, programId);
    onChanged();
  };
  const commitReps = () => {
    const trimmed = reps.trim();
    if (trimmed && trimmed !== (exercise.reps || '')) {
      editProgramSession({ session_label: sessionLabel, exercise: exercise.name, reps: trimmed }, programId);
      onChanged();
    }
  };
  const commitSets = () => {
    const n = Number(sets);
    if (Number.isFinite(n) && n > 0) {
      editProgramSession({ session_label: sessionLabel, exercise: exercise.name, sets: n }, programId);
      onChanged();
    }
  };
  const commitRest = () => {
    const trimmed = rest.trim();
    if (!trimmed) { clearRestOverride(exercise.name); onChanged(); return; }
    const n = Number(trimmed);
    if (Number.isFinite(n) && n > 0) { setRestOverride(exercise.name, n); onChanged(); }
  };
  const remove = (e) => {
    e.stopPropagation();
    editProgramSession({ session_label: sessionLabel, remove_exercise: exercise.name }, programId);
    onChanged();
  };

  return (
    <div style={{ borderTop: isFirst ? 'none' : `1px solid ${c.line}` }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 2px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.charcoal, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {exercise.name}
          </div>
          <div style={{ fontSize: 11, color: c.muted, marginTop: 1 }}>{summary}</div>
        </div>
        <ChevronRight
          size={14} color={c.muted}
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease', flexShrink: 0 }}
        />
      </button>

      {expanded && (
        <div style={{ padding: '2px 2px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            {editingName ? (
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                style={{ flex: 1, fontSize: 12, fontWeight: 700, padding: '6px 8px', borderRadius: 8, border: `1px solid ${c.line}`, fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            ) : (
              <button
                onClick={() => setEditingName(true)}
                style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}
              >
                <Pencil size={10} color={c.rosedeep} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: c.rosedeep }}>Rename</span>
              </button>
            )}
            <button
              onClick={remove}
              style={{ width: 24, height: 24, borderRadius: '50%', border: 'none', background: c.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
            >
              <Trash2 size={11} color={c.muted} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <FieldLabel>Reps</FieldLabel>
              <CommitInput value={reps} onChange={setReps} onCommit={commitReps} placeholder="8-10" width="100%" />
            </div>
            <div style={{ flex: 1 }}>
              <FieldLabel>Sets</FieldLabel>
              <CommitInput value={sets} onChange={setSets} onCommit={commitSets} placeholder="3" width="100%" textAlign="center" />
            </div>
            <div style={{ flex: 1 }}>
              <FieldLabel>Rest (s)</FieldLabel>
              <CommitInput value={rest} onChange={setRest} onCommit={commitRest} placeholder="90" width="100%" textAlign="center" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddExerciseSheet({ sessionLabel, onClose, onAdded }) {
  const [name, setName] = useState('');
  const [reps, setReps] = useState('10');
  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) { onClose(); return; }
    onAdded(trimmed, reps.trim() || '10');
  };
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'rgba(40,30,45,0.45)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 430,
        background: c.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: '18px 18px 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: c.charcoal }}>Add to Session {sessionLabel}</div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: c.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={15} color={c.charcoal} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Exercise name"
            style={{ flex: 1, padding: '11px 14px', borderRadius: 12, border: `1px solid ${c.line}`, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
          <input
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            placeholder="reps"
            style={{ width: 70, padding: '11px 10px', borderRadius: 12, border: `1px solid ${c.line}`, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', textAlign: 'center' }}
          />
        </div>
        <button
          onClick={save}
          style={{
            width: '100%', marginTop: 14, padding: '12px 0', borderRadius: 14, border: 'none',
            background: c.rosedeep, color: 'white', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function SessionCard({ programId, session, onChanged }) {
  const [addOpen, setAddOpen] = useState(false);
  const colors = SESSION_COLORS[session.session_label] || SESSION_COLORS.A;
  const exercises = session.exercises || [];

  return (
    <div style={{
      marginBottom: 14, background: c.white, borderRadius: 18,
      border: `1px solid ${c.line}`, boxShadow: '0 2px 12px rgba(120,80,140,0.06)',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 10px' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10, flexShrink: 0,
          background: colors.gradient, boxShadow: `0 3px 10px ${colors.shadow}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'white' }}>{session.session_label}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: c.charcoal }}>Session {session.session_label}</div>
          <div style={{ fontSize: 10.5, color: c.muted, marginTop: 1 }}>
            {exercises.length} exercise{exercises.length === 1 ? '' : 's'}
          </div>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          style={{
            width: 28, height: 28, borderRadius: '50%', border: 'none',
            background: c.blushLight, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          <Plus size={14} color={c.rosedeep} />
        </button>
      </div>

      <div style={{ padding: '0 14px 10px' }}>
        {exercises.length === 0 && (
          <div style={{ fontSize: 11, color: c.muted, padding: '6px 2px 10px' }}>No exercises yet — tap + to add one.</div>
        )}
        {exercises.map((ex, i) => (
          <ExerciseRow
            key={`${ex.name}_${i}`}
            programId={programId}
            sessionLabel={session.session_label}
            exercise={ex}
            isFirst={i === 0}
            onChanged={onChanged}
          />
        ))}
      </div>

      {addOpen && (
        <AddExerciseSheet
          sessionLabel={session.session_label}
          onClose={() => setAddOpen(false)}
          onAdded={(exName, reps) => {
            editProgramSession({ session_label: session.session_label, add_exercise: exName, reps }, programId);
            setAddOpen(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

// `programId` is optional — omit it to show the active program (original
// behavior); pass it to show any specific program (active or shelved), e.g.
// from ProgramDetailView. Deliberately basic: just sessions and exercises,
// each easy to edit by hand or via Wren. No mesocycles, no progress bar, no
// projected finish date, no per-week logged-set history — that's what the
// History button is for.
export default function ProgramView({ programId = null }) {
  const rawProgram = programId ? getProgram(programId) : getActiveProgram();
  const program = rawProgram?.program_json || rawProgram || null;
  const { week: currentWeek, hasStarted } = getCurrentWeekAndMesocycle(rawProgram);
  const [bump, setBump] = useState(0);
  void bump;
  const refresh = () => setBump(b => b + 1);

  const sessions = collectSessions(program);

  if (!sessions.length) {
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
          No days yet
        </div>
        <div style={{ fontSize: 12, color: c.muted, maxWidth: 220 }}>
          Add a day above, or ask Wren to build this program
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '5px 12px', borderRadius: 999, marginBottom: 14,
        background: hasStarted ? c.blushLight : c.paper,
        color: hasStarted ? c.rosedeep : c.muted,
        fontSize: 11, fontWeight: 700,
      }}>
        {hasStarted ? `${currentWeek} week${currentWeek === 1 ? '' : 's'} of these workouts` : 'Not started yet'}
      </div>
      {sessions.map(sess => (
        <SessionCard key={sess.session_label} programId={rawProgram?.id} session={sess} onChanged={refresh} />
      ))}
    </div>
  );
}
