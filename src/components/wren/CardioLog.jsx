// CardioLog — full-screen modal for logging a single cardio session.
//
// Opens when Lauren taps a cardio row in TodayView. A count-up timer
// starts on mount; Lauren picks a zone, a felt-mood, optionally writes a
// note, and taps Done. Done writes a session record via recordSession
// (workoutName "Cardio: <name>", durationSec from the timer, feedback +
// cardio fields) so it shows up in history and Wren's context the same
// way a lifting session does. Cancel discards.
//
// Mirrors ActiveWorkout's layout/pattern but trimmed for cardio: no sets,
// no per-exercise UI, just timer + 3 inputs + Done.

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { c } from './tokens';
import { recordSession, removeCardioSession } from '../../lib/storage';

const MOOD_OPTIONS = [
  { id: 'easy', label: 'Felt easy' },
  { id: 'solid', label: 'Solid' },
  { id: 'tough', label: 'Tough but good' },
  { id: 'drained', label: 'Drained' },
  { id: 'off', label: 'Felt off' },
];

// Heart-rate-style cardio zones. Standard 5-zone scheme — Wren can
// interpret these consistently. Sub-labels are aliases Lauren might
// recognize from a spin/run class.
const ZONE_OPTIONS = [
  { id: 'Z1', label: 'Z1', sub: 'Easy' },
  { id: 'Z2', label: 'Z2', sub: 'Aerobic' },
  { id: 'Z3', label: 'Z3', sub: 'Tempo' },
  { id: 'Z4', label: 'Z4', sub: 'Threshold' },
  { id: 'Z5', label: 'Z5', sub: 'VO2 max' },
];

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function CardioLog({ cardio, onClose }) {
  // Store the absolute start time so elapsed survives any rerender; only
  // the displayed second is in state.
  const startedAtRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const [zone, setZone] = useState(null);
  const [mood, setMood] = useState(null);
  const [notes, setNotes] = useState('');

  const handleDone = () => {
    const finishedAt = Date.now();
    const durationSec = Math.max(0, Math.floor((finishedAt - startedAtRef.current) / 1000));
    recordSession({
      workoutName: `Cardio: ${cardio.name}`,
      tag: 'cardio',
      exercises: {},
      durationSec,
      finishedAt,
      // Feedback fields match the lifting shape so recentSessionFeedback
      // includes cardio entries without any wiring change.
      feedback: (mood || notes.trim()) ? {
        mood: mood || null,
        notes: notes.trim() || null,
      } : null,
      // Cardio-specific sidecar — captures zone separately so Wren can
      // distinguish "Z2 spin class" from "Z4 HIIT" without parsing the name.
      cardio: zone ? { zone } : null,
    });
    onClose();
  };

  const handleCancel = () => {
    if (elapsed > 30 || zone || mood || notes.trim()) {
      const ok = window.confirm('Discard this cardio log? Nothing will be saved.');
      if (!ok) return;
    }
    onClose();
  };

  // Delete removes the cardio session from the week entirely — not just
  // discards the log. Use case: Lauren opens the timer and realises she's
  // not doing this class today (cancelled, weather, sick, whatever) and
  // wants it off the schedule, not just unmarked.
  const handleDelete = () => {
    const ok = window.confirm(
      `Remove ${cardio.name} from this week?\n\nThis takes it off your schedule. Use Cancel instead if you want to keep it on the list and log later.`
    );
    if (!ok) return;
    removeCardioSession(cardio.id);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: c.cream, zIndex: 100,
      overflowY: 'auto', maxWidth: 430, margin: '0 auto',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Sticky header — back chevron + name + timer, same shape as
          ActiveWorkout's header. */}
      <div style={{
        position: 'sticky', top: 0, background: c.cream,
        borderBottom: `1px solid ${c.line}`, padding: '20px 24px 16px', zIndex: 5,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <button
            onClick={handleCancel}
            style={{
              background: 'none', border: 'none', color: c.muted,
              cursor: 'pointer', padding: 0, display: 'flex',
              alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 500,
              fontFamily: 'inherit',
            }}
          >
            <ChevronLeft size={18} /> Cancel
          </button>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <button
              onClick={handleDelete}
              aria-label="Remove from this week"
              title="Remove from this week"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 6, marginTop: -2, color: c.muted, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Trash2 size={16} />
            </button>
            <div style={{ textAlign: 'right' }}>
            <p style={{
              fontSize: 10, fontWeight: 700, color: c.muted,
              letterSpacing: 0.5, margin: 0,
            }}>ELAPSED</p>
            <p style={{
              fontSize: 22, fontWeight: 700, color: c.charcoal,
              margin: '2px 0 0', fontVariantNumeric: 'tabular-nums',
            }}>{fmt(elapsed)}</p>
            </div>
          </div>
        </div>
        <h2 style={{
          fontSize: 20, fontWeight: 700, color: c.charcoal, margin: '8px 0 0',
        }}>
          {cardio.name}
        </h2>
        <p style={{ fontSize: 12, color: c.muted, margin: '2px 0 0' }}>
          {cardio.day} · Cardio
        </p>
      </div>

      {/* Body */}
      <div style={{
        flex: 1, padding: '18px 16px calc(110px + env(safe-area-inset-bottom)) 16px',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {/* Zone */}
        <div style={{
          background: c.white, border: `1px solid ${c.line}`,
          borderRadius: 16, padding: 16,
        }}>
          <p style={{
            fontSize: 11, fontWeight: 700, color: c.muted,
            letterSpacing: 0.5, margin: 0,
          }}>ZONE</p>
          <p style={{ fontSize: 11, color: c.muted, margin: '4px 0 12px', lineHeight: 1.5 }}>
            Roughly how hard it was. Optional — skip if you didn't track.
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            {ZONE_OPTIONS.map((opt) => {
              const active = zone === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setZone(active ? null : opt.id)}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 12, cursor: 'pointer',
                    fontFamily: 'inherit', border: `1px solid ${active ? c.rosedeep : c.line}`,
                    background: active ? c.rosedeep : c.white,
                  }}
                >
                  <div style={{
                    fontSize: 13, fontWeight: 700,
                    color: active ? '#fff' : c.charcoal,
                  }}>{opt.label}</div>
                  <div style={{
                    fontSize: 9, fontWeight: 600, marginTop: 2,
                    color: active ? 'rgba(255,255,255,0.85)' : c.muted,
                  }}>{opt.sub}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* How did that feel? */}
        <div style={{
          background: c.white, border: `1px solid ${c.line}`,
          borderRadius: 16, padding: 16,
        }}>
          <p style={{
            fontSize: 11, fontWeight: 700, color: c.muted,
            letterSpacing: 0.5, margin: 0,
          }}>HOW DID THAT FEEL?</p>
          <p style={{ fontSize: 11, color: c.muted, margin: '4px 0 10px', lineHeight: 1.5 }}>
            Wren will see this — helps her coach you better next time.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {MOOD_OPTIONS.map((opt) => {
              const active = mood === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setMood(active ? null : opt.id)}
                  style={{
                    padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                    border: `1px solid ${active ? c.rosedeep : c.line}`,
                    background: active ? c.rosedeep : c.white,
                    color: active ? 'white' : c.charcoal,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notes */}
        <div style={{
          background: c.white, border: `1px solid ${c.line}`,
          borderRadius: 16, padding: 16,
        }}>
          <p style={{
            fontSize: 11, fontWeight: 700, color: c.muted,
            letterSpacing: 0.5, margin: '0 0 8px',
          }}>NOTES</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything to remember? Optional."
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box', padding: 10,
              borderRadius: 10, border: `1px solid ${c.line}`, background: c.cream,
              fontSize: 13, fontFamily: 'inherit', resize: 'vertical', color: c.charcoal,
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Done button — pinned to the bottom over a translucent backdrop so
          it never scrolls off-screen during a long session. */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        maxWidth: 430, margin: '0 auto',
        padding: '14px 16px calc(20px + env(safe-area-inset-bottom)) 16px',
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: `1px solid ${c.line}`,
      }}>
        <button
          onClick={handleDone}
          style={{
            width: '100%', padding: 14, borderRadius: 14, border: 'none',
            background: c.rosedeep, color: 'white', fontSize: 15, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
