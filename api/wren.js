// Vercel serverless function — Wren the coach, backed by Claude.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { message, context = {}, midWorkout = false } = req.body || {};
  if (!message) {
    res.status(400).json({ error: 'message required' });
    return;
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
    return;
  }

  const { myWorkouts = [], schedule = {}, sessions = [], history = [] } = context;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = new Date();
  const todayIdx = today.getDay();
  const todayName = dayNames[todayIdx];
  const todayWorkoutId = schedule[todayIdx];
  const todayWorkout = myWorkouts.find(w => w.id === todayWorkoutId);

  const scheduleSummary = dayNames
    .map((d, i) => {
      const w = myWorkouts.find(x => x.id === schedule[i]);
      return `${d}: ${w ? w.name : 'rest'}`;
    })
    .join(', ');

  const workoutsSummary = myWorkouts
    .map(w => `${w.name} (${w.exercises.join(', ')})`)
    .join('; ');

  // Recent session history — only the most recent 5 for context
  const recentSessions = sessions.slice(-5).map(s => {
    const exs = Object.entries(s.exercises || {})
      .map(([name, sets]) => {
        const top = sets[sets.length - 1] || {};
        return `${name}: ${sets.length}×${top.reps || '?'}@${top.weight || '?'}lb`;
      })
      .join('; ');
    return `${new Date(s.finishedAt).toLocaleDateString()} — ${s.workoutName}: ${exs}`;
  }).join('\n');

  const systemPrompt = `You are Wren 🌙, Lauren's personal hypertrophy coach inside the Bloom app.

Personality: Warm, direct, smart. You know hypertrophy science cold but talk like a knowledgeable friend texting. Short, concrete, specific. No hollow affirmations ("great question!"), no lectures. Use emoji sparingly. You never recommend random generic advice — always ground suggestions in her actual data.

Context about Lauren's training:
- Today is ${todayName}. ${todayWorkout ? `Her scheduled workout is "${todayWorkout.name}" (${todayWorkout.exercises.join(', ')}).` : 'Today is a rest day.'}
- Weekly schedule: ${scheduleSummary}
- Saved workouts: ${workoutsSummary || 'none yet'}
${recentSessions ? `- Recent sessions:\n${recentSessions}` : '- No logged sessions yet.'}

${midWorkout ? 'She is currently IN THE MIDDLE of a workout. Keep responses very short (1-2 sentences). If she asks to make something easier/harder, give concrete numbers.' : 'Keep responses to 2-4 sentences unless she asks for detail.'}

When suggesting weight progressions, use small increments (5 lb for upper body, 10 lb for lower body) unless her data clearly supports bigger jumps.`;

  // Build message history from recent chat turns
  const messages = [];
  for (const m of history) {
    if (m.from === 'user') messages.push({ role: 'user', content: m.text });
    else if (m.from === 'coach' && m.text && m.text !== '…') messages.push({ role: 'assistant', content: m.text });
  }
  messages.push({ role: 'user', content: message });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      res.status(500).json({ error: 'Claude API error: ' + err });
      return;
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || 'Got it.';
    res.status(200).json({ reply });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
