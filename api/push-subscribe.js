// Save push subscription. In a real app this goes to a database;
// here we store it in-memory on the serverless function (short-lived,
// but sufficient since we only need it for the same request cycle
// or via the paired push-rest endpoint that receives it inline).
// For Bloom's single-user case we pass the subscription with each
// push-rest request, so this endpoint just validates + acknowledges.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { subscription } = req.body || {};
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Missing subscription' });
  }
  res.status(200).json({ ok: true });
}
