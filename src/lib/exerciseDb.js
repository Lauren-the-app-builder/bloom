// Exercise catalog with form tips + YouTube video IDs. Lives in its own
// module (rather than inline in BloomApp.jsx) so any component — including
// the Program editor's exercise picker — can import it without pulling in
// the whole app shell.
export const EXERCISE_DB = [
  // Glutes
  { id: "e1", name: "Hip Thrust", muscle: "Glutes", restSec: 120, tips: ["Drive through your heels, not your toes", "Squeeze glutes hard at the top — pause 1 sec", "Keep chin tucked and ribs down", "Bar over your hips, feet shoulder-width"], videoId: "LM8XHLYJoYs" },
  { id: "e4", name: "Cable Kickback", muscle: "Glutes", restSec: 60, tips: ["Squeeze glute, not lower back", "Slow eccentric — control the return", "Keep hips square to the cable"], videoId: "SqO-VUEAg7I" },
  { id: "e5", name: "Hip Abduction", muscle: "Glutes", restSec: 60, tips: ["Lean forward slightly to target upper glutes", "Pause at the top of each rep", "Don't use momentum"], videoId: "WJaRlwBFRyo" },
  { id: "e17", name: "B-Stance Hip Thrust", muscle: "Glutes", restSec: 90, tips: ["Back foot lightly braces only", "Drive through working leg's heel", "Keep hips level"], videoId: "1qHQXUzdsWA" },
  { id: "e18", name: "Glute Bridge", muscle: "Glutes", restSec: 60, tips: ["Squeeze at the top", "Posterior pelvic tilt", "Pause 1-2 seconds at top"], videoId: "wPM8icPu6H8" },
  { id: "e19", name: "Single-Leg Hip Thrust", muscle: "Glutes", restSec: 90, tips: ["Drive through heel", "Keep hips square", "Slow eccentric"], videoId: "lYUqpQRtcxg" },
  { id: "e20", name: "Cable Pull-Through", muscle: "Glutes", restSec: 75, tips: ["Hinge at hips, soft knees", "Squeeze glutes at lockout", "Keep back flat"], videoId: "GtVPcTTV3OE" },

  // Hamstrings
  { id: "e2", name: "Romanian Deadlift", muscle: "Hamstrings", restSec: 120, tips: ["Hinge at the hips, not the knees", "Bar stays close to your legs", "Feel a deep stretch in your hamstrings", "Neutral spine — no rounding"], videoId: "JCXUYuzwNrM" },
  { id: "e21", name: "DB Romanian Deadlift", muscle: "Hamstrings", restSec: 90, tips: ["Hinge from hips", "Slight knee bend", "Feel hamstring stretch"], videoId: "FQ_xN0Nu24w" },
  { id: "e22", name: "Lying Leg Curl", muscle: "Hamstrings", restSec: 60, tips: ["Slow eccentric — 3 seconds down", "Squeeze at the top", "Hips down on the pad"], videoId: "1Tq3QdYUuHs" },
  { id: "e23", name: "Seated Leg Curl", muscle: "Hamstrings", restSec: 60, tips: ["Full range of motion", "Pause at the bottom of the squeeze", "Don't slam the weight"], videoId: "ELOCsoDSmrg" },
  { id: "e24", name: "Stiff-Leg Deadlift", muscle: "Hamstrings", restSec: 120, tips: ["Minimal knee bend", "Bar travels in straight line", "Stretch then snap hips through"], videoId: "M3-71XBmUpA" },
  { id: "e25", name: "Nordic Curl", muscle: "Hamstrings", restSec: 90, tips: ["Lower as slowly as possible", "Catch with hands if needed", "Brace core hard"], videoId: "p2qvwm1tM0A" },

  // Quads / Legs
  { id: "e3", name: "Bulgarian Split Squat", muscle: "Quads/Glutes", restSec: 90, tips: ["Front foot far enough that knee tracks over ankle", "Lean slightly forward for glute focus", "Lower under control — 2 sec down", "Drive through full foot"], videoId: "2C-uNgKwPLE" },
  { id: "e13", name: "Back Squat", muscle: "Quads", restSec: 150, tips: ["Brace core hard before each rep", "Knees track over toes", "Hit at least parallel", "Drive chest up out of the hole"], videoId: "ultWZbUMPL8" },
  { id: "e14", name: "Leg Press", muscle: "Quads", restSec: 120, tips: ["Feet shoulder-width", "Don't lock out knees", "Control the descent"], videoId: "IZxyjW7MPJQ" },
  { id: "e15", name: "Walking Lunge", muscle: "Quads/Glutes", restSec: 90, tips: ["Long stride for glute focus", "Back knee almost touches floor", "Stay tall through the torso"], videoId: "L8fvypPrzzs" },
  { id: "e26", name: "Front Squat", muscle: "Quads", restSec: 150, tips: ["Elbows high", "Vertical torso", "Sit between your knees"], videoId: "tlfahNdNPPI" },
  { id: "e27", name: "Goblet Squat", muscle: "Quads", restSec: 75, tips: ["Hold weight at chest", "Sit straight down", "Knees out"], videoId: "MeIiIdhvXT4" },
  { id: "e28", name: "Hack Squat", muscle: "Quads", restSec: 120, tips: ["Feet mid-platform", "Full depth", "Drive through whole foot"], videoId: "EdtaJRBqwes" },
  { id: "e29", name: "Leg Extension", muscle: "Quads", restSec: 60, tips: ["Pause at the top", "Slow eccentric", "Don't swing"], videoId: "YyvSfVjQeL0" },
  { id: "e30", name: "Step-Up", muscle: "Quads/Glutes", restSec: 75, tips: ["Drive through front heel", "Don't push off back foot", "Keep chest up"], videoId: "5xx2sV2bmwI" },
  { id: "e31", name: "Reverse Lunge", muscle: "Quads/Glutes", restSec: 75, tips: ["Step back long", "Front knee over ankle", "Drive through front heel"], videoId: "xrPteyQLGAo" },

  // Calves
  { id: "e32", name: "Standing Calf Raise", muscle: "Calves", restSec: 60, tips: ["Full stretch at bottom", "Pause at the top", "Slow tempo"], videoId: "gwLzBJYoWlI" },
  { id: "e33", name: "Seated Calf Raise", muscle: "Calves", restSec: 60, tips: ["Hits the soleus more", "Pause at top and bottom", "High reps work best"], videoId: "JbyjNymZOt0" },

  // Chest / Push
  { id: "e6", name: "DB Bench Press", muscle: "Chest", restSec: 90, tips: ["Retract shoulder blades, slight arch", "Lower DBs to mid-chest level", "Press in a slight arc inward", "Feet planted firmly"], videoId: "VmB1G1K7v94" },
  { id: "e7", name: "Incline DB Press", muscle: "Upper chest", restSec: 90, tips: ["Bench at 30° (not too steep)", "Elbows ~45° from torso", "Full range of motion"], videoId: "8iPEnn-ltC8" },
  { id: "e34", name: "Barbell Bench Press", muscle: "Chest", restSec: 150, tips: ["Retract shoulder blades", "Lower to mid-chest", "Drive feet into floor"], videoId: "rT7DgCr-3pg" },
  { id: "e35", name: "Incline Barbell Press", muscle: "Upper chest", restSec: 120, tips: ["30-45° incline", "Bar to upper chest", "Elbows tucked slightly"], videoId: "SrqOu55lrYU" },
  { id: "e36", name: "Cable Fly", muscle: "Chest", restSec: 60, tips: ["Slight elbow bend", "Squeeze at midline", "Slow stretch"], videoId: "Iwe6AmxVf7o" },
  { id: "e37", name: "Pec Deck", muscle: "Chest", restSec: 60, tips: ["Squeeze hard at midline", "Pause 1 sec", "Don't go too deep on the stretch"], videoId: "Z57CtFmRMxA" },
  { id: "e38", name: "Push-Up", muscle: "Chest", restSec: 60, tips: ["Body in a straight line", "Lower chest to floor", "Elbows ~45°"], videoId: "IODxDxX7oi4" },
  { id: "e39", name: "Dip", muscle: "Chest/Triceps", restSec: 90, tips: ["Lean forward for chest", "Vertical for triceps", "Don't go below 90° if shoulders complain"], videoId: "wjUmnZH528Y" },

  // Shoulders
  { id: "e8", name: "Lateral Raise", muscle: "Side delts", restSec: 60, tips: ["Lead with elbows, not hands", "Raise to shoulder height — no higher", "Slight forward lean"], videoId: "3VcKaXpzqRo" },
  { id: "e16", name: "Barbell Overhead Press", muscle: "Shoulders", restSec: 150, tips: ["Brace core, squeeze glutes", "Bar starts at collarbone", "Press straight up, head through at lockout", "Don't flare elbows excessively"], videoId: "2yjwXTZQDDI" },
  { id: "e40", name: "Seated DB Press", muscle: "Shoulders", restSec: 90, tips: ["Sit upright, brace core", "Press in a slight arc", "Don't lock out hard"], videoId: "qEwKCR5JCog" },
  { id: "e41", name: "Cable Lateral Raise", muscle: "Side delts", restSec: 60, tips: ["Pulley at hip height", "Lead with elbow", "Squeeze at the top"], videoId: "PPrzBnZ9hLU" },
  { id: "e42", name: "Rear Delt Fly", muscle: "Rear delts", restSec: 60, tips: ["Hinge at hips", "Pull elbows wide and back", "Squeeze rear delts"], videoId: "ttvfGg9d76c" },
  { id: "e43", name: "Face Pull", muscle: "Rear delts", restSec: 60, tips: ["Pull to forehead", "External rotation at the top", "Elbows high"], videoId: "rep-qVOkqgk" },
  { id: "e44", name: "Front Raise", muscle: "Front delts", restSec: 60, tips: ["Slight bend in elbow", "Raise to eye level", "Slow lower"], videoId: "-t7fuZ0KhDA" },
  { id: "e45", name: "Arnold Press", muscle: "Shoulders", restSec: 90, tips: ["Start palms in", "Rotate as you press", "Full range of motion"], videoId: "3ml7BH7mNwQ" },

  // Back / Pull
  { id: "e9", name: "Lat Pulldown", muscle: "Lats", restSec: 90, tips: ["Pull elbows down and back", "Squeeze lats at the bottom", "Don't lean back excessively"], videoId: "CAwf7n6Luuc" },
  { id: "e10", name: "Seated Cable Row", muscle: "Mid back", restSec: 90, tips: ["Chest up, shoulders down", "Pull to lower ribs", "Squeeze shoulder blades"], videoId: "GZbfZ033f74" },
  { id: "e46", name: "Pull-Up", muscle: "Lats", restSec: 120, tips: ["Full hang at the bottom", "Drive elbows down", "Chin over bar"], videoId: "eGo4IYlbE5g" },
  { id: "e46b", name: "Assisted Pull-Ups", muscle: "Lats", restSec: 120, loadType: "bands", tips: ["Stack bands as needed to hit your target reps", "Drive elbows down, chin over bar", "Slow eccentric — 2 sec down", "10 reps = ready to pick a lighter combo"], videoId: "eGo4IYlbE5g" },
  { id: "e47", name: "Chin-Up", muscle: "Lats/Biceps", restSec: 120, tips: ["Underhand grip", "Squeeze at the top", "Slow lower"], videoId: "brhRXlOhsAM" },
  { id: "e48", name: "Barbell Row", muscle: "Mid back", restSec: 120, tips: ["Hinge to ~45°", "Pull to belly button", "Don't shrug"], videoId: "9efgcAjQe7E" },
  { id: "e49", name: "DB Row", muscle: "Lats", restSec: 75, tips: ["Pull elbow back, not up", "Squeeze at the top", "Don't rotate torso"], videoId: "pYcpY20QaE8" },
  { id: "e50", name: "Cable Row (close grip)", muscle: "Mid back", restSec: 75, tips: ["Pull handles to belly", "Squeeze blades together", "Slow eccentric"], videoId: "GZbfZ033f74" },
  { id: "e51", name: "Straight-Arm Pulldown", muscle: "Lats", restSec: 60, tips: ["Slight elbow bend", "Pull bar to thighs", "Feel the lats"], videoId: "kiuVA0gs3EI" },
  { id: "e52", name: "Conventional Deadlift", muscle: "Back/Posterior", restSec: 180, tips: ["Bar over mid-foot", "Brace hard", "Drive through floor"], videoId: "op9kVnSso6Q" },
  { id: "e53", name: "Trap Bar Deadlift", muscle: "Back/Quads", restSec: 150, tips: ["More quad than barbell DL", "Stand up tall", "Brace core"], videoId: "B-aVuyhvLHU" },
  { id: "e54", name: "Shrug", muscle: "Traps", restSec: 60, tips: ["Straight up, not rolling", "Pause at the top", "Heavy weight, full range"], videoId: "g6qbq4Lf1FI" },

  // Biceps
  { id: "e11", name: "DB Curl", muscle: "Biceps", restSec: 60, tips: ["Elbows pinned at sides", "Full supination at the top", "Slow eccentric"], videoId: "ykJmrZ5v0Oo" },
  { id: "e55", name: "Barbell Curl", muscle: "Biceps", restSec: 75, tips: ["Elbows pinned", "No swinging", "Full range of motion"], videoId: "kwG2ipFRgfo" },
  { id: "e56", name: "Hammer Curl", muscle: "Biceps/Brachialis", restSec: 60, tips: ["Neutral grip", "Elbows pinned", "Slow eccentric"], videoId: "TwD-YGVP4Bk" },
  { id: "e57", name: "Preacher Curl", muscle: "Biceps", restSec: 60, tips: ["Don't lock out at the bottom", "Slow eccentric", "Squeeze at the top"], videoId: "fIWP-FRFNU0" },
  { id: "e58", name: "Cable Curl", muscle: "Biceps", restSec: 60, tips: ["Constant tension", "Elbows pinned", "Squeeze at the top"], videoId: "85pHm0fbsTI" },
  { id: "e59", name: "Incline DB Curl", muscle: "Biceps", restSec: 60, tips: ["Bench at ~45°", "Stretch at the bottom", "Slow eccentric"], videoId: "soxrZlIl35U" },

  // Triceps
  { id: "e12", name: "Tricep Pushdown", muscle: "Triceps", restSec: 60, tips: ["Elbows pinned, only forearms move", "Squeeze at the bottom", "Don't lean over the bar"], videoId: "2-LAMcpzODU" },
  { id: "e60", name: "Skull Crusher", muscle: "Triceps", restSec: 75, tips: ["Lower bar to forehead", "Elbows in line", "Don't flare"], videoId: "d_KZxkY_0cM" },
  { id: "e61", name: "Overhead Tricep Extension", muscle: "Triceps", restSec: 60, tips: ["Stretch at the bottom", "Elbows close to head", "Full lockout"], videoId: "_gsUck-7M74" },
  { id: "e62", name: "Close-Grip Bench", muscle: "Triceps", restSec: 90, tips: ["Hands shoulder-width", "Elbows tucked", "Lower to mid-chest"], videoId: "nEF0bv2FW94" },
  { id: "e63", name: "Tricep Kickback", muscle: "Triceps", restSec: 60, tips: ["Elbow stays high", "Squeeze at the back", "Don't rotate"], videoId: "ZWdBqFLNljc" },
  { id: "e64", name: "Rope Pushdown", muscle: "Triceps", restSec: 60, tips: ["Spread rope at the bottom", "Squeeze hard", "Slow eccentric"], videoId: "vB5OHsJ3EME" },

  // Core
  { id: "e65", name: "Plank", muscle: "Core", restSec: 60, tips: ["Squeeze glutes", "Brace abs hard", "Body in a straight line"], videoId: "ASdvN_XEl_c" },
  { id: "e66", name: "Hanging Leg Raise", muscle: "Core", restSec: 60, tips: ["Don't swing", "Curl pelvis up", "Lower slowly"], videoId: "Pr1ieGZ5atk" },
  { id: "e67", name: "Cable Crunch", muscle: "Core", restSec: 60, tips: ["Round your back", "Bring elbows to thighs", "Flex hard at bottom"], videoId: "fcQbPkRrLi0" },
  { id: "e68", name: "Pallof Press", muscle: "Core", restSec: 45, tips: ["Resist rotation", "Press straight out", "Slow and controlled"], videoId: "AH_QZLm_0-s" },
  { id: "e69", name: "Ab Wheel Rollout", muscle: "Core", restSec: 75, tips: ["Brace abs", "Don't sag", "Slow tempo"], videoId: "rqiTPdK1c_I" },

  // Cardio / Conditioning
  { id: "e70", name: "Treadmill Incline Walk", muscle: "Cardio", restSec: 0, tips: ["Steep incline (12%+)", "3-3.5 mph", "Don't hold rails"], videoId: "L_RYg9k8mtA" },
  { id: "e71", name: "Stair Climber", muscle: "Cardio", restSec: 0, tips: ["Don't lean on rails", "Full step", "Steady cadence"], videoId: "WCEgzPiTKYI" },
  { id: "e72", name: "Assault Bike", muscle: "Cardio", restSec: 0, tips: ["Drive with legs", "Push-pull arms", "Steady breathing"], videoId: "wvDJfdvBKlY" },
];
