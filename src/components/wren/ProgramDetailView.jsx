import React, { useState } from 'react';
import { ChevronLeft, Pencil, History, Star, Plus, X, Trash2 } from 'lucide-react';
import { c } from './tokens';
import { getProgram, setActiveProgram, renameProgram, addProgramSession } from '../../lib/storage';
import ProgramView from './ProgramView';
import ProgramChat from './ProgramChat';

// Sheet for adding a new day (session) to this program — a label plus a
// short freeform exercise list. Spans every week of the program (or seeds
// a fresh 12 weeks if this is a brand-new blank program); see
// addProgramSession in storage.js.
function AddDaySheet({ programId, existingLabels, onClose, onAdded }) {
  const nextDefault = (() => {
    for (let i = 0; i < 26; i++) {
      const L = String.fromCharCode(65 + i);
      if (!existingLabels.has(L)) return L;
    }
    return '';
  })();
  const [label, setLabel] = useState(nextDefault);
  const [exercises, setExercises] = useState([{ name: '', reps: '10' }]);

  const updateExercise = (i, patch) => {
    setExercises(list => list.map((e, idx) => idx === i ? { ...e, ...patch } : e));
  };
  const removeExercise = (i) => setExercises(list => list.filter((_, idx) => idx !== i));

  const canSave = label.trim().length > 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'rgba(40,30,45,0.45)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 430, maxHeight: '85vh',
        background: c.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 18px 12px', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: c.charcoal }}>Add a day</div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: c.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={15} color={c.charcoal} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: '4px 18px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, marginBottom: 6 }}>LABEL</div>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value.toUpperCase().slice(0, 12))}
            placeholder="D"
            style={{
              width: 72, padding: '10px 12px', borderRadius: 12, border: `1px solid ${c.line}`,
              fontSize: 14, fontWeight: 700, fontFamily: 'inherit', marginBottom: 16, boxSizing: 'border-box',
              textAlign: 'center',
            }}
          />
          <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, marginBottom: 6 }}>EXERCISES (optional — Wren can fill these in too)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            {exercises.map((ex, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  value={ex.name}
                  onChange={(e) => updateExercise(i, { name: e.target.value })}
                  placeholder="Exercise name"
                  style={{ flex: 1, padding: '9px 11px', borderRadius: 10, border: `1px solid ${c.line}`, fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
                <input
                  value={ex.reps}
                  onChange={(e) => updateExercise(i, { reps: e.target.value })}
                  placeholder="reps"
                  style={{ width: 56, padding: '9px 8px', borderRadius: 10, border: `1px solid ${c.line}`, fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', textAlign: 'center' }}
                />
                <button onClick={() => removeExercise(i)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: c.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  <Trash2 size={12} color={c.muted} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setExercises(list => [...list, { name: '', reps: '10' }])}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 10,
              border: `1px dashed ${c.line}`, background: 'none', cursor: 'pointer', fontSize: 11,
              fontWeight: 600, color: c.muted, fontFamily: 'inherit', marginBottom: 18,
            }}
          >
            <Plus size={12} /> Add exercise
          </button>
          <button
            disabled={!canSave}
            onClick={() => {
              const cleanExercises = exercises
                .filter(e => e.name.trim())
                .map(e => ({ name: e.name.trim(), reps: String(e.reps || '10').trim() }));
              addProgramSession(label, { exercises: cleanExercises }, programId);
              onAdded();
            }}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 14, border: 'none',
              background: canSave ? c.rosedeep : c.line, color: 'white', fontSize: 13, fontWeight: 700,
              cursor: canSave ? 'pointer' : 'default', fontFamily: 'inherit',
            }}
          >
            Add day
          </button>
        </div>
      </div>
    </div>
  );
}

// Every session label already used anywhere in the program, upper-cased —
// used to default AddDaySheet to the next unused letter.
function collectLabels(program) {
  const labels = new Set();
  for (const wk of program?.weeks || []) {
    const raw = wk?.sessions;
    if (!raw) continue;
    const entries = Array.isArray(raw)
      ? raw.map((s, i) => s?.session_label || s?.label || String.fromCharCode(65 + i))
      : Object.entries(raw).map(([k, s]) => s?.session_label || s?.label || k);
    for (const l of entries) if (l) labels.add(String(l).toUpperCase());
  }
  return labels;
}

export default function ProgramDetailView({ programId, initialTab = 'plan', onBack, onOpenHistory, allExercises = [], onProgramChanged }) {
  const [tab, setTab] = useState(initialTab);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [showAddDay, setShowAddDay] = useState(false);
  const [bump, setBump] = useState(0);
  void bump;
  const refresh = () => { setBump(b => b + 1); onProgramChanged && onProgramChanged(); };

  const rawProgram = getProgram(programId);
  if (!rawProgram) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 24 }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: c.charcoal, fontSize: 14, fontWeight: 500, padding: 0, marginBottom: 16 }}>
          <ChevronLeft size={18} /> Back
        </button>
        <div style={{ fontSize: 13, color: c.muted }}>Program not found.</div>
      </div>
    );
  }
  const program = rawProgram.program_json || rawProgram;

  const startRename = () => { setNameDraft(rawProgram.name || ''); setEditingName(true); };
  const saveRename = () => { renameProgram(programId, nameDraft); setEditingName(false); refresh(); };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: c.cream }}>
      <div style={{ padding: '18px 16px 10px', flexShrink: 0 }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: c.muted, fontSize: 12, fontWeight: 600, padding: 0, marginBottom: 10 }}>
          <ChevronLeft size={16} /> Programs
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {editingName ? (
            <div style={{ display: 'flex', gap: 6, flex: 1 }}>
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); }}
                placeholder="Program name"
                style={{ flex: 1, padding: '8px 12px', borderRadius: 10, border: `1px solid ${c.line}`, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
              <button onClick={saveRename} style={{ padding: '0 14px', borderRadius: 10, border: 'none', background: c.rosedeep, color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Save
              </button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 18, fontWeight: 800, color: c.charcoal, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {rawProgram.name || 'Untitled program'}
              </div>
              <button onClick={startRename} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: c.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                <Pencil size={12} color={c.muted} />
              </button>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {!rawProgram.active && (
            <button
              onClick={() => { setActiveProgram(programId); refresh(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 999,
                border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                background: `linear-gradient(135deg, ${c.rosedeep}, ${c.rose})`, color: 'white',
              }}
            >
              <Star size={12} /> Make active
            </button>
          )}
          {rawProgram.active && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 999,
              fontSize: 11, fontWeight: 700, color: c.rosedeep, background: c.blushLight,
            }}>
              <Star size={12} /> Active
            </span>
          )}
          <button
            onClick={() => onOpenHistory && onOpenHistory({ id: programId, name: rawProgram.name || 'Program' })}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 999,
              border: `1px solid ${c.line}`, background: c.white, cursor: 'pointer', fontSize: 11,
              fontWeight: 700, fontFamily: 'inherit', color: c.charcoal,
            }}
          >
            <History size={12} /> History
          </button>
          <button
            onClick={() => setShowAddDay(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 999,
              border: `1px solid ${c.line}`, background: c.white, cursor: 'pointer', fontSize: 11,
              fontWeight: 700, fontFamily: 'inherit', color: c.charcoal,
            }}
          >
            <Plus size={12} /> Add day
          </button>
        </div>

        <div style={{
          display: 'flex', background: c.paper, borderRadius: 999, padding: 2, marginTop: 14, width: 'fit-content',
        }}>
          {['plan', 'chat'].map(v => (
            <button
              key={v}
              onClick={() => setTab(v)}
              style={{
                padding: '6px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, fontFamily: 'inherit', letterSpacing: 0.3,
                background: tab === v ? 'white' : 'transparent',
                color: tab === v ? c.charcoal : c.muted,
                boxShadow: tab === v ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {v === 'plan' ? 'Plan' : 'Ask Wren'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {tab === 'plan' ? (
          <ProgramView programId={programId} allExercises={allExercises} />
        ) : (
          <ProgramChat programId={programId} onProgramChanged={refresh} />
        )}
      </div>

      {showAddDay && (
        <AddDaySheet
          programId={programId}
          existingLabels={collectLabels(program)}
          onClose={() => setShowAddDay(false)}
          onAdded={() => { setShowAddDay(false); refresh(); }}
        />
      )}
    </div>
  );
}
