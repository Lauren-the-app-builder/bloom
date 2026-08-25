import React, { useState } from 'react';
import { Sparkles, Pencil, X, Plus, Trash2, ChevronRight, Link2, Search } from 'lucide-react';
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

// Pair up exercises linked as a superset. The link is stored on just one
// side (superset_with pointing at the other's name — see editProgramSession
// in storage.js), so a pair is found whether `ex` points at its partner or
// the partner points at `ex`. Everything else is its own single-item group.
function groupExercises(exercises) {
  const partnerIndex = (i) => {
    const ex = exercises[i];
    if (ex.superset_with) {
      const j = exercises.findIndex((e, k) => k !== i && e.name === ex.superset_with);
      if (j !== -1) return j;
    }
    return exercises.findIndex((e, k) => k !== i && e.superset_with === ex.name);
  };
  const groups = [];
  const consumed = new Set();
  exercises.forEach((ex, i) => {
    if (consumed.has(i)) return;
    const j = partnerIndex(i);
    if (j !== -1 && !consumed.has(j)) {
      consumed.add(i); consumed.add(j);
      groups.push({ type: 'superset', indices: [i, j].sort((a, b) => a - b) });
    } else {
      consumed.add(i);
      groups.push({ type: 'single', indices: [i] });
    }
  });
  return groups;
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

// Search-and-pick sheet over the app's exercise library (EXERCISE_DB +
// Lauren's custom exercises — see allExercises in BloomApp.jsx). Typing
// something that isn't in the library is still fine: "Use '<text>'" adds
// it as a one-off name, same as before the library existed here.
function ExercisePickerSheet({ allExercises, initialQuery = '', title = 'Choose an exercise', onPick, onClose }) {
  const [search, setSearch] = useState(initialQuery);
  const q = search.trim().toLowerCase();
  const filtered = (q
    ? allExercises.filter(e => e.name.toLowerCase().includes(q) || (e.muscle || '').toLowerCase().includes(q))
    : allExercises
  ).slice(0, 40);
  const exactMatch = allExercises.some(e => e.name.toLowerCase() === q);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 70,
      background: 'rgba(40,30,45,0.45)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 430, maxHeight: '82vh',
        background: c.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '18px 18px 12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: c.charcoal }}>{title}</div>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: c.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={15} color={c.charcoal} />
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: 12, color: c.muted }} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the exercise library..."
              style={{ width: '100%', padding: '10px 12px 10px 32px', borderRadius: 12, border: `1px solid ${c.line}`, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 18px' }}>
          {search.trim() && !exactMatch && (
            <button
              onClick={() => onPick(search.trim())}
              style={{
                width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px', borderRadius: 12, border: `1px dashed ${c.rose}`,
                background: c.blushLight, marginBottom: 8, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <Plus size={14} color={c.rosedeep} />
              <span style={{ fontSize: 12, fontWeight: 600, color: c.rosedeep }}>Use "{search.trim()}"</span>
            </button>
          )}
          {filtered.map(ex => (
            <button
              key={ex.id || ex.name}
              onClick={() => onPick(ex.name)}
              style={{
                width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', borderRadius: 12, border: `1px solid ${c.line}`, background: c.white,
                marginBottom: 6, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: c.charcoal }}>{ex.name}</div>
                {ex.muscle && <div style={{ fontSize: 10.5, color: c.muted, marginTop: 1 }}>{ex.muscle}</div>}
              </div>
            </button>
          ))}
          {!filtered.length && !search.trim() && (
            <div style={{ fontSize: 12, color: c.muted, padding: '8px 2px' }}>No exercises in the library yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// One exercise — collapsed to a single summary row by default (name +
// "3×8-10 · 90s rest") so a full session fits without much scrolling; tap
// to expand into the editable fields. Name/reps/sets go through
// editProgramSession (they're part of the program's own structure); rest
// is a standalone override (see getRestOverride/setRestOverride in
// storage.js) — same idea as sets, but with no "canonical" pattern to fall
// back to, so it's blank until set.
function ExerciseRow({ programId, sessionLabel, exercise, allExercises, isFirst, partnerName, availablePartners, onLink, onUnlink, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [reps, setReps] = useState(exercise.reps || '');
  const [sets, setSets] = useState(String(setsForExercise(exercise.name, false)));
  const [rest, setRest] = useState(String(getRestOverride(exercise.name) || ''));

  const summary = `${sets}×${reps || '?'}${rest ? ` · ${rest}s rest` : ''}`;

  const swapTo = (newName) => {
    setPickerOpen(false);
    const trimmed = newName.trim();
    if (!trimmed || trimmed === exercise.name) return;
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
            <button
              onClick={() => setPickerOpen(true)}
              style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}
            >
              <Pencil size={10} color={c.rosedeep} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: c.rosedeep }}>Swap exercise</span>
            </button>
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

          <div style={{ marginTop: 10 }}>
            {partnerName ? (
              <button
                onClick={onUnlink}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
                  padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: c.muted, fontFamily: 'inherit',
                }}
              >
                <Link2 size={11} /> Superset with {partnerName} — Unlink
              </button>
            ) : linking ? (
              availablePartners.length ? (
                <div>
                  <FieldLabel>Superset with</FieldLabel>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {availablePartners.map(p => (
                      <button
                        key={p}
                        onClick={() => { onLink(p); setLinking(false); }}
                        style={{
                          padding: '5px 10px', borderRadius: 999, border: `1px solid ${c.line}`,
                          background: c.paper, fontSize: 11, fontWeight: 600, color: c.charcoal,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      onClick={() => setLinking(false)}
                      style={{ padding: '5px 10px', borderRadius: 999, border: 'none', background: 'none', fontSize: 11, fontWeight: 600, color: c.muted, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: c.muted }}>No other free exercises in this session to pair with.</div>
              )
            ) : (
              <button
                onClick={() => setLinking(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
                  padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: c.rosedeep, fontFamily: 'inherit',
                }}
              >
                <Link2 size={11} /> Link as superset
              </button>
            )}
          </div>
        </div>
      )}

      {pickerOpen && (
        <ExercisePickerSheet
          allExercises={allExercises}
          initialQuery={exercise.name}
          title={`Swap ${exercise.name}`}
          onPick={swapTo}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function AddExerciseSheet({ sessionLabel, allExercises, onClose, onAdded }) {
  const [name, setName] = useState('');
  const [reps, setReps] = useState('10');
  const [pickerOpen, setPickerOpen] = useState(false);
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
          <button
            onClick={() => setPickerOpen(true)}
            style={{
              flex: 1, textAlign: 'left', padding: '11px 14px', borderRadius: 12,
              border: `1px solid ${c.line}`, background: c.white, cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, boxSizing: 'border-box',
            }}
          >
            <span style={{ fontSize: 13, color: name ? c.charcoal : c.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name || 'Choose from library...'}
            </span>
            <Search size={13} color={c.muted} style={{ flexShrink: 0 }} />
          </button>
          <input
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            placeholder="reps"
            style={{ width: 70, padding: '11px 10px', borderRadius: 12, border: `1px solid ${c.line}`, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', textAlign: 'center' }}
          />
        </div>
        {pickerOpen && (
          <ExercisePickerSheet
            allExercises={allExercises}
            initialQuery={name}
            title="Choose an exercise"
            onPick={(picked) => { setName(picked); setPickerOpen(false); }}
            onClose={() => setPickerOpen(false)}
          />
        )}
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

function SessionCard({ programId, session, allExercises, onChanged }) {
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
        {(() => {
          const groups = groupExercises(exercises);
          const singleNames = groups.filter(g => g.type === 'single').map(g => exercises[g.indices[0]].name);
          return groups.map((grp, gi) => {
            if (grp.type === 'single') {
              const ex = exercises[grp.indices[0]];
              return (
                <ExerciseRow
                  key={`${ex.name}_${grp.indices[0]}`}
                  programId={programId}
                  sessionLabel={session.session_label}
                  exercise={ex}
                  allExercises={allExercises}
                  isFirst={gi === 0}
                  availablePartners={singleNames.filter(n => n !== ex.name)}
                  onLink={(partner) => {
                    editProgramSession({ session_label: session.session_label, superset_a: ex.name, superset_b: partner }, programId);
                    onChanged();
                  }}
                  onChanged={onChanged}
                />
              );
            }
            const [ai, bi] = grp.indices;
            const exA = exercises[ai];
            const exB = exercises[bi];
            const unlink = () => {
              editProgramSession({ session_label: session.session_label, unlink_superset: exA.name }, programId);
              onChanged();
            };
            return (
              <div key={`ss_${ai}_${bi}`} style={{
                margin: gi === 0 ? '0 0 8px' : '10px 0 8px',
                border: `1.5px solid ${c.blush}`, borderRadius: 14, padding: '0 10px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 0 0' }}>
                  <Link2 size={10} color={c.rosedeep} />
                  <span style={{ fontSize: 9, fontWeight: 800, color: c.rosedeep, letterSpacing: 0.6 }}>SUPERSET</span>
                </div>
                <ExerciseRow programId={programId} sessionLabel={session.session_label} exercise={exA} allExercises={allExercises} isFirst partnerName={exB.name} onUnlink={unlink} onChanged={onChanged} />
                <ExerciseRow programId={programId} sessionLabel={session.session_label} exercise={exB} allExercises={allExercises} isFirst partnerName={exA.name} onUnlink={unlink} onChanged={onChanged} />
              </div>
            );
          });
        })()}
      </div>

      {addOpen && (
        <AddExerciseSheet
          sessionLabel={session.session_label}
          allExercises={allExercises}
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
export default function ProgramView({ programId = null, allExercises = [] }) {
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
        <SessionCard key={sess.session_label} programId={rawProgram?.id} session={sess} allExercises={allExercises} onChanged={refresh} />
      ))}
    </div>
  );
}
