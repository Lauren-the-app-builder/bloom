// Wren — the AI coach. Calls /api/wren which proxies to Claude.

const API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? '/api/wren' // vite proxy or relative; works via vercel dev or remote
  : '/api/wren';

export async function askWren(message, context, midWorkout = false) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context, midWorkout }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.reply;
}
