// Nourish — calorie goal + weight log. Sits in the bottom nav between Today
// and Wren. Designed against the user's HTML mockup (June 17): all weights in
// lbs (independent of Bloom's kg/lb workout toggle); same-day re-log prompts
// before overwriting.

import React, { useState } from 'react';
import { Settings, Sparkles, Pencil, X } from 'lucide-react';
import { c } from './tokens';
import {
  getCalorieGoal,
  setCalorieGoal,
  getNourishPhase,
  setNourishPhase,
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
// of the app. Kept local to this file. pageBg/headerBg are no longer used
// for actual surface fills — the sunset hero + Today's gradient handle
// that — but we leave the tokens in case future light surfaces want them.
const N = {
  pageBg: '#FBF4FA',
  headerBg: '#F5E8F2',
  cardBorder: '#EDD8E8',
  tileBg: '#F9F0F7',
  darkText: '#2E1A2E',
  mutedText: '#A07898',
  hintText: '#C0A0BA',
};

// Sunset hero config — mirrors TodayView's SUNSET_LIKE values so the two
// screens share an identical hero treatment.
const HERO = {
  src: '/sunset.png',
  size: '140% auto',
  position: 'top center',
  // Fully opaque for the top 36%, fading to transparent by 60%. Matches
  // TodayView so the sunset dissolves into the page gradient with no seam.
  mask: 'linear-gradient(#000 0%, #000 36%, transparent 60%)',
  height: 720,
};

export default function NourishView({ onOpenSettings }) {
  // Bump after writes to force a re-read of the store. The store itself is
  // the source of truth — we never mirror it into React state, so the read
  // helpers stay simple.
  const [bump, setBump] = useState(0);
  void bump;
  const refresh = () => setBump((b) => b + 1);

  const goal = getCalorieGoal();
  const phase = getNourishPhase();
  const current = getCurrentWeight();
  const weeklyAvg = getWeeklyAvgWeight();
  const log = getWeightLog();
  const dailyChange = getWeightChange('daily');
  const weeklyChange = getWeightChange('weekly');
  const monthlyChange = getWeightChange('monthly');

  // Local drafts for the two input rows. The calorie-goal input only shows
  // when editingGoal is true (tap the pencil); the weight-log input is
  // always visible because it's a daily action.
  const [goalDraft, setGoalDraft] = useState('');
  const [editingGoal, setEditingGoal] = useState(false);
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
    setEditingGoal(false);
    refresh();
  };
  // Opening the editor preloads the current goal so editing feels like
  // tweaking a number, not retyping from scratch.
  const startEditingGoal = () => {
    setGoalDraft(goal > 0 ? String(goal) : '');
    setEditingGoal(true);
  };
  const cancelEditingGoal = () => {
    setGoalDraft('');
    setEditingGoal(false);
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
      position: 'relative',
      // Page gradient picks up where the sunset's flowers fade and continues
      // down behind the cards, matching TodayView so the two screens feel
      // like siblings.
      background: 'linear-gradient(180deg, #E5C8D9 0%, #DCB8CE 22%, #D0A8C5 42%, #C9A4C5 58%, #D8B7CF 75%, #ECCFD8 90%, #F8E8E2 100%)',
    }}>
      {/* Sunset hero — same dimensions, mask, and pastel treatment as
          TodayView so Nourish sits visually next to Today. The mask makes
          the image fade out by ~60% of its height, dissolving into the
          page gradient. The header text + cards sit above it via z-index. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: HERO.height,
          backgroundImage: `url(${HERO.src})`,
          backgroundSize: HERO.size,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: HERO.position,
          filter: 'saturate(0.78) brightness(1.05)',
          maskImage: HERO.mask,
          WebkitMaskImage: HERO.mask,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Header — transparent background so the sunset shows through. Date
          + title colors are already dark/pink and sit over the bright sky
          area of the sunset; the gear button gets a translucent-white chip
          so it stays tappable wherever the sunset color lands. */}
      <div style={{ padding: '52px 24px 32px', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 12, color: c.rosedeep, margin: '0 0 4px', fontWeight: 600 }}>{headerDate}</p>
            <h1 style={{ fontSize: 26, fontWeight: 600, color: N.darkText, margin: 0 }}>Nourish</h1>
          </div>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              aria-label="Settings"
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'rgba(255,255,255,0.85)',
                border: '1px solid rgba(255,255,255,0.7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                boxShadow: '0 2px 10px rgba(120,80,140,0.18)',
              }}
            >
              <Settings size={14} color={c.charcoal} />
            </button>
          )}
        </div>
      </div>

      {/* Content — sits above the sunset via z-index so the cards' opaque
          white surfaces block the hero from showing through them, while the
          gaps between cards continue to show the gradient/sunset blend. */}
      <div style={{ padding: '0 16px 16px', position: 'relative', zIndex: 1 }}>
        {/* Calorie goal card — pulled up so it overlaps the header slightly,
            matching the mockup's first-card negative margin. Edit affordance
            is a small pencil chip in the top-right corner so the card reads
            as the goal first, the editor second. */}
        <div style={{ ...cardStyle, marginTop: -16, position: 'relative' }}>
          {!editingGoal && (
            <button
              type="button"
              onClick={startEditingGoal}
              aria-label="Edit calorie goal"
              style={{
                position: 'absolute', top: 14, right: 14,
                width: 28, height: 28, borderRadius: '50%',
                background: N.tileBg, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0,
              }}
            >
              <Pencil size={13} color={c.rosedeep} strokeWidth={2} />
            </button>
          )}
          <p style={cardLabel}>Calorie goal</p>

          {/* Phase toggle — frames how Wren reads the weight trend. Tapping
              the already-selected option clears it (so Lauren can return to
              "no phase set" without an Other choice). */}
          <div style={{
            display: 'flex', gap: 4, background: N.tileBg,
            borderRadius: 10, padding: 3, marginBottom: 14,
          }}>
            {[
              { id: 'cut', label: 'Cut' },
              { id: 'maintain', label: 'Maintain' },
            ].map((opt) => {
              const active = phase === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { setNourishPhase(active ? null : opt.id); refresh(); }}
                  style={{
                    flex: 1, padding: '6px 10px', borderRadius: 8,
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 12, fontWeight: 600,
                    background: active ? c.rosedeep : 'transparent',
                    color: active ? '#fff' : N.darkText,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
            <span style={bigNumber}>{goal > 0 ? goal.toLocaleString() : '—'}</span>
            <span style={bigUnit}>kcal / day</span>
          </div>
          <p style={{ ...helperText, marginBottom: editingGoal ? 14 : 0 }}>
            What you're aiming to eat each day
          </p>
          {editingGoal && (
            <>
              <hr style={{ ...divider, marginTop: 0 }} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Update goal…"
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') cancelEditingGoal(); }}
                  autoFocus
                  style={inputStyle}
                />
                <button
                  onClick={saveGoal}
                  disabled={!goalDraft || Number(goalDraft) <= 0}
                  style={{ ...saveBtnStyle, opacity: !goalDraft || Number(goalDraft) <= 0 ? 0.55 : 1 }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelEditingGoal}
                  aria-label="Cancel"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: 6, display: 'flex', alignItems: 'center',
                    flexShrink: 0, color: N.mutedText,
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </>
          )}
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
