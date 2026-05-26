// Schedule a push notification after `delaySec` seconds.
// The client calls this when a rest timer starts. The serverless function
// sleeps (up to Vercel's 60s limit on Hobby, 300s on Pro), then sends
// a web-push notification to wake the device.

import webpush from 'web-push';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { subscription, delaySec = 90, exercise = 'Rest' } = req.body || {};
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Missing subscription' });
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }

  webpush.setVapidDetails('mailto:ldunmore92@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);

  // Cap delay to 55s to stay within Vercel Hobby timeout (60s).
  // For longer rest periods, the client should call this endpoint
  // closer to the end, or the local timer handles it.
  const delay = Math.min(Math.max(0, Number(delaySec) || 0), 55);

  // Wait, then push.
  await new Promise((resolve) => setTimeout(resolve, delay * 1000));

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: 'Bloom — rest done',
        body: `Next set, bitch! (${exercise})`,
        tag: 'bloom-rest',
      })
    );
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Push failed:', err.message);
    res.status(500).json({ error: err.message });
  }
}
