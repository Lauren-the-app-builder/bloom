import { useEffect, useState } from 'react';
import BloomApp from './BloomApp';
import { isSupabaseConfigured } from './lib/supabase';
import { pullAll, flushQueue, setSuppressPushes } from './lib/sync';

// Single-user app — no Supabase auth. The anon key reaches the bloom_*/wren_*
// tables directly because their RLS is disabled (see migration 003). On boot
// we pull everything into localStorage, then re-enable pushes and drain the
// retry queue. If Supabase env vars are missing we just render BloomApp
// against local-only state.
export default function App() {
  const [syncedOnce, setSyncedOnce] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    setSuppressPushes(true);
    (async () => {
      try {
        await pullAll();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[bloom] initial pull failed:', err?.message || err);
      } finally {
        setSyncedOnce(true);
        // Give BloomApp's first render + initial useEffect saves a tick to
        // settle (those would otherwise re-push the freshly-pulled data),
        // then re-enable normal sync pushes.
        setTimeout(() => {
          setSuppressPushes(false);
          flushQueue();
        }, 250);
      }
    })();
  }, []);

  // Hold the splash until the first pull resolves so BloomApp doesn't render
  // with stale local data and trigger writes that overwrite the server.
  if (isSupabaseConfigured && !syncedOnce) {
    return <div style={{ minHeight: '100vh', background: '#FDF9F9' }} />;
  }
  return <BloomApp />;
}
