// Serverless: search YouTube for the top video matching a query.
// Requires YOUTUBE_API_KEY env var (YouTube Data API v3 key).

export default async function handler(req, res) {
  const q = req.query.q;
  if (!q) {
    res.status(400).json({ error: "q required" });
    return;
  }
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    res.status(200).json({ videoId: "" });
    return;
  }
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&type=video&safeSearch=strict&q=${encodeURIComponent(q)}&key=${key}`;
    const r = await fetch(url);
    if (!r.ok) {
      res.status(200).json({ videoId: "" });
      return;
    }
    const data = await r.json();
    const videoId = data.items?.[0]?.id?.videoId || "";
    res.status(200).json({ videoId });
  } catch (e) {
    res.status(200).json({ videoId: "" });
  }
}
