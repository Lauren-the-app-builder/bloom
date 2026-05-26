import React from 'react';
import { c, BANDS } from './tokens';

export default function BandSelector({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {BANDS.map(band => {
        const isSelected = value === band.value;
        return (
          <button
            key={band.value}
            onClick={() => onChange(band.value)}
            style={{
              flex: 1, padding: '7px 4px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 10, fontWeight: 600, lineHeight: 1.3,
              textAlign: 'center', transition: 'all 0.15s ease',
              background: isSelected ? band.color : c.paper,
              color: isSelected ? c.white : c.charcoal,
              boxShadow: isSelected ? `0 2px 8px ${band.color}44` : 'none',
              outline: isSelected ? `2px solid ${band.color}` : `1px solid ${c.line}`,
              outlineOffset: isSelected ? 1 : 0,
            }}
          >
            {band.label}
          </button>
        );
      })}
    </div>
  );
}
