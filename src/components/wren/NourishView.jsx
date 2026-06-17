// Nourish — calorie goal + weight log. Sits in the bottom nav between Today
// and Wren. Designed against the user's HTML mockup (June 17): all weights in
// lbs (independent of Bloom's kg/lb workout toggle); same-day re-log prompts
// before overwriting.

import React, { useState } from 'react';
import { Settings, Sparkles } from 'lucide-react';
import { c } from './tokens';
import {
  getCalorieGoal,
  setCalorieGoal,
  getWeightLog,
  getCurrentWeight,
  getWeeklyAvgWeight,
  getWeightChange,
  hasWeightToday,
  replaceWeightForDate,
  addWeight,
} from '../../lib/storage';

// Mockup-specific accents — pinker tones than the global tokens so this
// screen reads as its own "Nourish" surface without clashing with the rest
// of the app. Kept local to this file.
const N = {
  pageBg: '#FBF4FA',
  headerBg: '#F5E8F2',
  cardBorder: '#EDD8E8',
  tileBg: '#F9F0F7',
  darkText: '#2E1A2E',
  mutedText: '#A07898',
  hintText: '#C0A0BA',
};

export default function NourishView({ onOpenSettings }) {
  // Bump after writes to force a re-read of the store. The store itself is
  // the source of truth — we never mirror it into React state, so the read
  // helpers stay simple.
  const [bump, setBump] = useState(0);
  void bump;
  const refresh = () => setBump((b) => b + 1);

  const goal = getCalorieGoal();
  const current = getCurrentWeight();
  const weeklyAvg = getWeeklyAvgWeight();
  const log = getWeightLog();
  const dailyChange = getWeightChange('daily');
  const weeklyChange = getWeightChange('weekly');
  const monthlyChange = getWeightChange('monthly');

  // Local drafts for the two input rows.
  const [goalDraft, setGoalDraft] = useState('');
  const [weightDraft, setWeightDraft] = useState('');
  const [changeTab, setChangeTab] = useState('daily');

  const today = new Date();
  const headerDate = today.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  // Format change number with sign. null → "—".
  const fmtChange = (n) => {
    if (n === null || n === undefined) return '—';
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(1)}`;
  };

  // "today" if the latest reading is today, otherwise an actual date label.
  const currentDateLabel = (() => {
    if (!current) return '';
    const ts = new Date(current.ts);
    ts.setHours(0, 0, 0, 0);
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    if (ts.getTime() === todayMidnight.getTime()) return 'lbs · today';
    return `lbs · ${ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  })();

  const saveGoal = () => {
    const n = Number(goalDraft);
    if (!Number.isFinite(n) || n <= 0) return;
    setCalorieGoal(n);
    setGoalDraft('');
    refresh();
  };

  const logToday = () => {
    const n = Number(weightDraft);
    if (!Number.isFinite(n) || n <= 0) return;
    if (hasWeightToday()) {
      const ok = window.confirm(
        "You already logged a weight today. Replace it with this new reading?"
      );
      if (!ok) return;
      replaceWeightForDate(n);
    } else {
      addWeight(n);
    }
    setWeightDraft('');
    refresh();
  };

  // Sparkline: last 7 entries (or fewer). The mockup shows 7 dots; if she
  // has more entries we just take the most recent 7 so the visual stays
  // legible at small sizes. Returns SVG-ready normalized coordinates.
  const sparkline = (() => {
    const points = log.slice(-7);
    if (points.length < 2) return null;
    const ws = points.map((p) => p.weight);
    const min = Math.min(...ws);
    const max = Math.max(...ws);
    // Pad the y range so a flat-ish line doesn't pin against the edges.
    const span = Math.max(0.5, max - min);
    const VBW = 320; // viewBox width
    const VBH = 48;  // viewBox height
    const PAD_Y = 6;
    const stepX = points.length > 1 ? VBW / (points.length - 1) : 0;
    return points.map((p, i) => ({
      x: Math.round(i * stepX),
      // Invert so heavier = top of svg? No — heavier should be bottom.
      // Standard sparkline: higher weight = higher y in chart-space, which
      // means lower y in svg-space. Map weight → svg-y by inverting.
      y: Math.round(VBH - PAD_Y - ((p.weight - min) / span) * (VBH - PAD_Y * 2)),
      ts: p.ts,
    }));
  })();

  // Dates that bracket the sparkline.
  const sparkLeftDate = sparkline
    ? new Date(log.slice(-7)[0].ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';
  const sparkRightDate = sparkline
    ? ((d) => {
        const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
        const same = (() => { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime() === todayMidnight.getTime(); })();
        return same ? 'Today' : new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      })(log[log.length - 1].ts)
    : '';

  const cardStyle = {
    background: c.white,
    border: `0.5px solid ${N.cardBorder}`,
    borderRadius: 20,
    padding: '18px 20px',
    marginBottom: 12,
  };
  const cardLabel = {
    fontSize: 11, color: c.rosedeep, letterSpacing: 0.7,
    textTransform: 'uppercase', fontWeight: 600, margin: '0 0 10px',
  };
  const bigNumber = {
    fontSize: 38, fontWeight: 600, color: N.darkText, margin: 0, lineHeight: 1,
  };
  const bigUnit = { fontSize: 14, color: N.mutedText };
  const helperText = { fontSize: 12, color: N.hintText, margin: '4px 0 14px' };
  const divider = { border: 'none', borderTop: `0.5px solid ${N.headerBg}`, margin: '14px 0' };
  const inputStyle = {
    flex: 1, fontSize: 14, padding: '9px 12px',
    border: `0.5px solid ${N.cardBorder}`, borderRadius: 10,
    background: N.pageBg, color: N.darkText, outline: 'none', fontFamily: 'inherit',
    minWidth: 0, // so it shrinks inside the flex row
  };
  const saveBtnStyle = {
    background: c.rosedeep, color: 'white', border: 'none', borderRadius: 10,
    padding: '9px 16px', fontSize: 14, fontWeight: 500, cursor: 'pointer',
    fontFamily: 'inherit', flexShrink: 0,
  };

  return (
    <div style={{
      flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      background: N.pageBg,
    }}>
      {/* Header */}
      <div style={{ background: N.headerBg, padding: '52px 24px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 12, color: c.rosedeep, margin: '0 0 4px' }}>{headerDate}</p>
            <h1 style={{ fontSize: 26, fontWeight: 600, color: N.darkText, margin: 0 }}>Nourish</h1>
          </div>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              aria-label="Settings"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 0, marginTop: 4, color: c.rosedeep,
              }}
            >
              <Settings size={20} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '0 16px 16px' }}>
        {/* Calorie goal card — pulled up so it overlaps the header slightly,
            matching the mockup's first-card negative margin. */}
        <div style={{ ...cardStyle, marginTop: -16 }}>
          <p style={cardLabel}>Calorie goal</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
            <span style={bigNumber}>{goal > 0 ? goal.toLocaleString() : '—'}</span>
            <span style={bigUnit}>kcal / day</span>
          </div>
          <p style={helperText}>What you're aiming to eat each day</p>
          <hr style={{ ...divider, marginTop: 0 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              inputMode="numeric"
              placeholder="Update goal…"
              value={goalDraft}
              onChange={(e) => setGoalDraft(e.target.value)}
              style={inputStyle}
            />
            <button
              onClick={saveGoal}
              disabled={!goalDraft || Number(goalDraft) <= 0}
              style={{ ...saveBtnStyle, opacity: !goalDraft || Number(goalDraft) <= 0 ? 0.55 : 1 }}
            >
              Save
            </button>
          </div>
        </div>

        {/* Weight log card */}
        <div style={cardStyle}>
          <p style={cardLabel}>Weight log</p>

          {/* Current weight */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={bigNumber}>{current ? current.weight.toFixed(1) : '—'}</span>
            <span style={bigUnit}>{current ? currentDateLabel : 'lbs'}</span>
          </div>

          {/* Weekly avg */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, marginBottom: 14 }}>
            <div style={{ background: N.headerBg, borderRadius: 12, padding: '10px 14px', flex: 1 }}>
              <p style={{
                fontSize: 10, color: c.rosedeep, letterSpacing: 0.5,
                textTransform: 'uppercase', fontWeight: 600, margin: '0 0 3px',
              }}>Weekly avg</p>
              <p style={{ fontSize: 20, fontWeight: 600, color: N.darkText, margin: 0 }}>
                {weeklyAvg !== null ? weeklyAvg.toFixed(1) : '—'}{' '}
                <span style={{ fontSize: 13, fontWeight: 400, color: N.mutedText }}>lbs</span>
              </p>
            </div>
            <p style={{
              fontSize: 11, color: N.hintText, margin: 0,
              flexShrink: 0, maxWidth: 90, lineHeight: 1.4,
            }}>
              More accurate than a single weigh-in
            </p>
          </div>

          {/* Sparkline */}
          {sparkline && (
            <>
              <svg width="100%" height="48" viewBox="0 0 320 48" preserveAspectRatio="none">
                <polyline
                  points={sparkline.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none" stroke={c.rosedeep} strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                />
                {sparkline.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={i === sparkline.length - 1 ? 4 : 3.5}
                    fill={i === sparkline.length - 1 ? c.rosedeep : N.cardBorder}
                  />
                ))}
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: N.hintText }}>{sparkLeftDate}</span>
                <span style={{ fontSize: 11, color: N.hintText }}>{sparkRightDate}</span>
              </div>
            </>
          )}
          {!sparkline && (
            <p style={{
              fontSize: 12, color: N.hintText, margin: '14px 0',
              textAlign: 'center',
            }}>
              Log a few weigh-ins to see your trend.
            </p>
          )}

          {/* Change tabs */}
          <hr style={divider} />
          <p style={{
            fontSize: 11, color: c.rosedeep, letterSpacing: 0.5,
            textTransform: 'uppercase', fontWeight: 600, margin: '0 0 8px',
          }}>Change</p>
          <div style={{
            display: 'flex', gap: 6, background: N.tileBg,
            borderRadius: 12, padding: 4,
          }}>
            {[
              { id: 'daily', label: 'Daily', value: dailyChange },
              { id: 'weekly', label: 'Weekly', value: weeklyChange },
              { id: 'monthly', label: 'Monthly', value: monthlyChange },
            ].map((tab) => {
              const active = changeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setChangeTab(tab.id)}
                  style={{
                    flex: 1, textAlign: 'center', padding: '8px 4px',
                    borderRadius: 9, cursor: 'pointer', border: 'none',
                    background: active ? c.rosedeep : 'transparent',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{
                    fontSize: 10, display: 'block', marginBottom: 3,
                    color: active ? 'rgba(255,255,255,0.75)' : N.hintText,
                  }}>{tab.label}</span>
                  <span style={{
                    fontSize: 15, fontWeight: 600, display: 'block',
                    color: active ? '#fff' : N.darkText,
                  }}>{fmtChange(tab.value)}</span>
                </button>
              );
            })}
          </div>

          {/* Log input */}
          <hr style={divider} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder="Log today's weight…"
              value={weightDraft}
              onChange={(e) => setWeightDraft(e.target.value)}
              style={inputStyle}
            />
            <button
              onClick={logToday}
              disabled={!weightDraft || Number(weightDraft) <= 0}
              style={{ ...saveBtnStyle, opacity: !weightDraft || Number(weightDraft) <= 0 ? 0.55 : 1 }}
            >
              Log
            </button>
          </div>
        </div>

        {/* Wren context note */}
        <div style={{
          background: N.tileBg, borderRadius: 14, padding: '13px 16px',
          display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12,
        }}>
          <Sparkles size={16} color={c.rosedeep} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: '#7A4A70', margin: 0, lineHeight: 1.5 }}>
            Wren can see your calorie goal and weight trend to give you more personalised guidance.
          </p>
        </div>
      </div>
    </div>
  );
}
