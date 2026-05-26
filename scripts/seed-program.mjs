// One-shot: seed Lauren's finalized program into Supabase.
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const userId = 'b108ab5a-1c90-447e-b9cb-0aed4931ea0f';

const program = {
  startDate: '2025-05-25',
  weeks: Array.from({ length: 12 }, (_, i) => {
    const weekNum = i + 1;
    const mesocycle = Math.floor(i / 4) + 1;
    const phase = mesocycle === 1 ? 'foundation' : mesocycle === 2 ? 'build' : 'peak';
    const isDeload = weekNum % 4 === 0;

    return {
      week_number: weekNum,
      mesocycle,
      phase,
      is_deload: isDeload,
      sessions: [
        {
          session_label: 'A',
          scheduled_day: 'Monday',
          exercises: [
            { name: 'Seated dumbbell shoulder press', sets: 3, reps: '6-8', target_weight_kg: null, progression_note: 'Shoulder priority — push for top of range' },
            { name: 'Cable face pull', sets: 3, reps: '12-15', target_weight_kg: null, progression_note: 'Rear delt + rotator cuff health' },
            { name: 'Lat pulldown (wide grip)', sets: 3, reps: '8-10', target_weight_kg: null, progression_note: 'Pull-up progression support' },
            { name: 'Machine hip thrust', sets: 3, reps: '10-12', target_weight_kg: null, progression_note: 'Glute focus' },
            { name: 'Leg press', sets: 3, reps: '10-12', target_weight_kg: null, progression_note: 'Quad/glute compound' },
            { name: 'Cable lateral raise', sets: 2, reps: '15', target_weight_kg: null, progression_note: 'Superset with tricep pushdown', superset_with: 'Tricep pushdown' },
            { name: 'Tricep pushdown', sets: 2, reps: '12', target_weight_kg: null, progression_note: 'Superset with cable lateral raise', superset_with: 'Cable lateral raise' },
          ],
        },
        {
          session_label: 'B',
          scheduled_day: 'Wednesday',
          exercises: [
            { name: 'Incline barbell press', sets: 3, reps: '8-10', target_weight_kg: null, progression_note: 'Upper chest + front delt' },
            { name: 'Seated cable row (wide grip)', sets: 3, reps: '8-10', target_weight_kg: null, progression_note: 'Mid-back thickness' },
            { name: 'Dumbbell lateral raise', sets: 3, reps: '12-15', target_weight_kg: null, progression_note: 'Shoulder width priority' },
            { name: 'Machine hip thrust', sets: 3, reps: '10-12', target_weight_kg: null, progression_note: 'Glute focus' },
            { name: 'Hip abductor', sets: 3, reps: '15', target_weight_kg: null, progression_note: 'Superset with hip adductor', superset_with: 'Hip adductor' },
            { name: 'Hip adductor', sets: 3, reps: '15', target_weight_kg: null, progression_note: 'Superset with hip abductor', superset_with: 'Hip abductor' },
            { name: 'Bent-over barbell row', sets: 2, reps: '12', target_weight_kg: null, progression_note: 'Overhand grip, upright torso' },
          ],
        },
        {
          session_label: 'C',
          scheduled_day: 'Friday',
          exercises: [
            { name: 'Standing barbell overhead press', sets: 3, reps: '6-8', target_weight_kg: null, progression_note: 'Shoulder strength priority' },
            { name: 'Assisted pull-ups', sets: 3, reps: '8', target_weight_kg: null, progression_note: 'Band progression: heavy → medium → light → none. Goal: first unassisted pull-up' },
            { name: 'Seated cable row (wide grip)', sets: 3, reps: '10-12', target_weight_kg: null, progression_note: 'Back volume' },
            { name: 'Hack squat', sets: 3, reps: '10-12', target_weight_kg: null, progression_note: 'Quad focus — no barbell squat substitute' },
            { name: 'Cable reverse fly', sets: 2, reps: '15', target_weight_kg: null, progression_note: 'Rear delt isolation' },
            { name: 'Barbell upright row', sets: 2, reps: '12', target_weight_kg: null, progression_note: 'Shoulder + trap' },
          ],
        },
      ],
    };
  }),
};

// Deload weeks: reduce sets by ~40%
for (const week of program.weeks) {
  if (week.is_deload) {
    for (const session of week.sessions) {
      for (const ex of session.exercises) {
        ex.sets = Math.max(1, Math.round(ex.sets * 0.6));
        ex.progression_note = (ex.progression_note || '') + ' (DELOAD: reduced volume)';
      }
    }
  }
}

async function main() {
  // Deactivate any existing programs
  await admin.from('wren_program').update({ active: false }).eq('user_id', userId);

  // Insert new program
  const { data, error } = await admin.from('wren_program').insert({
    user_id: userId,
    program_json: program,
    active: true,
  }).select();

  if (error) { console.error(error); process.exit(1); }
  console.log('Program seeded:', data[0].id);
}

main().catch(e => { console.error(e); process.exit(1); });
