import React from 'react';
import { X } from 'lucide-react';
import { c, BAND_COLORS, bandHex } from './tokens';

// A band-combo picker for "bands"-loaded exercises (e.g. Assisted Pull-Ups).
//
// Lauren stacks bands, so each set's load is a list of color names with
// repeats allowed (e.g. ['green','green','blue']). Tap a color chip on the
// right to APPEND that band; tap a chip in the current-combo strip on the
// left to REMOVE it. The colors carry no implicit ranking — the parent
// (and Wren) only care about rep counts at a given combo.
export default function BandComboPicker({ value, onChange, compact = false }) {
  const combo = Array.isArray(value) ? value : [];

  const append = (name) => onChange([...combo, name]);
  const removeAt = (idx) => onChange(combo.filter((_, i) => i !== idx));

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      width: '100%',
    }}>
      {/* Current combo — tap a chip to drop it from the set */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 4,
        minHeight: compact ? 24 : 28,
        alignItems: 'center',
      }}>
        {combo.length === 0 ? (
          <span style={{ fontSize: 11, color: c.muted, fontStyle: 'italic' }}>
            No band — tap a color to add
          </span>
        ) : (
          combo.map((name, i) => (
            <button
              key={i}
              onClick={() => removeAt(i)}
              title="Remove this band"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 6px 3px 8px', borderRadius: 999, border: 'none',
                background: bandHex(name), color: 'white',
                fontSize: 10, fontWeight: 700, fontFamily: 'inherit',
                cursor: 'pointer',
                boxShadow: `0 1px 4px ${bandHex(name)}55`,
              }}
            >
              {String(name).charAt(0).toUpperCase() + String(name).slice(1)}
              <X size={9} strokeWidth={3} />
            </button>
          ))
        )}
      </div>

      {/* Palette — tap to append. Repeats allowed (tap green twice = ×2) */}
      <div style={{
        display: 'flex', gap: 4,
        // Always show all five colors in a row.
      }}>
        {BAND_COLORS.map(b => (
          <button
            key={b.name}
            onClick={() => append(b.name)}
            title={`Add ${b.name}`}
            style={{
              flex: 1, height: compact ? 22 : 26, borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.5)',
              background: b.hex,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.3), 0 1px 3px ${b.hex}55`,
              padding: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}
