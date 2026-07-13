// Nourish — calorie goal + weight log. Sits in the bottom nav between Today
// and Wren. Designed against the user's HTML mockup (June 17): all weights in
// lbs (independent of Bloom's kg/lb workout toggle); same-day re-log prompts
// before overwriting.

import React, { useState } from 'react';
import { Settings, Sparkles, Pencil, X, Droplet, Wine, Utensils, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { c } from './tokens';
import {
  getCalorieGoal,
  setCalorieGoal,
  getNourishPhase,
  setNourishPhase,
  getWeightLog,
  getCurrentWeight,
  getWeeklyAvgWeight,
  getWeeklyAvgSeries,
  getWeighInsByWeek,
  getWeightChange,
  hasWeightForDate,
  replaceWeightForDate,
  addWeight,
  deleteWeight,
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

  // Local drafts for the two input rows. The calorie-goal input only shows
  // when editingGoal is true (tap the pencil); the weight-log input is
  // always visible because it's a daily action.
  const [goalDraft, setGoalDraft] = useState('');
  const [editingGoal, setEditingGoal] = useState(false);
  const [weightDraft, setWeightDraft] = useState('');
  // Which date the weigh-in is for. Defaults to today, but Lauren can pick a
  // past date to backfill or correct a mis-dated entry. `type="date"` value is
  // a local YYYY-MM-DD string.
  const [logDate, setLogDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  // The trend chart + full weigh-in history live behind this — the main card
  // stays a quick glance (current + weekly avg + log), and "See historical
  // data" opens the detail view with the trend chart on top.
  const [showHistory, setShowHistory] = useState(false);
  // Context tags for today's weigh-in. They don't change the number — they
  // tell Wren why the scale might read high (water, not fat). Reset after a
  // successful log.
  const [weighInTags, setWeighInTags] = useState({ period: false, alcohol: false, restaurant: false });
  const toggleTag = (key) => setWeighInTags((t) => ({ ...t, [key]: !t[key] }));
  // Optional free-text note for today's weigh-in ("slept badly", "big carb
  // day"). Reset after a successful log.
  const [weighInNote, setWeighInNote] = useState('');

  const today = new Date();
  const headerDate = today.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

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

  // Sanitize free-text weight input so decimals work reliably on every mobile
  // keyboard. type="number" silently drops a typed period on some Android /
  // locale setups, so we use type="text" + inputMode="decimal" and filter
  // here: accept digits and a single decimal point, treat a comma as a point
  // (European keyboards), strip everything else.
  const onWeightChange = (raw) => {
    let v = String(raw).replace(',', '.').replace(/[^0-9.]/g, '');
    const firstDot = v.indexOf('.');
    if (firstDot !== -1) {
      // Keep only the first dot; drop any later ones.
      v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
    }
    setWeightDraft(v);
  };

  // Local YYYY-MM-DD for today — caps the date picker so a weigh-in can't be
  // logged in the future.
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const logWeight = () => {
    const n = Number(weightDraft);
    if (!Number.isFinite(n) || n <= 0) return;
    const isToday = logDate === todayStr;
    // Today keeps the real clock time (natural ordering); a past date anchors
    // to local noon so it lands squarely on that calendar day regardless of TZ.
    const ts = isToday ? Date.now() : new Date(`${logDate}T12:00:00`).getTime();
    if (!Number.isFinite(ts)) return;
    if (hasWeightForDate(ts)) {
      const label = isToday
        ? 'today'
        : new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const ok = window.confirm(`You already logged a weight for ${label}. Replace it with this reading?`);
      if (!ok) return;
      replaceWeightForDate(n, ts, weighInTags, weighInNote);
    } else {
      addWeight(n, ts, weighInTags, weighInNote);
    }
    setWeightDraft('');
    setWeighInTags({ period: false, alcohol: false, restaurant: false });
    setWeighInNote('');
    setLogDate(todayStr);
    refresh();
  };

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
            {/* Echo the context tags on the latest reading so Lauren sees they
                were saved (and Wren has them). */}
            {current && current.tags && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 2 }}>
                {current.tags.period && <Droplet size={13} color={c.rosedeep} strokeWidth={2} />}
                {current.tags.alcohol && <Wine size={13} color={c.rosedeep} strokeWidth={2} />}
                {current.tags.restaurant && <Utensils size={13} color={c.rosedeep} strokeWidth={2} />}
              </span>
            )}
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

          {/* See historical data — opens the detail view with the weight-trend
              chart on top, change stats, and the full weigh-in history. Keeps
              this card a clean daily-glance instead of stacking charts. */}
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            disabled={log.length === 0}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8, padding: '12px 14px', borderRadius: 12, cursor: log.length ? 'pointer' : 'default',
              border: `0.5px solid ${N.cardBorder}`, background: N.tileBg,
              fontFamily: 'inherit', opacity: log.length ? 1 : 0.55,
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={16} color={c.rosedeep} strokeWidth={2} />
              <span style={{ fontSize: 13, fontWeight: 600, color: N.darkText }}>
                {log.length ? 'See historical data' : 'Log a weigh-in to start your history'}
              </span>
            </span>
            {log.length > 0 && <ChevronRight size={16} color={N.mutedText} />}
          </button>

          {/* Log input */}
          <hr style={divider} />
          {/* Context tags — tap any that apply to today's weigh-in. They don't
              change the number; they give Wren the "why" behind a high reading
              so she reads it as water, not fat. */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {[
              { id: 'period', label: 'On my period', Icon: Droplet },
              { id: 'alcohol', label: 'Alcohol yesterday', Icon: Wine },
              { id: 'restaurant', label: 'Ate out', Icon: Utensils },
            ].map(({ id, label, Icon }) => {
              const active = weighInTags[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleTag(id)}
                  aria-pressed={active}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '7px 11px', borderRadius: 999, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                    border: active ? 'none' : `0.5px solid ${N.cardBorder}`,
                    background: active ? c.rosedeep : N.tileBg,
                    color: active ? '#fff' : N.darkText,
                  }}
                >
                  <Icon size={13} color={active ? '#fff' : c.rosedeep} strokeWidth={2} />
                  {label}
                </button>
              );
            })}
          </div>
          {/* Optional note for this weigh-in — free text Wren can read for
              extra context ("slept badly", "big carb day", "felt bloated"). */}
          <input
            type="text"
            placeholder="Add a note (optional)…"
            value={weighInNote}
            onChange={(e) => setWeighInNote(e.target.value.slice(0, 280))}
            onKeyDown={(e) => { if (e.key === 'Enter') logWeight(); }}
            style={{ ...inputStyle, width: '100%', flex: 'none', marginBottom: 10 }}
          />
          {/* Date for this weigh-in — defaults to today; pick a past date to
              backfill or fix a mis-dated entry. Capped at today (no future
              readings). */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: N.mutedText, flexShrink: 0 }}>Date</span>
            <input
              type="date"
              value={logDate}
              max={todayStr}
              onChange={(e) => setLogDate(e.target.value || todayStr)}
              style={{ ...inputStyle, colorScheme: 'light' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              inputMode="decimal"
              placeholder={logDate === todayStr ? "Log today's weight…" : 'Weight (lbs) for selected date…'}
              value={weightDraft}
              onChange={(e) => onWeightChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') logWeight(); }}
              style={inputStyle}
            />
            <button
              onClick={logWeight}
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

      {showHistory && <NourishHistory onClose={() => setShowHistory(false)} />}
    </div>
  );
}

// ---------- Weight history detail ----------
// Full-screen view behind the "See historical data" button. Trend chart on
// top (weekly averages — the smoothed direction), then change stats, then the
// full list of every weigh-in with its context tags. Read-only; logging stays
// on the main Nourish card.
function NourishHistory({ onClose }) {
  // Re-read the store after a delete. The parent NourishView re-reads on close,
  // so deletions here are reflected there too.
  const [bump, setBump] = useState(0);
  void bump;
  const removeEntry = (r) => {
    const label = new Date(r.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!window.confirm(`Delete the ${r.weight.toFixed(1)} lb weigh-in from ${label}?`)) return;
    deleteWeight(r.ts);
    setBump((b) => b + 1);
  };
  const weeks = getWeighInsByWeek(); // grouped by week, newest first
  const hasAny = weeks.some((w) => w.entries.length);
  const series = getWeeklyAvgSeries(0); // full history, one avg per week
  // "Jul 6–12" / "Jun 29 – Jul 5" label for a Monday-anchored week.
  const weekLabel = (weekStart) => {
    const s = new Date(weekStart);
    const e = new Date(weekStart + 6 * 86400000);
    const sM = s.toLocaleDateString('en-US', { month: 'short' });
    const eM = e.toLocaleDateString('en-US', { month: 'short' });
    return sM === eM
      ? `${sM} ${s.getDate()}–${e.getDate()}`
      : `${sM} ${s.getDate()} – ${eM} ${e.getDate()}`;
  };
  const dailyChange = getWeightChange('daily');
  const weeklyChange = getWeightChange('weekly');
  const monthlyChange = getWeightChange('monthly');
  const fmtChange = (n) => (n === null || n === undefined) ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}`;

  // Trend chart geometry from the weekly-average series. Larger than the old
  // inline sparkline so it reads as the centerpiece of this screen.
  const chart = (() => {
    if (series.length < 2) return null;
    const vals = series.map((p) => p.avg);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = Math.max(0.5, max - min);
    const VBW = 320, VBH = 120, PAD_Y = 16;
    const stepX = VBW / (series.length - 1);
    const pts = series.map((p, i) => ({
      x: Math.round(i * stepX),
      y: Math.round(VBH - PAD_Y - ((p.avg - min) / span) * (VBH - PAD_Y * 2)),
      avg: p.avg,
      weekStart: p.weekStart,
    }));
    return { min, max, pts };
  })();
  const delta = series.length >= 2
    ? +(series[series.length - 1].avg - series[series.length - 2].avg).toFixed(1)
    : null;

  const card = {
    background: c.white, border: `0.5px solid ${N.cardBorder}`,
    borderRadius: 20, padding: '18px 20px', marginBottom: 12,
  };
  const label = {
    fontSize: 11, color: c.rosedeep, letterSpacing: 0.7,
    textTransform: 'uppercase', fontWeight: 600, margin: '0 0 12px',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, overflowY: 'auto',
      WebkitOverflowScrolling: 'touch', maxWidth: 430, margin: '0 auto',
      background: 'linear-gradient(180deg, #F8E8E2 0%, #FBF4FA 30%, #FBF4FA 100%)',
    }}>
      {/* Sticky header with back button */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 6,
        padding: '16px 20px', background: 'rgba(251,244,250,0.92)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        borderBottom: `0.5px solid ${N.cardBorder}`,
      }}>
        <button
          onClick={onClose}
          aria-label="Back"
          style={{
            display: 'flex', alignItems: 'center', gap: 2, background: 'none',
            border: 'none', cursor: 'pointer', color: N.darkText,
            fontSize: 14, fontWeight: 600, fontFamily: 'inherit', padding: 0,
          }}
        >
          <ChevronLeft size={20} /> Nourish
        </button>
        <p style={{ fontSize: 15, fontWeight: 600, color: N.darkText, margin: '0 auto 0 8px' }}>
          Weight history
        </p>
      </div>

      <div style={{ padding: '16px 16px 40px' }}>
        {/* Trend chart — top of the page */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ ...label, margin: 0 }}>Weight trend</p>
            {delta !== null && (
              <span style={{ fontSize: 12, fontWeight: 600, color: N.mutedText }}>
                {delta > 0 ? '+' : ''}{delta.toFixed(1)} lbs vs last week
              </span>
            )}
          </div>
          {chart ? (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                {/* y-axis range labels */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: 10, color: N.hintText, paddingBottom: 2 }}>
                  <span>{chart.max.toFixed(1)}</span>
                  <span>{chart.min.toFixed(1)}</span>
                </div>
                <svg width="100%" height="120" viewBox="0 0 320 120" preserveAspectRatio="none" style={{ flex: 1 }}>
                  <polyline
                    points={chart.pts.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none" stroke={c.rosedeep} strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"
                  />
                  {chart.pts.map((p, i) => (
                    <circle
                      key={i} cx={p.x} cy={p.y}
                      r={i === chart.pts.length - 1 ? 4 : 3}
                      fill={i === chart.pts.length - 1 ? c.rosedeep : N.cardBorder}
                    />
                  ))}
                </svg>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 11, color: N.hintText }}>
                  {new Date(chart.pts[0].weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span style={{ fontSize: 11, color: N.hintText }}>
                  {chart.pts[chart.pts.length - 1].avg.toFixed(1)} lbs · latest week
                </span>
              </div>
              <p style={{ fontSize: 11, color: N.hintText, margin: '10px 0 0', lineHeight: 1.4 }}>
                Each point is one week's average — smooths out daily water swings so the real direction shows.
              </p>
            </>
          ) : (
            <p style={{ fontSize: 12, color: N.hintText, margin: '8px 0', textAlign: 'center' }}>
              Two weeks of weigh-ins will unlock your trend.
            </p>
          )}
        </div>

        {/* Change stats */}
        <div style={card}>
          <p style={label}>Change</p>
          <div style={{ display: 'flex', gap: 6, background: N.tileBg, borderRadius: 12, padding: 4 }}>
            {[
              { label: 'Daily', value: dailyChange },
              { label: 'Weekly', value: weeklyChange },
              { label: 'Monthly', value: monthlyChange },
            ].map((t) => (
              <div key={t.label} style={{ flex: 1, textAlign: 'center', padding: '8px 4px' }}>
                <span style={{ fontSize: 10, display: 'block', marginBottom: 3, color: N.hintText }}>{t.label}</span>
                <span style={{ fontSize: 15, fontWeight: 600, display: 'block', color: N.darkText }}>{fmtChange(t.value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Full weigh-in history */}
        <div style={card}>
          <p style={label}>All weigh-ins</p>
          {!hasAny && (
            <p style={{ fontSize: 12, color: N.hintText, margin: 0, textAlign: 'center' }}>No weigh-ins yet.</p>
          )}
          {weeks.map((wk) => (
            <div key={wk.weekStart} style={{ marginBottom: 16 }}>
              {/* Week header: date range + that week's average + count. */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingBottom: 6, borderBottom: `0.5px solid ${N.cardBorder}` }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: N.darkText }}>{weekLabel(wk.weekStart)}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: c.rosedeep, textAlign: 'right' }}>
                  avg {wk.avg.toFixed(1)} <span style={{ fontSize: 11, fontWeight: 400, color: N.mutedText }}>lbs</span>
                  <span style={{ fontSize: 11, fontWeight: 400, color: N.hintText }}> · {wk.count} weigh-in{wk.count === 1 ? '' : 's'}</span>
                </span>
              </div>
              {wk.entries.map((r, i) => (
                <div
                  key={r.ts}
                  style={{
                    padding: '11px 0',
                    borderTop: i === 0 ? 'none' : `0.5px solid ${N.headerBg}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: N.darkText }}>
                      {new Date(r.ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {r.tags && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          {r.tags.period && <Droplet size={12} color={c.rosedeep} strokeWidth={2} />}
                          {r.tags.alcohol && <Wine size={12} color={c.rosedeep} strokeWidth={2} />}
                          {r.tags.restaurant && <Utensils size={12} color={c.rosedeep} strokeWidth={2} />}
                        </span>
                      )}
                      <span style={{ fontSize: 14, fontWeight: 600, color: N.darkText, minWidth: 56, textAlign: 'right' }}>
                        {r.weight.toFixed(1)} <span style={{ fontSize: 11, fontWeight: 400, color: N.mutedText }}>lbs</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeEntry(r)}
                        aria-label={`Delete weigh-in from ${new Date(r.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                          display: 'flex', alignItems: 'center', color: N.hintText, flexShrink: 0,
                        }}
                      >
                        <X size={14} />
                      </button>
                    </span>
                  </div>
                  {r.note && (
                    <p style={{ fontSize: 12, color: N.mutedText, margin: '4px 0 0', lineHeight: 1.4 }}>
                      {r.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
