import React, { useState } from 'react';
import { Sparkles, Pencil, Check, X, Plus, Trash2 } from 'lucide-react';
import { c } from './tokens';
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
        fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', textAlign,
      }}
    />
  );
}

// One exercise row: name (tap to rename), reps, sets, rest — each commits
// on blur/Enter. Name/reps/sets go through editProgramSession (they're part
// of the program's own structure); rest is a standalone override (see
// getRestOverride/setRestOverride in storage.js), same idea as sets but
// with no "canonical" pattern to fall back to, so it's blank until set.
function ExerciseRow({ programId, sessionLabel, exercise, onChanged }) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(exercise.name);
  const [reps, setReps] = useState(exercise.reps || '');
  const [sets, setSets] = useState(String(setsForExercise(exercise.name, false)));
  const [rest, setRest] = useState(String(getRestOverride(exercise.name) || ''));

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
  const remove = () => {
    editProgramSession({ session_label: sessionLabel, remove_exercise: exercise.name }, programId);
    onChanged();
  };

  return (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${c.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {editingName ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            style={{ flex: 1, fontSize: 13, fontWeight: 700, padding: '6px 8px', borderRadius: 8, border: `1px solid ${c.line}`, fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: c.charcoal, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exercise.name}</span>
            <Pencil size={10} color={c.muted} style={{ flexShrink: 0 }} />
          </button>
        )}
        <button
          onClick={remove}
          style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: c.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
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
  );
}

function AddExerciseRow({ programId, sessionLabel, onAdded }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [reps, setReps] = useState('10');

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          marginTop: 10, display: 'flex', alignItems: 'center', gap: 5,
          background: 'none', border: `1px dashed ${c.line}`, borderRadius: 10,
          padding: '8px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
          color: c.muted, fontFamily: 'inherit',
        }}
      >
        <Plus size={12} /> Add exercise
      </button>
    );
  }

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) { setOpen(false); return; }
    editProgramSession({ session_label: sessionLabel, add_exercise: trimmed, reps: reps.trim() || '10' }, programId);
    setName(''); setReps('10'); setOpen(false);
    onAdded();
  };

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Exercise name"
        style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${c.line}`, fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }}
      />
      <input
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        placeholder="reps"
        style={{ width: 56, padding: '8px 6px', borderRadius: 8, border: `1px solid ${c.line}`, fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', textAlign: 'center' }}
      />
      <button onClick={save} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: c.rosedeep, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
        <Check size={13} color="white" />
      </button>
      <button onClick={() => setOpen(false)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: c.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
        <X size={13} color={c.muted} />
      </button>
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
      <div style={{ fontSize: 12, fontWeight: 600, color: c.muted, marginBottom: 14 }}>
        {hasStarted ? `${currentWeek} week${currentWeek === 1 ? '' : 's'} of these workouts` : 'Not started yet'}
      </div>
      {sessions.map(sess => (
        <div key={sess.session_label} style={{
          marginBottom: 16, background: c.white, border: `1px solid ${c.line}`,
          borderRadius: 14, padding: '12px 14px',
        }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: c.charcoal, marginBottom: 2 }}>
            Session {sess.session_label}
          </div>
          {(sess.exercises || []).map((ex, i) => (
            <ExerciseRow
              key={`${ex.name}_${i}`}
              programId={rawProgram?.id}
              sessionLabel={sess.session_label}
              exercise={ex}
              onChanged={refresh}
            />
          ))}
          <AddExerciseRow programId={rawProgram?.id} sessionLabel={sess.session_label} onAdded={refresh} />
        </div>
      ))}
    </div>
  );
}
