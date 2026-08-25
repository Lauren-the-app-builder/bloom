import React, { useState } from 'react';
import { Plus, ChevronRight, Copy, Pencil, Archive, ArchiveRestore, Sparkles, X, ListChecks } from 'lucide-react';
import { c } from './tokens';
import { getPrograms, createProgram, duplicateProgram, renameProgram, archiveProgram, unarchiveProgram } from '../../lib/storage';
import { getCurrentWeekAndMesocycle } from './wrenHelpers';
import ProgramDetailView from './ProgramDetailView';

// One line of "how this program is doing" under its name — active first via
// the badge, everyone else gets a plain week/not-started readout so the
// list itself answers "which one am I on and how far in."
function ProgramSubtitle({ program }) {
  const { week, hasStarted } = getCurrentWeekAndMesocycle(program);
  const hasDays = !!program?.program_json?.weeks?.length;
  if (!hasDays) return <span>No days yet</span>;
  if (!hasStarted) return <span>Not started yet</span>;
  return <span>{week} week{week === 1 ? '' : 's'} in</span>;
}

function ProgramRow({ program, onOpen, onDuplicate, onRename, onArchive, onUnarchive }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div style={{
      borderRadius: 14, border: `1px solid ${c.line}`, background: c.white,
      marginBottom: 8, overflow: 'hidden',
    }}>
      <button
        onClick={() => onOpen(program.id)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 14px', border: 'none', background: 'none', cursor: 'pointer',
          fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: program.active ? `linear-gradient(135deg, ${c.rosedeep}, ${c.rose})` : c.paper,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ListChecks size={15} color={program.active ? 'white' : c.muted} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: c.charcoal, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {program.name || 'Untitled program'}
            </span>
            {program.active && (
              <span style={{ fontSize: 9, fontWeight: 700, color: c.rosedeep, background: c.blushLight, padding: '1px 7px', borderRadius: 999, flexShrink: 0 }}>
                Active
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>
            <ProgramSubtitle program={program} />
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
          style={{
            width: 28, height: 28, borderRadius: '50%', border: 'none', background: c.paper,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
          }}
        >
          {menuOpen ? <X size={13} color={c.muted} /> : <ChevronRight size={15} color={c.muted} />}
        </button>
      </button>
      {menuOpen && (
        <div style={{ display: 'flex', gap: 6, padding: '0 14px 12px' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(program); setMenuOpen(false); }}
            style={rowActionStyle}
          >
            <Copy size={12} /> Duplicate
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRename(program); setMenuOpen(false); }}
            style={rowActionStyle}
          >
            <Pencil size={12} /> Rename
          </button>
          {program.archived ? (
            <button
              onClick={(e) => { e.stopPropagation(); onUnarchive(program); setMenuOpen(false); }}
              style={rowActionStyle}
            >
              <ArchiveRestore size={12} /> Unarchive
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onArchive(program); setMenuOpen(false); }}
              disabled={program.active}
              style={{ ...rowActionStyle, opacity: program.active ? 0.4 : 1, cursor: program.active ? 'default' : 'pointer' }}
              title={program.active ? "Can't archive the active program" : 'Archive'}
            >
              <Archive size={12} /> Archive
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const rowActionStyle = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  padding: '7px 0', borderRadius: 10, border: `1px solid ${c.line}`, background: c.paper,
  fontSize: 10.5, fontWeight: 600, color: c.charcoal, cursor: 'pointer', fontFamily: 'inherit',
};

// Bottom sheet for creating a program — optional name, then either a blank
// shell to fill in by hand or an inactive shell handed straight to a Wren
// chat scoped to it (see ProgramChat).
function NewProgramSheet({ onClose, onCreated }) {
  const [name, setName] = useState('');
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
          <div style={{ fontSize: 16, fontWeight: 800, color: c.charcoal }}>New program</div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: c.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={15} color={c.charcoal} />
          </button>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name it (optional)"
          style={{
            width: '100%', padding: '11px 14px', borderRadius: 12, border: `1px solid ${c.line}`,
            fontSize: 13, fontFamily: 'inherit', marginBottom: 14, boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => onCreated(createProgram({ name: name.trim() || null }).id, 'plan')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', borderRadius: 14,
              border: `1px solid ${c.line}`, background: c.white, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            }}
          >
            <ListChecks size={16} color={c.charcoal} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: c.charcoal }}>Start blank</div>
              <div style={{ fontSize: 11, color: c.muted }}>Add days and exercises yourself</div>
            </div>
          </button>
          <button
            onClick={() => onCreated(createProgram({ name: name.trim() || null }).id, 'chat')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', borderRadius: 14,
              border: 'none', background: `linear-gradient(135deg, ${c.rosedeep}, ${c.rose})`, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            }}
          >
            <Sparkles size={16} color="white" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Ask Wren</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>Describe what you want, she'll build it</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

function RenameSheet({ program, onClose, onRenamed }) {
  const [name, setName] = useState(program.name || '');
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
          <div style={{ fontSize: 16, fontWeight: 800, color: c.charcoal }}>Rename program</div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: c.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={15} color={c.charcoal} />
          </button>
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Program name"
          style={{
            width: '100%', padding: '11px 14px', borderRadius: 12, border: `1px solid ${c.line}`,
            fontSize: 13, fontFamily: 'inherit', marginBottom: 14, boxSizing: 'border-box',
          }}
        />
        <button
          onClick={() => { renameProgram(program.id, name); onRenamed(); }}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 14, border: 'none',
            background: c.rosedeep, color: 'white', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

export default function ProgramsView({ initialProgramId = null, onOpenHistory, allExercises = [] }) {
  const [selectedId, setSelectedId] = useState(initialProgramId);
  const [selectedInitialTab, setSelectedInitialTab] = useState('plan');
  const [showArchived, setShowArchived] = useState(false);
  const [showNewSheet, setShowNewSheet] = useState(false);
  const [renaming, setRenaming] = useState(null); // program object or null
  const [bump, setBump] = useState(0);
  void bump;
  const refresh = () => setBump(b => b + 1);

  if (selectedId) {
    return (
      <ProgramDetailView
        programId={selectedId}
        initialTab={selectedInitialTab}
        onBack={() => { setSelectedId(null); refresh(); }}
        onOpenHistory={onOpenHistory}
        allExercises={allExercises}
        onProgramChanged={refresh}
      />
    );
  }

  const programs = getPrograms({ includeArchived: true });
  const active = programs.filter(p => !p.archived);
  const archived = programs.filter(p => p.archived);

  const openProgram = (id, tab = 'plan') => { setSelectedInitialTab(tab); setSelectedId(id); };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: c.cream }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 16px 12px', flexShrink: 0,
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: c.charcoal }}>Programs</div>
        <button
          onClick={() => setShowNewSheet(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '8px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: c.rosedeep, color: 'white', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
          }}
        >
          <Plus size={13} /> New
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px' }}>
        {active.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '48px 24px', textAlign: 'center',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: c.line,
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            }}>
              <ListChecks size={24} color={c.muted} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: c.charcoal, marginBottom: 6 }}>No programs yet</div>
            <div style={{ fontSize: 12, color: c.muted, maxWidth: 220 }}>Start one from scratch or ask Wren to build it</div>
          </div>
        )}
        {active.map(p => (
          <ProgramRow
            key={p.id}
            program={p}
            onOpen={openProgram}
            onDuplicate={(prog) => { const dup = duplicateProgram(prog.id); refresh(); if (dup) openProgram(dup.id); }}
            onRename={(prog) => setRenaming(prog)}
            onArchive={(prog) => { archiveProgram(prog.id); refresh(); }}
            onUnarchive={(prog) => { unarchiveProgram(prog.id); refresh(); }}
          />
        ))}

        {archived.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => setShowArchived(v => !v)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 11, fontWeight: 600, color: c.muted, padding: '8px 2px',
              }}
            >
              {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
            </button>
            {showArchived && archived.map(p => (
              <ProgramRow
                key={p.id}
                program={p}
                onOpen={openProgram}
                onDuplicate={(prog) => { const dup = duplicateProgram(prog.id); refresh(); if (dup) openProgram(dup.id); }}
                onRename={(prog) => setRenaming(prog)}
                onArchive={(prog) => { archiveProgram(prog.id); refresh(); }}
                onUnarchive={(prog) => { unarchiveProgram(prog.id); refresh(); }}
              />
            ))}
          </div>
        )}
      </div>

      {showNewSheet && (
        <NewProgramSheet
          onClose={() => setShowNewSheet(false)}
          onCreated={(id, tab) => { setShowNewSheet(false); refresh(); openProgram(id, tab); }}
        />
      )}
      {renaming && (
        <RenameSheet
          program={renaming}
          onClose={() => setRenaming(null)}
          onRenamed={() => { setRenaming(null); refresh(); }}
        />
      )}
    </div>
  );
}
