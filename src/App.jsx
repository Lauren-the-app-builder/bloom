import { useEffect, useState } from 'react';
import BloomApp from './BloomApp';
import SignIn from './SignIn';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { pullAll, flushQueue, setSuppressPushes } from './lib/sync';

export default function App() {
  const [authState, setAuthState] = useState('loading'); // loading | signedIn | signedOut
  const [syncedOnce, setSyncedOnce] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Allow the app to run un-synced (e.g. local dev with no env vars).
      setAuthState('signedIn');
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAuthState(data.session ? 'signedIn' : 'signedOut');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthState(session ? 'signedIn' : 'signedOut');
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  // On sign-in: pull from Supabase, then flush any queued local writes.
  useEffect(() => {
    if (authState !== 'signedIn' || !isSupabaseConfigured) return;
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
  }, [authState]);

  if (authState === 'loading') {
    return <div style={{ minHeight: '100vh', background: '#FDF9F9' }} />;
  }
  if (authState === 'signedOut') return <SignIn />;
  // Don't mount BloomApp until the first pull has finished — otherwise it
  // would render with stale local data and trigger pushes that overwrite
  // the server.
  if (isSupabaseConfigured && !syncedOnce) {
    return <div style={{ minHeight: '100vh', background: '#FDF9F9' }} />;
  }
  return <BloomApp />;
}
