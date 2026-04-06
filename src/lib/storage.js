import { useState, useEffect } from 'react';

const PREFIX = 'bloom:';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {}
}

export function useLocalState(key, initial) {
  const [state, setState] = useState(() => load(key, initial));
  useEffect(() => { save(key, state); }, [key, state]);
  return [state, setState];
}

// Append a completed workout session to history
export function recordSession(session) {
  const list = load('sessions', []);
  list.push({ ...session, finishedAt: Date.now() });
  save('sessions', list);
  return list;
}

export function getSessions() {
  return load('sessions', []);
}
