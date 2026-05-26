// One-shot: wipe and re-seed bloom_workouts for the seed user.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(resolve(here, 'bloom-export.json'), 'utf8'));

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const user = list.users.find((u) => (u.email || '').toLowerCase() === process.env.SEED_EMAIL.toLowerCase());
if (!user) { console.error('user not found'); process.exit(1); }
const userId = user.id;
console.log('user:', user.email, userId);

// Wipe existing workouts for this user.
const { error: delErr } = await admin.from('bloom_workouts').delete().eq('user_id', userId);
if (delErr) { console.error(delErr); process.exit(1); }
console.log('✓ wiped existing workouts');

// Reinsert the seeded workouts.
const workouts = (data['bloom:myWorkouts'] || []).map((w) => ({
  id: w.id,
  user_id: userId,
  name: w.name,
  exercises: w.exercises || [],
  scene: w.scene || null,
  tag: w.tag || null,
  supersets: w.supersets || [],
  targets: w.targets || {},
  rests: w.rests || {},
}));
const { error } = await admin.from('bloom_workouts').upsert(workouts, { onConflict: 'id' });
if (error) { console.error(error); process.exit(1); }
console.log(`✓ reinserted ${workouts.length} workouts`);
