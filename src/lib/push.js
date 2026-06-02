// Push notifications for rest timer.
//
// Strategy for maximum reliability:
// 1. Client-side setTimeout in the page → fires Notification API if page is still alive (works 1-3 min in background on iOS)
// 2. Message the SW to schedule its own notification → survives page death for a while
// 3. Server push via /api/push-rest as last resort for very short rests (≤10s Vercel timeout)

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;
let pushSubscription = null;
let clientTimer = null;

export async function subscribeToPush() {
  if (!VAPID_PUBLIC || !('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
    }
    pushSubscription = sub;
    return sub;
  } catch (err) {
    console.warn('[bloom] push subscribe failed:', err?.message);
    return null;
  }
}

export async function scheduleRestPush(delaySec, exercise) {
  // Clear any previous timer.
  if (clientTimer) { clearTimeout(clientTimer); clientTimer = null; }

  const title = 'Bloom — rest done';
  // Use the user's rest message (configured in Settings → Rest timer) so the
  // push body matches what's spoken aloud — one source of truth.
  let phrase = 'Next set, bitch!';
  try {
    phrase = localStorage.getItem('bloom:restPhrase') || phrase;
  } catch { /* localStorage unavailable in some contexts — fall back to default */ }
  const body = `${phrase} (${exercise})`;

  // Only the SW fires the system notification (one source of truth = no duplicates).
  // The client-side playRestDone() handles audio/voice/vibration separately.
  try {
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({
      type: 'SCHEDULE_REST',
      delaySec,
      title,
      body,
    });
  } catch {}

  // 3. Server push for short rests (≤8s to be safe within Vercel 10s timeout).
  if (delaySec <= 8) {
    const sub = pushSubscription || await subscribeToPush();
    if (sub) {
      fetch('/api/push-rest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), delaySec, exercise }),
      }).catch(() => {});
    }
  }
}

export function cancelRestPush() {
  if (clientTimer) { clearTimeout(clientTimer); clientTimer = null; }
  try {
    navigator.serviceWorker.ready.then(reg => {
      reg.active?.postMessage({ type: 'CANCEL_REST' });
    });
  } catch {}
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
