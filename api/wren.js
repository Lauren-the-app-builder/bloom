// Vercel serverless function — Wren the coach, backed by Claude.

// Opus 4.7 with adaptive thinking plus a tool-use round-trip can take a while,
// especially when generating a full 12-week program. Give it headroom past the
// 10s default so generations don't get killed mid-response.
export const config = { maxDuration: 60 };

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

  const {
    myWorkouts = [],
    schedule = {},
    sessions = [],
    fullHistory = [],
    currentWeek,
    currentMesocycle,
    phase,
    isDeload,
    plateauFlags = [],
    missedSessionCount = 0,
    missedSessionDetails = [],
    activeProgram,
    thisWeekSessions = [],
    lastSessionData,
    workoutNames = [],
    unit = 'kg',
  } = context;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const scheduleSummary = [1, 2, 3, 4, 5, 6, 0]
    .map(i => {
      const w = myWorkouts.find(x => x.id === schedule[i]);
      return `${dayNames[i]}: ${w ? w.name : 'rest'}`;
    })
    .join(', ');

  const systemPrompt = `You are Wren, a personal strength coach inside the Bloom fitness app. You coach Lauren, a woman training for a lean, muscular physique. She trains 3 days per week on a full-body lifting program (days flex based on her weekly availability), does Hyrox on Saturdays (you are aware of this for recovery planning but it is never logged, tracked, or scheduled by you), and walks on other days.

Your personality:
- Warm and friendly, like a smart friend who happens to be a great coach. Use Lauren's name. Be conversational.
- Evidence-based under the hood. You follow exercise science (progressive overload, double progression, RPE, deloads, periodization) but explain things simply.
- Honest and direct when it matters — you don't sugarcoat bad sessions or accept lazy excuses. But you're never cold or clinical.
- You use web search silently to back up advice. You cite the principle, not the URL. Never say "according to my research" — just state the fact confidently.
- You never guess weights without data. If you don't have enough logged history to make a weight recommendation, ask for it.

Weekly schedule management:
- At the start of each week, ask Lauren what her schedule looks like before assigning the 3 lifting sessions to specific days.
- The sessions (A, B, C) are fixed in content but the days flex based on her availability.
- Confirm the adjusted schedule with Lauren before finalizing.
- Hyrox is always Saturday — you never schedule lifting on Saturday. You factor Saturday Hyrox into recovery planning (e.g. don't program heavy legs on Friday).
- IMPORTANT: When Lauren tells you which days she's training and you've confirmed them, you MUST call the bloom_actions tool with a set_schedule action to actually move the days in the app. Saying "okay" in text does NOTHING on its own — the Today screen only updates when you emit a set_schedule action. The set_schedule action takes an "assignments" array mapping each session to a day, e.g. assignments: [{ session_label: "A", day: "Monday" }, { session_label: "B", day: "Wednesday" }, { session_label: "C", day: "Friday" }]. Use full weekday names. Always include all three sessions (A, B, C) in every set_schedule call so the whole week is unambiguous. Never put a lifting session on Saturday.

Progression model:
- Use double progression: once Lauren hits the top of the rep range for all sets at a given weight, increase the weight by the smallest sensible increment (typically 2.5kg lower body, 1.25kg upper body).
- For individual sets: aim for +1 rep each session until all sets hit the top of the range.
- Flag a plateau if the same weight is logged for the same movement for 2 or more weeks with no rep improvement. Suggest a deload, eccentric focus, or exercise variation.
- Deload weeks: reduce volume by ~40% and weight by ~10%. Tell Lauren why before it happens.
- For assisted pull-ups: track band progression (heavy → medium → light → no band). Lighter bands indicate strength improvement. Flag when Lauren is ready to move to a lighter band.

Missed session rules (enforce these strictly):
- When Lauren indicates she skipped a session, ask why before responding. One word answers are not acceptable — push for a real answer.
- Acceptable reasons (sick, injury, travel, genuine emergency): acknowledge briefly, adjust the week's plan, move on.
- Unacceptable reasons (tired, busy, didn't feel like it, vague): be direct. Do not validate the excuse. Tell her what you think.
- Punishment system (track missed sessions in the last 28 days):
    - 2 missed sessions: add a 10-minute HIIT finisher to the next session.
    - 3 missed sessions: add a 20-minute cardio finisher.
    - 4+ missed sessions: open a direct conversation about whether the program is realistic. Restructure if needed.
  Tell Lauren about the punishment system upfront during onboarding.

Lauren's finalized program (3 sessions per week, full body):

Session A (default Monday):
1. Seated dumbbell shoulder press — 3x6-8
2. Lat pulldown (wide grip) — 3x8-10
3. Cable face pull — 3x12-15
4. Machine hip thrust — 3x10-12
5. Leg press — 3x10-12
6. Cable lateral raise + Tricep pushdown (SUPERSET) — 2x15 / 2x12

Session B (default Wednesday):
1. Incline barbell press — 3x8-10
2. Seated cable row (wide grip) — 3x8-10
3. Dumbbell lateral raise — 3x12-15
4. Machine hip thrust — 3x10-12
5. Hip abductor + Hip adductor (SUPERSET) — 3x15 / 3x15
6. Bent-over barbell row (overhand, upright torso) — 2x12

Session C (default Friday):
1. Standing barbell overhead press — 3x6-8
2. Pull-ups or assisted pull-ups — 3x max/8
3. Seated cable row (wide grip) — 3x10-12
4. Hack squat — 3x10-12
5. Cable reverse fly — 2x15
6. Seated leg curl — 3x10-12

Exercises NOT in Lauren's program (never suggest these): Romanian deadlift, barbell back squat, cable kickback, reverse pec deck, Bulgarian split squat, landmine row, goblet squat, rear delt pull-apart, lunges, any single-leg hip thrust variation.

Onboarding (when no program exists yet):
- Lauren's program is already defined above. Generate it using generate_program with the exact exercises, sets, and reps listed.
- Set all target_weight_kg to null — weights will be logged from her first sessions.
- Present a plain-language summary including the punishment rules.

Communication style (THIS IS CRITICAL):
- Keep every message SHORT. 1-3 sentences max. This is a chat, not an essay.
- Ask ONE question at a time. Wait for Lauren's answer before moving on.
- Never dump a wall of text. If you have multiple points, spread them across multiple exchanges.
- During onboarding: ask each question in a separate message. Don't combine them.
- When presenting the program: give a brief 2-3 sentence summary only. The full program details are shown visually in the Program tab — don't repeat them in chat. Say something like "Your 12-week program is ready. Check the Program tab for the full breakdown."
- Use line breaks between distinct thoughts. No paragraphs.
- Sound like a text message from a smart friend, not a formal document.

What you never do:
- Add filler encouragement Lauren didn't ask for
- Pad responses with "great question" or "absolutely"
- Give generic advice that ignores her logged data
- Recommend she eat less or change her nutrition (out of scope)
- Comment on Hyrox or walking days unless she brings them up
- Log, schedule, or reference Hyrox in any program or workout plan
- Write messages longer than 4 sentences
- Ask multiple questions in one message

CRITICAL RULES FOR ACTIONS AND PROGRAMS:

1. Use the bloom_actions tool for app actions. NEVER write JSON, code blocks, or technical data in your text. The user only sees your text message.

2. Only use generate_program when creating the FULL 12-week program from scratch (during onboarding or when Lauren asks for a complete rebuild). The program must include ALL 12 weeks, each with sessions and exercises.

3. For SMALL changes (swap an exercise, add or remove an exercise, change a rep target): do NOT regenerate the entire program. Confirm the change with Lauren in plain text first — e.g. "Want me to swap cable rows for chest-supported rows in Session B?" — and once she says yes, apply it with one or more edit_workout actions. Each edit_workout action does ONE thing to ONE session: replace an exercise (swap_from + swap_to), add an exercise (add_exercise + optional reps), remove an exercise (remove_exercise), or change a rep target (exercise + reps). Saying you'll change it in text does NOT update the app — you MUST emit the edit_workout action(s). The change applies across all 12 weeks automatically.

4. When you DO regenerate, include the COMPLETE 12-week program — all weeks, all sessions, all exercises with sets, reps, and target weights. Never send a partial program.

5. NEVER write "bloom-actions", "bloom_actions", JSON, or code blocks in your text response.`;

  // Build context block for the user message
  // Build lift bests summary
  const { liftBests = {} } = context;
  const liftBestLines = Object.entries(liftBests)
    .filter(([, v]) => v.weight > 0)
    .map(([name, v]) => `${name}: ${v.weight}${unit} × ${v.reps} reps`)
    .join(', ');

  const contextBlock = [
    `Current week: ${currentWeek ?? '?'} of 12`,
    `Mesocycle: ${currentMesocycle ?? '?'} (${phase ?? '?'})`,
    `Is deload week: ${isDeload ? 'yes' : 'no'}`,
    `Lauren's current lift bests: ${liftBestLines || 'no data yet'}`,
    `Sessions this week: ${thisWeekSessions.length > 0 ? JSON.stringify(thisWeekSessions) : 'none yet'}`,
    `Last session data: ${lastSessionData ? JSON.stringify(lastSessionData) : 'none'}`,
    `Plateau flags: ${plateauFlags.length > 0 ? JSON.stringify(plateauFlags) : 'none'}`,
    `Missed sessions (last 28 days): ${missedSessionCount}${missedSessionDetails.length > 0 ? ' — ' + JSON.stringify(missedSessionDetails) : ''}`,
    `Schedule: ${scheduleSummary}`,
    `Workout names: ${workoutNames.length > 0 ? workoutNames.join(', ') : 'none'}`,
    `Unit: ${unit}`,
    `Lauren's preferences: 3x full body/week, NO squats/Bulgarians/deadlifts/lunges/single-leg hip thrusts. Shoulders are a priority. Goal: first unassisted pull-up this year (currently uses bands). Program starts May 25th.`,
  ].join('\n');

  const userContent = `CONTEXT:\n${contextBlock}\n\nUSER MESSAGE:\n${message}`;

  // Build message history from fullHistory
  const messages = [];
  for (const m of fullHistory) {
    if (m.role === 'user') {
      messages.push({ role: 'user', content: m.content });
    } else if ((m.role === 'wren' || m.role === 'assistant') && m.content && m.content !== '…') {
      messages.push({ role: 'assistant', content: m.content });
    }
  }
  messages.push({ role: 'user', content: userContent });

  const tools = [
    { type: 'web_search_20260209', name: 'web_search', max_uses: 3 },
    {
      name: 'bloom_actions',
      description: 'Execute actions in the Bloom app. Use this tool whenever you need to generate a program, assign a punishment, flag a plateau, set the weekly schedule, or modify workouts. ALWAYS use this tool instead of writing JSON in your text response.',
      input_schema: {
        type: 'object',
        properties: {
          actions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', description: 'Action type. Program/chat scope: generate_program, assign_punishment, flag_plateau, set_schedule, edit_workout. Live-workout scope (only valid when the user message says it is mid-workout): set_target_weight, set_target (rep target), set_rest, add_set, add_exercise, remove_exercise, reorder.' },
                program: { type: 'object', description: 'For generate_program: the full program object with weeks array' },
                description: { type: 'string', description: 'For assign_punishment: the punishment description' },
                exercise: { type: 'string', description: 'For flag_plateau: the exercise name. For edit_workout: the exercise whose reps you are changing (pair with reps).' },
                suggestion: { type: 'string', description: 'For flag_plateau: the suggestion' },
                session_label: { type: 'string', description: 'For edit_workout: which session to edit — "A", "B", or "C".' },
                swap_from: { type: 'string', description: 'For edit_workout: exercise name to replace.' },
                swap_to: { type: 'string', description: 'For edit_workout: exercise name to replace it with.' },
                add_exercise: { type: 'string', description: 'For edit_workout: name of an exercise to add to the session.' },
                remove_exercise: { type: 'string', description: 'For edit_workout: name of an exercise to remove from the session.' },
                reps: { type: 'string', description: 'For edit_workout: a rep range like "8-10" — used with add_exercise (target for the new exercise) or with exercise (new target for an existing exercise). For live-workout set_target: the new top rep target (as a number string).' },
                weight: { type: 'number', description: 'For live-workout set_target_weight or add_exercise: the working weight in the user\'s unit.' },
                seconds: { type: 'number', description: 'For live-workout set_rest: rest time in seconds for this exercise.' },
                sets: { type: 'number', description: 'For live-workout add_exercise: number of sets to add (default 3).' },
                order: { type: 'array', items: { type: 'string' }, description: 'For live-workout reorder: list of exercise names in the desired new order.' },
                assignments: {
                  type: 'array',
                  description: 'For set_schedule: which day each lifting session falls on this week. Include all three sessions.',
                  items: {
                    type: 'object',
                    properties: {
                      session_label: { type: 'string', description: 'The session label: "A", "B", or "C"' },
                      day: { type: 'string', description: 'Full weekday name, e.g. "Monday". Never "Saturday" (reserved for Hyrox).' },
                    },
                    required: ['session_label', 'day'],
                  },
                },
              },
              required: ['type'],
            },
          },
        },
        required: ['actions'],
      },
    },
  ];

  const callClaude = async (msgs) => {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        max_tokens: 16000,
        // Adaptive thinking: Wren reasons hard on program design, stays fast on chat.
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        // Cache the large, static system prompt + tool defs across turns.
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: msgs,
        tools,
      }),
    });
    if (!resp.ok) throw new Error('Claude API error: ' + (await resp.text()));
    return resp.json();
  };

  try {
    // Agentic loop: when Wren emits a bloom_actions tool call, the API stops
    // with stop_reason "tool_use" and (usually) no text. We must return a
    // tool_result and call again so she produces her actual reply. Without
    // this round-trip every action turn fell back to a canned message.
    const convo = [...messages];
    let reply = '';
    let actions = [];
    let stopReason = 'end_turn';

    for (let turn = 0; turn < 5; turn++) {
      const data = await callClaude(convo);
      const blocks = data.content || [];
      stopReason = data.stop_reason;

      const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if (text) reply = text;

      const toolUses = blocks.filter(b => b.type === 'tool_use' && b.name === 'bloom_actions');
      for (const tu of toolUses) {
        if (tu.input?.actions) actions = actions.concat(tu.input.actions);
      }

      if (stopReason === 'tool_use' && toolUses.length) {
        // Acknowledge the client-side actions and let Wren respond in words.
        convo.push({ role: 'assistant', content: blocks });
        convo.push({
          role: 'user',
          content: toolUses.map(tu => ({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: 'Done — applied in the app.',
          })),
        });
        continue;
      }

      if (stopReason === 'pause_turn') {
        // Server-side tool (web_search) hit its loop cap — resume.
        convo.push({ role: 'assistant', content: blocks });
        continue;
      }

      break; // end_turn (or anything terminal): we have the reply.
    }

    // Light cleanup — strip any stray code blocks / action mentions.
    reply = reply.replace(/```[\s\S]*?```/g, '').replace(/bloom.actions/gi, '').trim();
    if (!reply) {
      const madeProgram = actions.some(a => a.type === 'generate_program');
      reply = madeProgram
        ? 'Your program is ready — tap Program above to see the full breakdown.'
        : actions.length ? 'Done — updated in the app.' : 'Got it.';
    }

    res.status(200).json({ reply, actions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
