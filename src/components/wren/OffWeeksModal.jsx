import { useState } from 'react';
import { X, HeartPulse, Palmtree, Check } from 'lucide-react';
import { c } from './tokens';
import { getOffWeek, setOffWeek, clearOffWeek, weekKeyFor } from '../../lib/storage';
import { labelForWeekKey } from './wrenHelpers';

// How many calendar weeks back/forward to offer for marking. Generous enough
// to cover "I forgot to mark two weeks ago" without scrolling forever.
const WEEKS_BACK = 10;
const WEEKS_FORWARD = 2;

const OPTIONS = [
  { value: null, label: 'Normal', icon: Check },
  { value: 'injury', label: 'Injury', icon: HeartPulse },
  { value: 'vacation', label: 'Vacation', icon: Palmtree },
];

// Lets Lauren mark any calendar week (past, current, or upcoming) as an
// injury or vacation week — the program won't advance past a marked week,
// and no training is expected during it. See setOffWeek/getOffWeek in
// storage.js and the pause logic in wrenHelpers.getCurrentWeekAndMesocycle.
export default function OffWeeksModal({ onClose }) {
  const [version, setVersion] = useState(0);
  void version;

  const todayKey = weekKeyFor(new Date());
  const weeks = [];
  for (let i = WEEKS_FORWARD; i >= -WEEKS_BACK; i--) {
    const d = new Date(`${todayKey}T00:00:00`);
    d.setDate(d.getDate() + i * 7);
    weeks.push(weekKeyFor(d));
  }

  const handlePick = (weekKey, value) => {
    if (value) setOffWeek(weekKey, value);
    else clearOffWeek(weekKey);
    setVersion(v => v + 1);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'rgba(40,30,45,0.45)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 430, maxHeight: '82vh',
        background: c.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 18px 12px',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: c.charcoal }}>Injury &amp; vacation weeks</div>
            <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>
              Marked weeks pause the program — no training expected, and it
              picks back up where you left off.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: '50%', border: 'none',
              background: c.paper, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
            }}
          >
            <X size={15} color={c.charcoal} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '4px 18px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {weeks.map((weekKey) => {
            const current = getOffWeek(weekKey);
            const isThisWeek = weekKey === todayKey;
            return (
              <div
                key={weekKey}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 16,
                  background: isThisWeek ? c.blushLight : c.paper,
                  border: `1px solid ${c.line}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c.charcoal }}>
                    {labelForWeekKey(weekKey)}
                  </div>
                  {isThisWeek && (
                    <div style={{ fontSize: 10, color: c.rosedeep, fontWeight: 600, marginTop: 1 }}>This week</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {OPTIONS.map(({ value, label, icon: Icon }) => {
                    const active = current === value;
                    return (
                      <button
                        key={label}
                        onClick={() => handlePick(weekKey, value)}
                        title={label}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 34, height: 34, borderRadius: 10, cursor: 'pointer',
                          border: active ? 'none' : `1px solid ${c.line}`,
                          background: active
                            ? (value === 'injury' ? '#E25A75' : value === 'vacation' ? '#7AA5C9' : c.rosedeep)
                            : c.white,
                        }}
                      >
                        <Icon size={14} color={active ? 'white' : c.muted} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
