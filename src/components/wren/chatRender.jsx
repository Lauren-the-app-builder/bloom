import React from 'react';
import { c } from './tokens';

// Shared message-body renderer for WrenChat and ProgramChat — turns plain
// text with markdown-lite bullets ("- "/"• ") and **bold** into JSX.
export function renderContent(text) {
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
