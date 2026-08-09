import { useEffect, useState } from 'react';
import BloomApp from './BloomApp';
import { isSupabaseConfigured } from './lib/supabase';
import { pullAll, flushQueue, setSuppressPushes } from './lib/sync';

// A fresh script load NEVER has an active workout yet — ActiveWorkout hasn't
// mounted. So any 'bloom:workoutInProgress' flag still set from before is
// stale (e.g. the OS killed the app outright rather than a clean unmount
// running its cleanup). Clear it here so a leaked flag can't permanently
// block index.html's deferred-reload check (see ActiveWorkout / index.html).
try { localStorage.removeItem('bloom:workoutInProgress'); } catch { /* localStorage unavailable in some contexts */ }

// Single-user app — no Supabase auth. The anon key reaches the bloom_*/wren_*
// tables directly because their RLS is disabled (see migration 003). On boot
// we pull everything into localStorage, then re-enable pushes and drain the
// retry queue. If Supabase env vars are missing we just render BloomApp
// against local-only state.
//
// If Supabase itself is unreachable (DNS failure, paused/deleted project),
// pullAll()'s Promise.all doesn't reject until every one of its parallel
// queries individually times out — which can take far longer than a user
// will wait, leaving the app stuck on a blank screen. PULL_TIMEOUT_MS caps
// how long we hold the splash for; pullAll() keeps running in the
// background and still writes through to localStorage (+ the
// 'bloom:synced' event useLocalState listens for) whenever it does resolve.
const PULL_TIMEOUT_MS = 5000;

export default function App() {
  const [syncedOnce, setSyncedOnce] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    setSuppressPushes(true);
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setSyncedOnce(true);
    }, PULL_TIMEOUT_MS);
    (async () => {
      try {
        await pullAll();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[bloom] initial pull failed:', err?.message || err);
      } finally {
        clearTimeout(timeoutId);
        if (!timedOut) setSyncedOnce(true);
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
