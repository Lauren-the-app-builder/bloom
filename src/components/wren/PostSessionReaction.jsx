import React, { useState, useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { c } from './tokens';
import { addWrenMessage, getSessions, getActiveProgram, getMissedSessions } from '../../lib/storage';
import { buildWrenContext } from './wrenHelpers';

// askWrenReaction is a separate endpoint for post-session reactions
async function askWrenReaction(sessionData, context) {
  const res = await fetch('/api/wren', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '__reaction__', context: { ...context, reactionSessionData: sessionData }, midWorkout: false }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return { reply: data.reply };
}

export default function PostSessionReaction({ sessionData, workout }) {
  const [reaction, setReaction] = useState(null);
  const [error, setError] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current || !sessionData) return;
    fetched.current = true;

    (async () => {
      try {
        const sessions = getSessions();
        const program = getActiveProgram();
        const missedSessions = getMissedSessions();
        const ctx = buildWrenContext({
          schedule: {},
          myWorkouts: workout ? [workout] : [],
          sessions,
          unit: 'kg',
          program,
          missedSessions,
        });

        const { reply } = await askWrenReaction(sessionData, ctx);
        setReaction(reply);

        // Save reaction as a chat message
        addWrenMessage({ role: 'assistant', content: reply, isReaction: true });
      } catch {
        setError(true);
      }
    })();
  }, [sessionData, workout]);

  if (error) return null;

  // Loading shimmer
  if (!reaction) {
    return (
      <div style={{
        padding: 14, borderRadius: 14, background: c.white, marginTop: 12,
        borderLeft: `3px solid ${c.blush}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} color={c.blush} />
          <div style={{
            height: 12, width: '60%', borderRadius: 6, background: c.line,
            animation: 'shimmer 1.2s ease-in-out infinite',
          }} />
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ height: 10, width: '90%', borderRadius: 4, background: c.line, marginBottom: 6, animation: 'shimmer 1.2s ease-in-out infinite' }} />
          <div style={{ height: 10, width: '75%', borderRadius: 4, background: c.line, animation: 'shimmer 1.2s ease-in-out infinite' }} />
        </div>
        <style>{`@keyframes shimmer { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      padding: 14, borderRadius: 14, background: c.white, marginTop: 12,
      borderLeft: `3px solid ${c.blush}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Sparkles size={16} color={c.blush} />
        <span style={{ fontSize: 13, fontWeight: 700, color: c.charcoal }}>Wren</span>
      </div>
      <div style={{ fontSize: 12, color: c.charcoal, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {reaction}
      </div>
    </div>
  );
}
