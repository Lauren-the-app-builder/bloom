import { useState, useMemo, useEffect, useRef, createContext, useContext } from "react";

// ---------- Units context ----------
const UnitsContext = createContext({ unit: "kg", setUnit: () => {} });
const useUnit = () => useContext(UnitsContext).unit;
const incrementFor = (unit, isLower) => unit === "kg" ? (isLower ? 5 : 2.5) : (isLower ? 10 : 5);

// Parse a user-typed weight/reps string. Accepts both "1.5" and "1,5" decimals
// so European-style commas don't silently become 0. Returns 0 on empty/garbage.
const toNum = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

// Progressive overload bump: 5% of current weight, rounded to the nearest
// 0.5 (kg) or 1 (lb), with a sensible floor so tiny lifts still see progress.
function bumpWeight(currentWeight, unit, isLower) {
  const w = Number(currentWeight) || 0;
  if (!w) return w;
  const pctJump = w * 0.05;
  const step = unit === "kg" ? 0.5 : 1;
  const minBump = unit === "kg" ? (isLower ? 2.5 : 1) : (isLower ? 5 : 2);
  const raw = Math.max(pctJump, minBump);
  const rounded = Math.round(raw / step) * step;
  return +(w + rounded).toFixed(1);
}
import {
  Home,
  Dumbbell,
  Sparkles,
  Plus,
  TrendingUp,
  Clock,
  Trophy,
  ChevronRight,
  ChevronLeft,
  Send,
  Check,
  X,
  Search,
  Play,
  Pause,
  Heart,
  Timer,
  History,
  Calendar,
  Leaf,
  Star,
  Target,
  Pencil,
  Settings,
  RefreshCw,
  Link2,
  Link2Off,
} from "lucide-react";
import { useLocalState, recordSession, getSessions, getLastSession, updateSession, deleteSession, load, save, getActiveProgram, getMissedSessions, ensureSessionAOrder, ensureSessionCLegCurl } from "./lib/storage";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import { subscribeToPush, scheduleRestPush, cancelRestPush } from "./lib/push";
import WrenView from "./components/wren/WrenView";
import TodayView from "./components/wren/TodayView";
import NudgeCard from "./components/wren/NudgeCard";
import MissedSessionBanner from "./components/wren/MissedSessionBanner";
import PostSessionReaction from "./components/wren/PostSessionReaction";
import { askWren } from "./lib/wren";
import { SCENES, SceneSvg, defaultSceneFor } from "./lib/scenes.jsx";

// ---------- design tokens ----------
const c = {
  blush: "#F4B8D4",
  blushLight: "#FBEFEC",
  cream: "#FFFFFF",
  bg: "#FFFFFF",
  paper: "#FDF9F9",
  rose: "#C8B4E8",
  rosedeep: "#C97AAE",
  charcoal: "#5A5266",
  muted: "#9A92A6",
  faint: "#C4B8CE",
  line: "#F0E8EE",
  white: "#FFFFFF",
};

// per-workout gradient backgrounds (assigned by muscle group)
const WORKOUT_GRADIENTS = {
  Glutes: "linear-gradient(160deg, #C8B4E8 0%, #F4B8D4 50%, #FFD3B8 100%)",
  Push: "linear-gradient(160deg, #B4D4F0 0%, #C8B4E8 50%, #F4B8D4 100%)",
  Pull: "linear-gradient(160deg, #FFD3B8 0%, #F4B8D4 50%, #C8B4E8 100%)",
  Legs: "linear-gradient(160deg, #B8E8D4 0%, #C8B4E8 50%, #F4B8D4 100%)",
  Default: "linear-gradient(160deg, #C8B4E8 0%, #F4B8D4 50%, #FFD3B8 100%)",
};
function gradientFor(name) {
  if (!name) return WORKOUT_GRADIENTS.Default;
  const n = name.toLowerCase();
  if (n.includes("glute")) return WORKOUT_GRADIENTS.Glutes;
  if (n.includes("push") || n.includes("chest") || n.includes("shoulder")) return WORKOUT_GRADIENTS.Push;
  if (n.includes("pull") || n.includes("back")) return WORKOUT_GRADIENTS.Pull;
  if (n.includes("leg") || n.includes("squat") || n.includes("quad")) return WORKOUT_GRADIENTS.Legs;
  return WORKOUT_GRADIENTS.Default;
}

// ---------- exercise database with form tips + YouTube video IDs ----------
const EXERCISE_DB = [
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

// ---------- focus lift data (Barbell Overhead Press) ----------
const FOCUS_LIFT = {
  name: "Barbell Overhead Press",
  startedTracking: "Feb 10",
  // volume day = top set of 12, strength day = top set of 6
  volumeHistory: [
    { date: "Feb 10", weight: 55, reps: 12 },
    { date: "Feb 17", weight: 60, reps: 12 },
    { date: "Feb 24", weight: 60, reps: 12 },
    { date: "Mar 3", weight: 65, reps: 11 },
    { date: "Mar 10", weight: 65, reps: 12 },
    { date: "Mar 17", weight: 70, reps: 10 },
    { date: "Mar 24", weight: 70, reps: 12 },
    { date: "Mar 31", weight: 75, reps: 10 },
  ],
  strengthHistory: [
    { date: "Feb 13", weight: 75, reps: 6 },
    { date: "Feb 20", weight: 80, reps: 6 },
    { date: "Feb 27", weight: 80, reps: 6 },
    { date: "Mar 6", weight: 85, reps: 5 },
    { date: "Mar 13", weight: 85, reps: 6 },
    { date: "Mar 20", weight: 90, reps: 5 },
    { date: "Mar 27", weight: 90, reps: 6 },
    { date: "Apr 3", weight: 95, reps: 5 },
  ],
};

// ---------- seed PRs ----------
const SEED_PRS = [];

// ---------- rest-end phrase library ----------
// Spoken when the inter-set rest timer runs out (unless a custom voice
// recording is set, which always wins). Selected one is stored at
// localStorage["bloom:restPhrase"].
const REST_PHRASES = [
  "Next set, bitch!",
  "Let's go, get up.",
  "Up. Move it.",
  "You got this.",
  "One more set.",
  "Bring it.",
  "Back to work.",
  "Time's up — lift.",
  "Stand up, queen.",
  "Make it count.",
];
const DEFAULT_REST_PHRASE = REST_PHRASES[0];

// ---------- seed last sessions (for "last time" recall) ----------
const LAST_SESSIONS = {
  "Glute Focus": {
    date: "Mar 30",
    exercises: {
      "Hip Thrust": [{ reps: 8, weight: 95 }, { reps: 8, weight: 95 }, { reps: 8, weight: 95 }, { reps: 8, weight: 95 }],
      "Romanian Deadlift": [{ reps: 10, weight: 85 }, { reps: 10, weight: 85 }, { reps: 10, weight: 85 }],
      "Bulgarian Split Squat": [{ reps: 10, weight: 25 }, { reps: 10, weight: 25 }, { reps: 10, weight: 25 }],
    },
  },
};

// Estimate workout duration from history if available, else fallback to ~12 min/lift
function estimateMinutes(workout, sessions) {
  const matches = (sessions || []).filter(s => s.workoutName === workout.name && s.durationSec);
  if (matches.length) {
    const avg = matches.reduce((a, s) => a + s.durationSec, 0) / matches.length;
    return Math.max(5, Math.round(avg / 60));
  }
  return workout.exercises.length * 12;
}

// ---------- main ----------
export default function BloomApp() {
  const [tab, setTab] = useState("home");
  // Idempotent program fixups: reorder Session A (lat pulldown → cable face
  // pull) and swap Session C's barbell upright row for a lying leg curl.
  // Re-run after a sync pulls a fresh program from the server.
  useEffect(() => {
    const runFixups = () => { ensureSessionAOrder(); ensureSessionCLegCurl(); };
    runFixups();
    window.addEventListener("bloom:synced", runFixups);
    return () => window.removeEventListener("bloom:synced", runFixups);
  }, []);

  // iOS 17+: setting the audio session to "ambient" lets the rest-timer beep
  // and TTS mix with whatever music the user is already playing instead of
  // pausing it. Silently noops on browsers that don't support it.
  useEffect(() => {
    try {
      if (typeof navigator !== "undefined" && navigator.audioSession) {
        navigator.audioSession.type = "ambient";
      }
    } catch {}
  }, []);
  const [myWorkouts, setMyWorkouts] = useLocalState("myWorkouts", [
    { id: "w1", name: "Glute Focus", exercises: ["Hip Thrust", "Romanian Deadlift", "Bulgarian Split Squat"] },
    { id: "w2", name: "Push Day", exercises: ["DB Bench Press", "Incline DB Press", "Lateral Raise"] },
    { id: "w3", name: "Pull Day", exercises: ["Lat Pulldown", "Seated Cable Row", "DB Curl"] },
  ]);
  // weekly schedule: 0=Sun ... 6=Sat. null = rest day
  const [schedule, setSchedule] = useLocalState("schedule", { 0: null, 1: "w1", 2: "w2", 3: null, 4: "w3", 5: "w1", 6: null });
  const [showSchedule, setShowSchedule] = useState(false);
  const [showFocusLift, setShowFocusLift] = useState(false);
  const [showWeek, setShowWeek] = useState(false);
  const [activeWorkout, setActiveWorkout] = useState(null); // workout being viewed
  const [inProgress, setInProgress] = useState(null); // workout currently running
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState(null);
  const [customExercises, setCustomExercises] = useLocalState("customExercises", []);
  const [unit, setUnit] = useLocalState("unit", "kg");
  const [exerciseNotes, setExerciseNotes] = useLocalState("exerciseNotes", {});
  const [focusLiftName, setFocusLiftName] = useLocalState("focusLiftName", "Barbell Overhead Press");
  const allExercises = useMemo(() => [...EXERCISE_DB, ...customExercises], [customExercises]);
  const [lastSessions, setLastSessions] = useLocalState("lastSessions", LAST_SESSIONS);
  const [importHistoryFor, setImportHistoryFor] = useState(null); // workout object to import history for
  const [backfillFor, setBackfillFor] = useState(null); // workout object to log past session for
  const [sessionsBump, setSessionsBump] = useState(0); // re-render trigger when sessions change
  const [showLibrary, setShowLibrary] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExProgress, setShowExProgress] = useState(null); // exercise name or null
  const WREN_GREETING = { from: "coach", text: "Hi Lauren! I'm Wren 🌙 — your coach. I can see your workouts, PRs, schedule, and history. Try asking 'what should I do today?' or 'am I plateauing on hip thrust?'" };
  const [chatHistory, setChatHistory] = useLocalState("chatHistory", []); // [{id, title, createdAt, updatedAt, messages}]
  const [currentChatId, setCurrentChatId] = useState(null);
  const [chat, setChat] = useState([WREN_GREETING]);
  const [chatInput, setChatInput] = useState("");
  const [coachContext, setCoachContext] = useLocalState("coachContext", []);

  // Each time the user opens the Coach tab, start a fresh chat (unless they're loading a historical one)
  const startNewChat = () => {
    setCurrentChatId(null);
    setChat([WREN_GREETING]);
    setChatInput("");
  };
  const loadChat = (id) => {
    const c = chatHistory.find(x => x.id === id);
    if (!c) return;
    setCurrentChatId(id);
    setChat(c.messages);
  };
  // Persist current chat to history whenever it gets a real exchange
  const persistCurrentChat = (msgs) => {
    const realMessages = msgs.filter(m => m.text !== "…");
    const hasUserTurn = realMessages.some(m => m.from === "user");
    if (!hasUserTurn) return;
    const firstUser = realMessages.find(m => m.from === "user");
    const title = firstUser ? firstUser.text.slice(0, 40) : "New chat";
    if (currentChatId) {
      setChatHistory(chatHistory.map(c => c.id === currentChatId ? { ...c, messages: realMessages, updatedAt: Date.now(), title } : c));
    } else {
      const id = `ch${Date.now()}`;
      setCurrentChatId(id);
      setChatHistory([{ id, title, createdAt: Date.now(), updatedAt: Date.now(), messages: realMessages }, ...chatHistory]);
    }
  };
  const deleteChatFromHistory = (id) => {
    setChatHistory(chatHistory.filter(c => c.id !== id));
    if (currentChatId === id) startNewChat();
  };

  const applyWrenActions = (actions) => {
    if (!actions || !actions.length) return;
    let nextWorkouts = [...myWorkouts];
    let nextSchedule = { ...schedule };
    for (const a of actions) {
      if (a.type === "create_workout" && a.name && Array.isArray(a.exercises)) {
        nextWorkouts.push({
          id: `c${Date.now()}${Math.random().toString(36).slice(2,5)}`,
          name: a.name,
          exercises: a.exercises,
          scene: a.scene || undefined,
          targets: a.targets || {},
          tag: a.tag || null,
          supersets: Array.isArray(a.supersets) ? a.supersets.filter(g => Array.isArray(g) && g.length >= 2) : [],
        });
      } else if (a.type === "delete_workout" && a.name) {
        const target = nextWorkouts.find(w => w.name === a.name);
        nextWorkouts = nextWorkouts.filter(w => w.name !== a.name);
        if (target) for (const d of Object.keys(nextSchedule)) if (nextSchedule[d] === target.id) nextSchedule[d] = null;
      } else if (a.type === "add_exercises" && a.workoutName && Array.isArray(a.exercises)) {
        nextWorkouts = nextWorkouts.map(w => w.name === a.workoutName ? { ...w, exercises: [...w.exercises, ...a.exercises.filter(e => !w.exercises.includes(e))] } : w);
      } else if (a.type === "remove_exercises" && a.workoutName && Array.isArray(a.exercises)) {
        nextWorkouts = nextWorkouts.map(w => w.name === a.workoutName ? { ...w, exercises: w.exercises.filter(e => !a.exercises.includes(e)) } : w);
      } else if (a.type === "set_schedule" && typeof a.day === "number") {
        const w = nextWorkouts.find(x => x.name === a.workoutName);
        nextSchedule[a.day] = w ? w.id : null;
      } else if (a.type === "set_target" && a.workoutName && a.exercise && a.reps) {
        nextWorkouts = nextWorkouts.map(w => w.name === a.workoutName ? { ...w, targets: { ...(w.targets || {}), [a.exercise]: a.reps } } : w);
      }
    }
    setMyWorkouts(nextWorkouts);
    setSchedule(nextSchedule);
  };

  const sendChat = async () => {
    if (!chatInput.trim()) return;
    const userMsg = { from: "user", text: chatInput };
    const currentInput = chatInput;
    setChat([...chat, userMsg, { from: "coach", text: "…" }]);
    setChatInput("");
    setCoachContext([...coachContext, currentInput]);

    try {
      const { reply, actions } = await askWren(currentInput, {
        myWorkouts,
        schedule,
        sessions: getSessions(),
        history: chat.slice(-10),
        exerciseDb: EXERCISE_DB.map(e => e.name),
        unit,
      });
      applyWrenActions(actions);
      setChat(ch => {
        const next = [...ch];
        next[next.length - 1] = { from: "coach", text: reply, actions };
        persistCurrentChat(next);
        return next;
      });
    } catch {
      setChat(ch => {
        const next = [...ch];
        next[next.length - 1] = { from: "coach", text: "Couldn't reach Wren — check your connection." };
        return next;
      });
    }
  };

  return (
    <UnitsContext.Provider value={{ unit, setUnit }}>
    <div style={{
      position: "fixed", top: 0, bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 430,
      background: c.cream, fontFamily: "'Inter', system-ui, sans-serif", color: c.charcoal,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>

        {/* Two views: Today + Wren, toggled by bottom nav */}
        {tab === "home" && (<>
          {/* Today header with history + settings */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 16px 0", flexShrink: 0 }}>
            <button
              onClick={() => setShowWeek(true)}
              title="Workout history"
              style={{ width: 32, height: 32, borderRadius: "50%", background: "white", border: `1px solid ${c.line}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <History size={13} color={c.muted} />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              style={{ width: 32, height: 32, borderRadius: "50%", background: "white", border: `1px solid ${c.line}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <Settings size={13} color={c.muted} />
            </button>
          </div>
          <TodayView
            onStartWorkout={(w) => { setInProgress(w); }}
            sessionsBump={sessionsBump}
            onAskWren={() => setTab("coach")}
          />
        </>)}
        {tab === "coach" && (
          <WrenView
            schedule={schedule}
            myWorkouts={myWorkouts}
            unit={unit}
            allExercises={allExercises}
            sessionsBump={sessionsBump}
            onOpenSettings={() => setShowSettings(true)}
            onStartWorkout={(w) => { setInProgress(w); setTab("home"); }}
          />
        )}

        {activeWorkout && !inProgress && (
          <WorkoutPreview
            onExerciseTap={(name) => setShowExProgress(name)}
            key={`preview-${sessionsBump}`}
            workout={activeWorkout}
            lastSessions={lastSessions}
            exerciseNotes={exerciseNotes}
            allExercises={allExercises}
            onBackfill={() => { setBackfillFor(activeWorkout); setActiveWorkout(null); }}
            onClose={() => setActiveWorkout(null)}
            onStart={() => {
              setInProgress(activeWorkout);
              setActiveWorkout(null);
            }}
            onEdit={() => {
              setEditingWorkout(activeWorkout);
              setShowBuilder(true);
              setActiveWorkout(null);
            }}
          />
        )}

        {inProgress && <ActiveWorkout workout={inProgress} lastSessions={lastSessions} exerciseNotes={exerciseNotes} setExerciseNotes={setExerciseNotes} allExercises={allExercises} myWorkouts={myWorkouts} setMyWorkouts={setMyWorkouts} onFinish={() => { setInProgress(null); setSessionsBump(b => b + 1); }} />}

        {showFocusLift && <FocusLiftView onClose={() => setShowFocusLift(false)} focusLiftName={focusLiftName} setFocusLiftName={setFocusLiftName} allExercises={allExercises} />}

        {showLibrary && <LibraryView onClose={() => setShowLibrary(false)} allExercises={allExercises} customExercises={customExercises} setCustomExercises={setCustomExercises} />}

        {showWeek && <WeekOverview onClose={() => setShowWeek(false)} onSessionsChange={() => setSessionsBump(b => b + 1)} />}

        {showExport && <ExportDataModal onClose={() => setShowExport(false)} />}

        {showSettings && (
          <SettingsModal
            onClose={() => setShowSettings(false)}
            onExport={() => { setShowSettings(false); setShowExport(true); }}
            unit={unit}
            setUnit={setUnit}
          />
        )}

        {showExProgress && (
          <ExerciseProgressView
            exerciseName={showExProgress}
            onClose={() => setShowExProgress(null)}
          />
        )}

        {showSchedule && (
          <ScheduleModal
            schedule={schedule}
            myWorkouts={myWorkouts}
            onClose={() => setShowSchedule(false)}
            onSave={(s) => { setSchedule(s); setShowSchedule(false); }}
          />
        )}

        {showBuilder && (
          <BuilderModal
            existing={editingWorkout}
            allExercises={allExercises}
            onAddCustom={(ex) => setCustomExercises([...customExercises, ex])}
            onClose={() => { setShowBuilder(false); setEditingWorkout(null); }}
            onSave={(w) => {
              if (editingWorkout) {
                setMyWorkouts(myWorkouts.map(x => x.id === w.id ? w : x));
              } else {
                setMyWorkouts([...myWorkouts, w]);
                setImportHistoryFor(w);
              }
              setShowBuilder(false);
              setEditingWorkout(null);
            }}
          />
        )}

        {importHistoryFor && (
          <ImportHistoryModal
            workout={importHistoryFor}
            onClose={() => setImportHistoryFor(null)}
            onSave={(data) => {
              setLastSessions({ ...lastSessions, [importHistoryFor.name]: data });
              setImportHistoryFor(null);
            }}
          />
        )}

        {backfillFor && (
          <ImportHistoryModal
            workout={backfillFor}
            mode="backfill"
            onClose={() => setBackfillFor(null)}
            onSave={(data) => {
              const list = load("sessions", []);
              list.push({
                workoutName: backfillFor.name,
                tag: backfillFor.tag || null,
                exercises: data.exercises,
                durationSec: 0,
                finishedAt: data.finishedAt,
              });
              save("sessions", list);
              setSessionsBump(b => b + 1);
              setBackfillFor(null);
            }}
          />
        )}

        {/* Bottom nav — Today + Wren */}
        {!inProgress && (
          <nav style={{
            display: "flex", justifyContent: "space-around", alignItems: "center",
            padding: "10px 0 22px", borderTop: `1px solid ${c.line}`,
            background: "rgba(255,255,255,0.95)", backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)", flexShrink: 0,
          }}>
            <button onClick={() => setTab("home")} style={{
              background: "none", border: "none", cursor: "pointer", padding: "4px 20px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            }}>
              <Dumbbell size={20} color={tab === "home" ? c.rosedeep : c.muted} strokeWidth={tab === "home" ? 2.5 : 2} />
              <span style={{ fontSize: 10, fontWeight: tab === "home" ? 700 : 500, color: tab === "home" ? c.rosedeep : c.muted }}>Today</span>
            </button>
            <button onClick={() => setTab("coach")} style={{
              background: "none", border: "none", cursor: "pointer", padding: "4px 20px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            }}>
              <Sparkles size={20} color={tab === "coach" ? c.rosedeep : c.muted} strokeWidth={tab === "coach" ? 2.5 : 2} />
              <span style={{ fontSize: 10, fontWeight: tab === "coach" ? 700 : 500, color: tab === "coach" ? c.rosedeep : c.muted }}>Wren</span>
            </button>
          </nav>
        )}
      </div>
    </div>
    </UnitsContext.Provider>
  );
}

function NavBtn({ icon: Icon, label, tint, active, onClick }) {
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", padding: 0 }}>
      <div style={{
        width: 46, height: 46, borderRadius: "50%",
        background: tint,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: active ? `0 4px 12px ${tint}, 0 0 0 2px ${c.charcoal}` : "0 2px 6px rgba(0,0,0,0.06)",
        transition: "box-shadow 0.2s",
      }}>
        <Icon size={20} strokeWidth={2} color="white" />
      </div>
      <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? c.charcoal : c.muted }}>{label}</span>
    </button>
  );
}

// ---------- HOME ----------
function HomeView({ setTab, myWorkouts, setActiveWorkout, coachContext, schedule, setShowSchedule, setShowFocusLift, setShowWeek, sessionsBump, unit }) {
  const today = new Date().getDay();
  const todayId = schedule[today];
  const todayWorkout = myWorkouts.find((w) => w.id === todayId);
  // Mon-first display order; values are JS day-of-week indices (0=Sun..6=Sat)
  const weekOrder = [1, 2, 3, 4, 5, 6, 0];
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  // Check if today's scheduled workout was already finished today.
  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }, []);
  const doneToday = useMemo(() => todayWorkout && getSessions().some(s =>
    s.workoutName === todayWorkout.name &&
    Number(s.finishedAt) >= todayStart &&
    !(s.workoutName || '').includes('(past entry)')
  ), [todayWorkout, todayStart, sessionsBump]);
  // Real "this week" stats
  const scheduledCount = Object.values(schedule || {}).filter(Boolean).length;
  const startOfThisWeek = (() => {
    const d = new Date(); d.setHours(0,0,0,0);
    const off = d.getDay() === 0 ? 6 : d.getDay() - 1; // days since Monday
    d.setDate(d.getDate() - off);
    return d.getTime();
  })();
  // Count only real finished workouts (not "(past entry)" focus-lift logs).
  // Dedupe by (workoutName, day) so duplicate sync writes don't double-count.
  const completedThisWeek = useMemo(() => {
    const seen = new Set();
    let n = 0;
    for (const s of getSessions()) {
      const t = Number(s.finishedAt);
      if (!t || t < startOfThisWeek) continue;
      // Skip focus-lift manual entries — those aren't full workouts.
      if ((s.workoutName || '').includes('(past entry)')) continue;
      // Skip backfilled sessions with no duration (logged via History, not
      // by actually doing the workout this week).
      if (s.durationSec === 0 && !s.workoutName) continue;
      const dayKey = new Date(t).toDateString() + '|' + (s.workoutName || '');
      if (seen.has(dayKey)) continue;
      seen.add(dayKey);
      n += 1;
    }
    return n;
  }, [startOfThisWeek, sessionsBump]);
  return (
    <div style={{ padding: "8px 24px" }}>
      {/* Missed session banner */}
      <MissedSessionBanner schedule={schedule} myWorkouts={myWorkouts} sessionsBump={sessionsBump} setTab={setTab} setActiveWorkout={setActiveWorkout} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <SectionTitle title="Today's Workout" />
        <button onClick={() => setShowSchedule(true)} style={{ background: "none", border: "none", color: c.rosedeep, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          <Calendar size={14} /> Schedule
        </button>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {weekOrder.map((dayIdx, i) => {
          const has = schedule[dayIdx];
          const isToday = dayIdx === today;
          return (
            <div key={dayIdx} style={{ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 12, background: isToday ? c.rosedeep : has ? c.blush : c.white, color: isToday ? "white" : c.charcoal, border: `1px solid ${isToday ? c.rosedeep : c.line}` }}>
              <p style={{ fontSize: 10, margin: 0, opacity: 0.7 }}>{dayNames[i]}</p>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: has ? (isToday ? "white" : c.rosedeep) : "transparent", margin: "4px auto 0" }} />
            </div>
          );
        })}
      </div>
      {todayWorkout && doneToday && (
        <div
          style={{
            width: "100%", border: "none", padding: 0, margin: "0 0 20px",
            borderRadius: 24, overflow: "hidden",
            position: "relative", display: "block", height: 220,
            boxShadow: "0 16px 36px rgba(180,140,200,0.22)",
          }}
        >
          <SceneSvg id={todayWorkout.scene || defaultSceneFor(todayWorkout.name)} />
          <div style={{ position: "absolute", top: 22, left: 22, right: 22, color: "white", zIndex: 2 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", opacity: 0.92, textShadow: "0 1px 4px rgba(0,0,0,0.25)", margin: 0 }}>Today · Done</p>
            <p style={{ fontSize: 22, fontWeight: 600, margin: "4px 0 0", letterSpacing: -0.3, textShadow: "0 2px 6px rgba(0,0,0,0.25)" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <div style={{ position: "absolute", bottom: 22, left: 22, right: 22, color: "white", textAlign: "left", zIndex: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Leaf size={18} color="white" strokeWidth={2} style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }} />
              <p style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: -0.4, textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>{todayWorkout.name} — complete</p>
            </div>
            <p style={{ fontSize: 12, margin: "4px 0 0", opacity: 0.95, display: "flex", alignItems: "center", gap: 6, textShadow: "0 1px 4px rgba(0,0,0,0.2)" }}>
              <span style={{ display: "inline-block", width: 4, height: 4, borderRadius: "50%", background: "white" }} />
              Great work — rest and recover
            </p>
          </div>
        </div>
      )}
      {todayWorkout && !doneToday && (
        <button
          onClick={() => setActiveWorkout(todayWorkout)}
          style={{
            width: "100%", border: "none", padding: 0, margin: "0 0 20px",
            borderRadius: 24, overflow: "hidden", cursor: "pointer",
            position: "relative", display: "block", height: 220,
            boxShadow: "0 16px 36px rgba(180,140,200,0.28)",
          }}
        >
          <SceneSvg id={todayWorkout.scene || defaultSceneFor(todayWorkout.name)} />
          <div style={{ position: "absolute", top: 22, left: 22, right: 22, color: "white", zIndex: 2 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", opacity: 0.92, textShadow: "0 1px 4px rgba(0,0,0,0.25)", margin: 0 }}>Today · Ready to go</p>
            <p style={{ fontSize: 22, fontWeight: 600, margin: "4px 0 0", letterSpacing: -0.3, textShadow: "0 2px 6px rgba(0,0,0,0.25)" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <div style={{ position: "absolute", bottom: 22, left: 22, right: 22, color: "white", textAlign: "left", zIndex: 2 }}>
            <p style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: -0.4, textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>{todayWorkout.name}</p>
            <p style={{ fontSize: 12, margin: "6px 0 0", opacity: 0.95, display: "flex", alignItems: "center", gap: 6, textShadow: "0 1px 4px rgba(0,0,0,0.25)" }}>
              <span style={{ display: "inline-block", width: 4, height: 4, borderRadius: "50%", background: "white" }} />
              {todayWorkout.exercises.length} lifts · ~{estimateMinutes(todayWorkout, getSessions())} min
            </p>
          </div>
        </button>
      )}
      {!todayWorkout && (
        <div style={{
          position: "relative", borderRadius: 24, overflow: "hidden",
          marginBottom: 20, height: 220,
          boxShadow: "0 16px 36px rgba(180,140,200,0.22)",
        }}>
          <SceneSvg id="lavender-hills" />
          <div style={{ position: "absolute", top: 22, left: 22, right: 22, color: "white", zIndex: 2 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", opacity: 0.92, textShadow: "0 1px 4px rgba(0,0,0,0.25)", margin: 0 }}>Today</p>
            <p style={{ fontSize: 22, fontWeight: 600, margin: "4px 0 0", letterSpacing: -0.3, textShadow: "0 2px 6px rgba(0,0,0,0.25)" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <div style={{ position: "absolute", bottom: 22, left: 22, right: 22, color: "white", zIndex: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Leaf size={18} color="white" strokeWidth={2} style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.3))" }} />
              <p style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: -0.4, textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>Rest day</p>
            </div>
            <p style={{ fontSize: 12, margin: "4px 0 0", opacity: 0.95, display: "flex", alignItems: "center", gap: 6, textShadow: "0 1px 4px rgba(0,0,0,0.2)" }}>
              <span style={{ display: "inline-block", width: 4, height: 4, borderRadius: "50%", background: "white" }} />
              Recovery is where the magic happens
            </p>
          </div>
        </div>
      )}

      <button onClick={() => setShowWeek(true)} style={{ width: "100%", textAlign: "left", background: "linear-gradient(180deg, #A8C8E8 0%, #D4C4E4 50%, #F4C8D4 100%)", border: "none", borderRadius: 24, padding: 24, marginBottom: 20, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 12px 28px rgba(180,140,200,0.22)" }}>
        <div>
          <p style={{ fontSize: 11, color: "white", fontWeight: 700, letterSpacing: 1.2, margin: 0, opacity: 0.92, textTransform: "uppercase" }}>This Week</p>
          <h2 style={{ fontSize: 34, margin: "8px 0 4px", fontWeight: 700, letterSpacing: -1, color: "white", textShadow: "0 2px 6px rgba(0,0,0,0.15)" }}>
            {completedThisWeek}{scheduledCount > 0 ? ` / ${scheduledCount}` : ""}
          </h2>
          <p style={{ fontSize: 12, color: "white", margin: 0, opacity: 0.9 }}>
            {completedThisWeek === 1 ? "workout" : "workouts"} done this week{scheduledCount > 0 ? " · tap for history" : " · tap for history"}
          </p>
        </div>
        <ChevronRight size={22} color="white" />
      </button>

      {/* focus lift card */}
      <button
        onClick={() => setShowFocusLift(true)}
        style={{ width: "100%", background: c.white, border: `1px solid ${c.line}`, borderRadius: 20, padding: 18, marginBottom: 20, textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <div>
          <p style={{ fontSize: 11, color: c.rosedeep, fontWeight: 700, margin: 0, letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 5 }}>
            <Star size={12} fill={c.rosedeep} color={c.rosedeep} /> FOCUS LIFT
          </p>
          <p style={{ fontSize: 16, fontWeight: 600, margin: "4px 0 2px" }}>{FOCUS_LIFT.name}</p>
          <p style={{ fontSize: 12, color: c.muted, margin: 0 }}>Tracking volume + strength progress</p>
        </div>
        <ChevronRight size={18} color={c.muted} />
      </button>

      {/* Wren nudge card */}
      <NudgeCard schedule={schedule} myWorkouts={myWorkouts} sessionsBump={sessionsBump} setTab={setTab} setActiveWorkout={setActiveWorkout} />

      {(() => {
        const prs = load("prs", {});
        const prList = Object.entries(prs)
          .map(([lift, data]) => ({ lift, ...data }))
          .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        if (!prList.length) return null;
        return (<>
          <SectionTitle title="Personal Records" subtitle="Your all-time bests" />
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, marginBottom: 24, marginTop: 12 }}>
            {prList.map((pr, i) => (
              <div key={i} style={{ background: c.white, borderRadius: 18, padding: 16, border: `1px solid ${c.line}`, minWidth: 150 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg, #FFD700, #FFA500)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Trophy size={16} color="white" strokeWidth={2.2} />
                </div>
                <p style={{ fontSize: 12, color: c.muted, margin: "10px 0 2px" }}>{pr.lift}</p>
                <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: c.rosedeep }}>{pr.weight}{unit} x {pr.reps}</p>
                <p style={{ fontSize: 11, color: c.muted, margin: "4px 0 0" }}>{pr.date}</p>
              </div>
            ))}
          </div>
        </>);
      })()}

      {coachContext.length > 0 && (
        <div style={{ background: c.blushLight, border: `1px solid ${c.blush}`, borderRadius: 16, padding: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Sparkles size={16} color={c.rosedeep} style={{ marginTop: 2 }} />
          <p style={{ fontSize: 12, color: c.charcoal, margin: 0, lineHeight: 1.5 }}>
            Wren is personalizing your training based on what you've shared. Keep chatting to refine your plan.
          </p>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <div>
      <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: -0.3 }}>{title}</h3>
      {subtitle && <p style={{ fontSize: 12, color: c.muted, margin: "2px 0 0" }}>{subtitle}</p>}
    </div>
  );
}

// ---------- WORKOUTS ----------
function WorkoutsView({ myWorkouts, setMyWorkouts, schedule, setSchedule, setActiveWorkout, setShowBuilder, setEditingWorkout, setShowLibrary }) {
  const openEdit = (w) => { setEditingWorkout(w); setShowBuilder(true); };
  const [editMode, setEditMode] = useState(false);
  const deleteWorkout = (id, name) => {
    setMyWorkouts(myWorkouts.filter(w => w.id !== id));
    if (schedule && setSchedule) {
      const next = { ...schedule };
      for (const day of Object.keys(next)) {
        if (next[day] === id) next[day] = null;
      }
      setSchedule(next);
    }
  };
  return (
    <div style={{ padding: "8px 24px" }}>
      <button
        onClick={() => setShowBuilder(true)}
        style={{ width: "100%", background: "linear-gradient(160deg, #C8B4E8 0%, #F4B8D4 55%, #FFD3B8 100%)", border: "none", borderRadius: 22, padding: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", marginBottom: 12, color: "white", fontWeight: 700, fontSize: 15, boxShadow: "0 12px 28px rgba(180,140,200,0.28)", textShadow: "0 1px 4px rgba(0,0,0,0.18)" }}
      >
        <Plus size={18} /> Build a workout
      </button>
      <button
        onClick={() => setShowLibrary(true)}
        style={{ width: "100%", background: c.white, border: `1px solid ${c.line}`, borderRadius: 16, padding: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", marginBottom: 20, color: c.charcoal, fontWeight: 600, fontSize: 13 }}
      >
        <Search size={15} /> Browse exercise library
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <SectionTitle title="My Workouts" subtitle={`${myWorkouts.length} saved`} />
        {myWorkouts.length > 0 && (
          <button
            onClick={() => setEditMode(!editMode)}
            style={{ background: "none", border: "none", color: c.rosedeep, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            {editMode ? "Done" : "Edit"}
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {myWorkouts.map((w) => (
          <div key={w.id} style={{ position: "relative" }}>
            <button
              onClick={() => editMode ? openEdit(w) : setActiveWorkout(w)}
              style={{
                width: "100%", border: "none", padding: 0,
                borderRadius: 22, overflow: "hidden",
                cursor: editMode ? "default" : "pointer",
                color: "white",
                boxShadow: "0 10px 24px rgba(180,140,200,0.22)",
                position: "relative", height: 72, display: "block",
              }}
            >
              <SceneSvg id={w.scene || defaultSceneFor(w.name)} />
              <div style={{ position: "absolute", inset: 0, padding: "0 18px", display: "flex", justifyContent: "space-between", alignItems: "center", color: "white", textAlign: "left" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, margin: 0, textShadow: "0 2px 6px rgba(0,0,0,0.3)" }}>{w.name}</p>
                  <p style={{ fontSize: 11, opacity: 0.95, margin: "2px 0 0", textShadow: "0 1px 4px rgba(0,0,0,0.25)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {w.exercises.length} lifts
                  </p>
                </div>
                {!editMode && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(w); }}
                      style={{ background: "rgba(255,255,255,0.3)", backdropFilter: "blur(10px)", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer" }}
                      title="Edit workout"
                    >
                      <Pencil size={13} color="white" />
                    </button>
                    <div style={{ background: "rgba(255,255,255,0.3)", backdropFilter: "blur(10px)", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ChevronRight size={16} color="white" />
                    </div>
                  </div>
                )}
              </div>
            </button>
            {editMode && (
              <>
                <div style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.85)", borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: c.charcoal, display: "flex", alignItems: "center", gap: 4, pointerEvents: "none" }}>
                  <Pencil size={11} /> Tap to edit
                </div>
                <button
                  onClick={() => deleteWorkout(w.id, w.name)}
                  style={{ position: "absolute", top: -8, right: -8, background: "white", border: `2px solid ${c.rosedeep}`, borderRadius: "50%", width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
                  title="Delete workout"
                >
                  <X size={14} color={c.rosedeep} strokeWidth={3} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- WORKOUT PREVIEW (with last session + targets) ----------
function WorkoutPreview({ workout, onClose, onStart, onBackfill, onEdit, onExerciseTap, lastSessions = LAST_SESSIONS, exerciseNotes = {}, allExercises = EXERCISE_DB }) {
  // Prefer most recent recorded session; fall back to imported lastSessions seed
  const last = (() => {
    const recorded = getLastSession(workout.name);
    if (recorded) return { date: new Date(recorded.finishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }), exercises: recorded.exercises };
    return lastSessions[workout.name];
  })();
  const unit = useUnit();
  const inc = incrementFor(unit, /barbell|squat|deadlift|hip thrust|leg press|rdl/i.test(workout.name));
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: c.cream, width: "100%", maxWidth: 430, maxHeight: "90vh", borderRadius: "28px 28px 0 0", overflowY: "auto" }}>
        <div style={{ padding: "20px 24px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${c.line}`, position: "sticky", top: 0, background: c.cream, zIndex: 2 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{workout.name}</h2>
          <div style={{ display: "flex", gap: 6 }}>
            {onEdit && <button onClick={onEdit} style={iconBtn} title="Edit workout"><Pencil size={16} color={c.muted} /></button>}
            <button onClick={onClose} style={iconBtn}><X size={18} /></button>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          {last && (
            <div style={{ background: c.blushLight, borderRadius: 16, padding: 14, marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
              <History size={16} color={c.rosedeep} style={{ marginTop: 2 }} />
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: c.rosedeep, margin: 0 }}>LAST SESSION · {last.date}</p>
                <p style={{ fontSize: 12, color: c.charcoal, margin: "4px 0 0", lineHeight: 1.5 }}>You'll see what you did last time and your target for today on each set.</p>
              </div>
            </div>
          )}

          <SectionTitle title="Exercises" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12, marginBottom: 20 }}>
            {workout.exercises.map((exName, i) => {
              const ex = allExercises.find((e) => e.name === exName);
              // Search across all sessions for this exercise (not just same-workout).
              const lastEx = last?.exercises?.[exName] || (() => {
                const all = getSessions().filter(s => !(s.workoutName || '').includes('(past entry)')).sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
                for (const s of all) { if (s.exercises?.[exName]?.length) return s.exercises[exName]; }
                return null;
              })();
              const ssGroup = (workout.supersets || []).findIndex(g => g.includes(exName));
              const ssLetter = ssGroup !== -1 ? String.fromCharCode(65 + workout.supersets[ssGroup].indexOf(exName)) : null;
              const targetReps = workout.targets?.[exName];
              return (
                <div key={i} style={{ background: c.white, borderRadius: 16, padding: 14, border: ssGroup !== -1 ? `1.5px solid ${c.blush}` : `1px solid ${c.line}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, margin: 0, flex: 1, minWidth: 0 }}>
                      {ssLetter && <span style={{ fontSize: 10, fontWeight: 700, color: c.rosedeep, background: c.blushLight, padding: "2px 6px", borderRadius: 6, marginRight: 8, letterSpacing: 0.5 }}>SUPERSET {ssLetter}</span>}
                      <button onClick={() => onExerciseTap && onExerciseTap(exName)} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textDecoration: "underline dotted", textDecorationColor: c.rose, textUnderlineOffset: 3 }}>{exName}</button>
                    </p>
                    {targetReps && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: c.rosedeep, background: c.blushLight, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
                        Target: {targetReps} reps
                      </span>
                    )}
                  </div>
                  {(() => {
                    const restSec = workout.rests?.[exName] || ex?.restSec || 90;
                    return (
                      <p style={{ fontSize: 12, color: c.muted, margin: "4px 0 0" }}>
                        {ex?.muscle || "—"} · Rest {Math.floor(restSec / 60)}:{String(restSec % 60).padStart(2, "0")}
                      </p>
                    );
                  })()}
                  {lastEx && lastEx.length > 0 && (() => {
                    // Same progressive-overload rule as ActiveWorkout:
                    //  - working weight = mode of last session
                    //  - bump only if every set AT that weight hit target reps
                    //  - bump = 5% of weight, min 1kg upper / 2.5kg lower
                    const counts = new Map();
                    for (const s of lastEx) {
                      const w = Number(s.weight);
                      if (isFinite(w)) counts.set(w, (counts.get(w) || 0) + 1);
                    }
                    let workingW = null, bestC = -1, bestI = -1;
                    for (const [w, count] of counts) {
                      const lastIdx = [...lastEx].map(s => Number(s.weight)).lastIndexOf(w);
                      if (count > bestC || (count === bestC && lastIdx > bestI)) {
                        workingW = w; bestC = count; bestI = lastIdx;
                      }
                    }
                    const setsAt = lastEx.filter((s) => Number(s.weight) === workingW);
                    const allHit = !!(targetReps && setsAt.length > 0 && setsAt.every((s) => Number(s.reps) >= targetReps));
                    const isLowerEx = /barbell|squat|deadlift|hip thrust|leg press|rdl/i.test(exName);
                    const nextW = allHit ? bumpWeight(workingW, unit, isLowerEx) : workingW;
                    const minRepsAtWorking = Math.min(...setsAt.map((s) => Number(s.reps)));
                    return (
                      <div style={{ marginTop: 10, padding: "8px 12px", background: c.cream, borderRadius: 10 }}>
                        <p style={{ fontSize: 11, color: c.muted, margin: 0 }}>
                          Last: {setsAt.length}×{minRepsAtWorking} @ {workingW}{unit}
                          {targetReps ? ` · target ${targetReps}` : ""}
                        </p>
                        {(() => {
                          const previewPerSet = setsAt.map(x => Math.min(Number(x.reps) + 1, targetReps || 99));
                          const previewMsg = allHit
                            ? `Go up ${unit === "kg" ? "2-5" : "5-10"}${unit} from ${workingW}${unit} ✨`
                            : `Stay at ${workingW}${unit} — aim for ${previewPerSet.join(", ")} reps`;
                          return <p style={{ fontSize: 11, color: c.rosedeep, margin: "2px 0 0", fontWeight: 600 }}>{previewMsg}</p>;
                        })()}
                      </div>
                    );
                  })()}
                  {exerciseNotes[exName] && (
                    <div style={{ marginTop: 8, padding: "8px 12px", background: c.blushLight, borderRadius: 10, borderLeft: `3px solid ${c.rosedeep}` }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: c.rosedeep, margin: 0, letterSpacing: 0.5 }}>NOTE</p>
                      <p style={{ fontSize: 12, color: c.charcoal, margin: "2px 0 0", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{exerciseNotes[exName]}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button onClick={onStart} style={{ width: "100%", background: c.charcoal, color: "white", border: "none", padding: 18, borderRadius: 16, fontSize: 16, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Play size={18} fill="white" /> Start Workout
          </button>
          {onBackfill && (
            <button onClick={onBackfill} style={{ width: "100%", marginTop: 10, background: "none", color: c.muted, border: `1px solid ${c.line}`, padding: 12, borderRadius: 14, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <History size={14} /> Log a past session
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- ACTIVE WORKOUT (gymshark-style) ----------
function ActiveWorkout({ workout, onFinish, lastSessions = LAST_SESSIONS, exerciseNotes = {}, setExerciseNotes = () => {}, allExercises = EXERCISE_DB, myWorkouts, setMyWorkouts }) {
  const [editingNote, setEditingNote] = useState(null); // exercise name
  const [noteDraft, setNoteDraft] = useState("");
  const openNote = (name) => { setEditingNote(name); setNoteDraft(exerciseNotes[name] || ""); };
  const saveNote = () => {
    const next = { ...exerciseNotes };
    if (noteDraft.trim()) next[editingNote] = noteDraft.trim();
    else delete next[editingNote];
    setExerciseNotes(next);
    setEditingNote(null);
    setNoteDraft("");
  };
  const removeNote = (name) => {
    const next = { ...exerciseNotes };
    delete next[name];
    setExerciseNotes(next);
  };
  // Prefer most recent recorded session; fall back to imported lastSessions seed
  const last = (() => {
    const recorded = getLastSession(workout.name);
    if (recorded) return { date: new Date(recorded.finishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }), exercises: recorded.exercises };
    return lastSessions[workout.name];
  })();
  const unit = useUnit();
  const [targets, setTargets] = useState(workout.targets || {});
  // Persist target changes back to the workout template.
  const updateTarget = (exName, reps) => {
    const next = { ...targets, [exName]: reps };
    setTargets(next);
    // Update all unfilled rows for this exercise.
    setSets((cur) => cur.map((ex) =>
      ex.name === exName
        ? { ...ex, rows: ex.rows.map((r) => r.done ? r : { ...r, targetReps: reps }) }
        : ex
    ));
    // Save to the workout template permanently.
    if (myWorkouts && setMyWorkouts) {
      setMyWorkouts((wks) =>
        wks.map((w) => w.id === workout.id ? { ...w, targets: next } : w)
      );
    }
  };
  // Progressive overload rule:
  //   - The user picks a TOP rep (e.g. target=10 means top of range = 10).
  //   - "Working weight" = the most common weight across last session's sets
  //     (handles top-single + back-off setups: 30, 25, 27, 27 → working = 27).
  //   - Stay at that weight until EVERY set at that weight hit the top of
  //     the range. Only then bump.
  //   - Bump amount = `inc` by default; Wren can override per-exercise via
  //     the "Ask Wren for the jump" button.
  const workingWeightFromLast = (lastEx) => {
    if (!lastEx || !lastEx.length) return null;
    const counts = new Map();
    for (const s of lastEx) {
      const w = Number(s.weight);
      if (!isFinite(w)) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
    if (!counts.size) return null;
    // Pick highest count; tie-break by most recent (last in list).
    let best = null, bestCount = -1, bestIdx = -1;
    for (const [w, count] of counts) {
      const lastIdx = [...lastEx].map(s => Number(s.weight)).lastIndexOf(w);
      if (count > bestCount || (count === bestCount && lastIdx > bestIdx)) {
        best = w; bestCount = count; bestIdx = lastIdx;
      }
    }
    return best;
  };
  // For each exercise, find the most recent session containing it (across ALL
  // workouts, not just this one). Falls back to `last` (same-workout session).
  const allSessionsForLookup = getSessions().filter(s => !(s.workoutName || '').includes('(past entry)')).sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
  const lastExForName = (name) => {
    if (last?.exercises?.[name]) return last.exercises[name];
    for (const s of allSessionsForLookup) {
      if (s.exercises?.[name]?.length) return s.exercises[name];
    }
    return null;
  };

  const perExerciseSuggestion = (name) => {
    const lastEx = lastExForName(name);
    const tReps = targets[name];
    if (!lastEx || !lastEx.length) return null;
    const lastWeight = workingWeightFromLast(lastEx);
    if (lastWeight == null) return null;
    // Only consider sets performed at the working weight when judging "hit it".
    const setsAtWorking = lastEx.filter((s) => Number(s.weight) === lastWeight);
    const allHit = !!(tReps && setsAtWorking.length > 0 && setsAtWorking.every((s) => Number(s.reps) >= tReps));
    const isLower = /barbell|squat|deadlift|hip thrust|leg press|rdl/i.test(name);
    return {
      lastWeight,
      lastSets: setsAtWorking.length,
      allHit,
      nextWeight: allHit ? bumpWeight(lastWeight, unit, isLower) : lastWeight,
      nextReps: tReps || null,
    };
  };
  const [exerciseGoals, setExerciseGoals] = useState(() => {
    const map = {};
    workout.exercises.forEach((name) => {
      const s = perExerciseSuggestion(name);
      const tReps = targets[name];
      if (!s) {
        map[name] = workout.deload
          ? "Deload week — keep it light and smooth, leave plenty in the tank."
          : "First time! Find a working weight you can hit for 8–10 reps.";
        return;
      }
      if (workout.deload) {
        const target = Math.round(s.lastWeight * 0.9 * 2) / 2;
        map[name] = `Deload week — drop to ~${target}${unit}${tReps ? `, ${tReps} easy reps` : ''}. Fewer sets, focus on form.`;
        return;
      }
      if (s.allHit) {
        // All sets hit the top of range → go up in weight.
        const low = unit === "kg" ? 2 : 5;
        const high = unit === "kg" ? 5 : 10;
        map[name] = `You hit ${tReps} on every set at ${s.lastWeight}${unit} — go up ${low}-${high}${unit} today 🎯`;
      } else if (tReps) {
        // Show per-set "+1 rep" targets from last session.
        const lastSets = (lastExForName(name) || [])
          .filter(x => Number(x.weight) === s.lastWeight);
        if (lastSets.length) {
          const perSet = lastSets.map(x => Math.min(Number(x.reps) + 1, tReps));
          map[name] = `Stay at ${s.lastWeight}${unit} — aim for ${perSet.join(", ")} reps (target: ${tReps} on all).`;
        } else {
          map[name] = `Stay at ${s.lastWeight}${unit} — aim for ${tReps} reps on every set.`;
        }
      } else {
        map[name] = `Last: ${s.lastSets}×@${s.lastWeight}${unit} · aim for +1 rep per set`;
      }
    });
    return map;
  });
  const [showCoach, setShowCoach] = useState(false);
  const [coachMsgs, setCoachMsgs] = useState([
    { from: "coach", text: `You're crushing ${workout.name} today! Ask me to adjust any exercise goal — e.g. "make hip thrust easier" or "push harder on RDLs".` },
  ]);
  const [coachInput, setCoachInput] = useState("");
  // Apply Wren's actions to the live workout state mid-session.
  const applyMidWorkoutActions = (actions) => {
    if (!actions || !actions.length) return;
    setSets((cur) => {
      let next = cur.map((ex) => ({ ...ex, rows: ex.rows.map((r) => ({ ...r })) }));
      for (const a of actions) {
        if (a.type === "set_target_weight" && a.exercise && isFinite(Number(a.weight))) {
          // Update unfinished rows of this exercise to a new target weight.
          next = next.map((ex) => ex.name === a.exercise
            ? { ...ex, rows: ex.rows.map((r) => r.done ? r : { ...r, targetWeight: Number(a.weight) }) }
            : ex
          );
        } else if (a.type === "set_target" && a.exercise && a.reps) {
          next = next.map((ex) => ex.name === a.exercise
            ? { ...ex, rows: ex.rows.map((r) => r.done ? r : { ...r, targetReps: Number(a.reps) }) }
            : ex
          );
        } else if (a.type === "add_set" && a.exercise) {
          next = next.map((ex) => {
            if (ex.name !== a.exercise) return ex;
            const last = ex.rows[ex.rows.length - 1] || {};
            return {
              ...ex,
              rows: [...ex.rows, { reps: "", weight: "", done: false, targetReps: last.targetReps || "", targetWeight: last.targetWeight || "" }],
            };
          });
        } else if (a.type === "remove_exercise" && a.exercise) {
          next = next.filter((ex) => ex.name !== a.exercise);
        } else if (a.type === "set_rest" && a.exercise && isFinite(Number(a.seconds))) {
          // Handled outside setSets — update liveRests state.
        } else if (a.type === "reorder" && Array.isArray(a.order)) {
          // a.order = array of exercise names in desired order.
          const map = Object.fromEntries(next.map((ex) => [ex.name, ex]));
          const reordered = a.order.filter((n) => map[n]).map((n) => map[n]);
          const remaining = next.filter((ex) => !a.order.includes(ex.name));
          next = [...reordered, ...remaining];
        } else if (a.type === "add_exercise" && a.exercise) {
          if (!next.some((ex) => ex.name === a.exercise)) {
            const numSets = a.sets || 3;
            const tReps = a.reps || "";
            const tWeight = a.weight || "";
            next.push({
              name: a.exercise,
              rows: Array.from({ length: numSets }).map(() => ({
                reps: "", weight: "", done: false,
                targetReps: tReps, targetWeight: tWeight,
                prevReps: null, prevWeight: null,
              })),
            });
          }
        }
      }
      return next;
    });
    // Handle rest timer changes outside setSets.
    for (const a of actions) {
      if (a.type === "set_rest" && a.exercise && isFinite(Number(a.seconds))) {
        setLiveRests((r) => ({ ...r, [a.exercise]: Number(a.seconds) }));
      }
    }
  };

  const sendMidWorkoutChat = async () => {
    if (!coachInput.trim()) return;
    const u = { from: "user", text: coachInput };
    const current = coachInput;
    setCoachMsgs([...coachMsgs, u, { from: "coach", text: "…" }]);
    setCoachInput("");
    try {
      // Tell Wren what actions she can take during a live workout.
      const exNames = sets.map((ex) => ex.name).join(", ");
      const restInfo = sets.map((ex) => `${ex.name}: rest ${liveRests[ex.name] || allExercises.find(e=>e.name===ex.name)?.restSec || 90}s`).join(", ");
      const augmented = `${current}\n\n[Mid-workout context: current exercises = ${exNames}. Rest times: ${restInfo}. ` +
        `You can return actions to modify the live session: ` +
        `{type:"set_target_weight",exercise,weight}, ` +
        `{type:"set_target",exercise,reps}, ` +
        `{type:"set_rest",exercise,seconds}, ` +
        `{type:"add_set",exercise}, ` +
        `{type:"add_exercise",exercise,sets?,reps?,weight?}, ` +
        `{type:"remove_exercise",exercise}, ` +
        `{type:"reorder",order:[exercise names in new order]}.]`;
      const { reply, actions } = await askWren(augmented, {
        myWorkouts: [workout],
        schedule: {},
        sessions: getSessions(),
        // Pass mid-workout chat history in the format /api/wren expects so
        // Wren has memory of the conversation instead of restarting each turn.
        fullHistory: coachMsgs
          .filter(m => m.text && m.text !== "…")
          .slice(-8)
          .map(m => ({ role: m.from === "user" ? "user" : "assistant", content: m.text })),
        unit,
      }, true);
      applyMidWorkoutActions(actions);
      setCoachMsgs(ms => {
        const next = [...ms];
        next[next.length - 1] = { from: "coach", text: reply };
        return next;
      });
    } catch {
      setCoachMsgs(ms => {
        const next = [...ms];
        next[next.length - 1] = { from: "coach", text: "Couldn't reach Wren. Keep pushing 💪" };
        return next;
      });
    }
  };
  // Store workout start as absolute timestamp so elapsed survives app backgrounding.
  const [workoutStartedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [sets, setSets] = useState(
    workout.exercises.map((name) => {
      const lastEx = lastExForName(name);
      // Priority: configured sets count > last session's set count > default 3.
      // If the workout came with a setsConfig object (e.g. from a Wren program),
      // trust it absolutely — don't fall back to lastEx length, since old logs
      // can have a different number of sets than the program prescribes.
      const numSets = workout.setsConfig
        ? (Number(workout.setsConfig[name]) || 3)
        : (lastEx?.length || 3);
      const tReps = targets[name];
      // Use the same working-weight logic as the suggestion banner so the
      // pre-filled targetWeight matches what the recommendation says.
      const lastWeight = workingWeightFromLast(lastEx);
      const setsAtWorking = lastEx ? lastEx.filter((s) => Number(s.weight) === lastWeight) : [];
      const allHit = !!(tReps && setsAtWorking.length > 0 && setsAtWorking.every((s) => Number(s.reps) >= tReps));
      const isLowerName = /barbell|squat|deadlift|hip thrust|leg press|rdl/i.test(name);
      // Deload week: ease ~10% off the working weight (and never bump up).
      const nextWeight = lastWeight != null
        ? (workout.deload
            ? Math.round(lastWeight * 0.9 * 2) / 2
            : (allHit ? bumpWeight(lastWeight, unit, isLowerName) : lastWeight))
        : "";
      return {
        name,
        rows: Array.from({ length: numSets }).map((_, i) => {
          const lastSet = lastEx?.[i];
          return {
            reps: "",
            weight: "",
            done: false,
            targetReps: tReps || lastSet?.reps || "",
            targetWeight: nextWeight,
            prevReps: lastSet?.reps ?? null,
            prevWeight: lastSet?.weight ?? null,
          };
        }),
      };
    })
  );
  const [showFormTips, setShowFormTips] = useState(null);
  // Live-editable rest times per exercise (overrides workout.rests during this session).
  const [liveRests, setLiveRests] = useState({ ...(workout.rests || {}) });
  // Rest timer uses absolute endsAt timestamp so it survives backgrounding.
  // {endsAt: epoch ms, total: seconds, exercise: string}
  const [restTimer, setRestTimer] = useState(null);
  const [restSec, setRestSec] = useState(0); // derived remaining seconds
  const [bumpLoading, setBumpLoading] = useState({}); // exerciseName -> bool

  // Ask Wren for the next working weight on a specific lift, then apply it
  // to every row of that exercise as the new targetWeight.
  const askWrenForBump = async (name) => {
    setBumpLoading((m) => ({ ...m, [name]: true }));
    try {
      const lastEx = last?.exercises?.[name];
      const tReps = targets[name];
      const lastWeight = lastEx?.length ? Math.max(...lastEx.map((s) => Number(s.weight) || 0)) : null;
      const allHit = tReps && lastEx?.length && lastEx.every((s) => Number(s.reps) >= tReps);
      const summary = lastEx?.length
        ? lastEx.map((s, i) => `set ${i + 1}: ${s.reps}×${s.weight}${unit}`).join(", ")
        : "no prior data";
      const prompt = `Suggest the next working weight (in ${unit}) for ${name}. ` +
        `Target rep range top: ${tReps || "n/a"}. Last session — ${summary}. ` +
        `Hit top of range on every set: ${allHit ? "yes" : "no"}. ` +
        `Equipment: ${/barbell|squat|deadlift|hip thrust|leg press|rdl/i.test(name) ? "barbell/heavy compound" : "dumbbell/cable/machine"}. ` +
        `Reply with ONLY a number — the recommended next weight in ${unit}. No words.`;
      const { reply } = await askWren(prompt, {
        myWorkouts: [workout],
        sessions: getSessions(),
        unit,
      }, true);
      const num = parseFloat((reply || "").match(/\d+(\.\d+)?/)?.[0] || "");
      if (isFinite(num) && num > 0) {
        // Update all rows of this exercise to the new target weight.
        setSets((cur) => cur.map((ex) => ex.name === name
          ? { ...ex, rows: ex.rows.map((r) => ({ ...r, targetWeight: num })) }
          : ex
        ));
        setExerciseGoals((g) => ({
          ...g,
          [name]: `Wren says: try ${num}${unit}${tReps ? ` × ${tReps}` : ""} — see if you can hit every set.`,
        }));
      } else {
        setExerciseGoals((g) => ({ ...g, [name]: `Wren: ${reply?.slice(0, 140) || "couldn't decide"}` }));
      }
    } catch (err) {
      setExerciseGoals((g) => ({ ...g, [name]: `Couldn't reach Wren — ${err?.message || "unknown error"}` }));
    } finally {
      setBumpLoading((m) => ({ ...m, [name]: false }));
    }
  };

  useEffect(() => {
    // Compute elapsed from absolute start time so it stays accurate after backgrounding.
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - workoutStartedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [workoutStartedAt]);

  // Generate a 0.2s 880Hz sine WAV as a base64 data URL once, then play it
  // through an <audio> element. This is far more reliable than WebAudio on
  // iOS PWAs (which silence WebAudio when backgrounded or on silent switch).
  const beepUrlRef = useRef(null);
  const audioElRef = useRef(null);
  const getBeepUrl = () => {
    if (beepUrlRef.current) return beepUrlRef.current;
    const sampleRate = 22050;
    const seconds = 0.18;
    const numSamples = Math.floor(sampleRate * seconds);
    const dataSize = numSamples * 2; // 16-bit mono
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, dataSize, true);
    const freq = 880;
    for (let i = 0; i < numSamples; i++) {
      // Sine + simple linear fade-out so the beep doesn't click.
      const fade = 1 - i / numSamples;
      const sample = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.6 * fade;
      view.setInt16(44 + i * 2, sample * 32767, true);
    }
    const bytes = new Uint8Array(buffer);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const url = "data:audio/wav;base64," + btoa(bin);
    beepUrlRef.current = url;
    return url;
  };

  // Unlock audio + request notification permission on the first user gesture.
  // After this, subsequent .play() calls work reliably on iOS, and we can
  // fire system notifications when the app is backgrounded.
  const audioUnlockedRef = useRef(false);
  const ensureAudio = () => {
    if (audioUnlockedRef.current) return;
    try {
      const a = new Audio(getBeepUrl());
      audioElRef.current = a;
      a.muted = true;
      const p = a.play();
      if (p && typeof p.then === "function") {
        p.then(() => { a.pause(); a.currentTime = 0; a.muted = false; audioUnlockedRef.current = true; })
         .catch(() => {});
      } else {
        a.muted = false;
        audioUnlockedRef.current = true;
      }
      // Also unlock SpeechSynthesis with a silent utterance.
      if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
      // Request notification + push permission (must be in user gesture).
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().then(() => subscribeToPush()).catch(() => {});
      } else {
        subscribeToPush();
      }
    } catch {}
  };

  // In-workout bug notes — collected locally, emailed on demand.
  const [showBugReport, setShowBugReport] = useState(false);
  const [bugDraft, setBugDraft] = useState("");
  const [bugNotes, setBugNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem("bloom:bugNotes") || "[]"); } catch { return []; }
  });
  const persistBugNotes = (next) => {
    setBugNotes(next);
    try { localStorage.setItem("bloom:bugNotes", JSON.stringify(next)); } catch {}
  };

  // Speak the chosen phrase using the chosen system voice. Configured only in
  // Settings → Rest timer; no UI for changes during a workout.
  const playRestDone = () => {
    const phrase = localStorage.getItem("bloom:restPhrase") || DEFAULT_REST_PHRASE;
    const voiceName = localStorage.getItem("bloom:restVoiceName") || "";
    try {
      if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(phrase);
        if (voiceName) {
          const v = (window.speechSynthesis.getVoices() || []).find(x => x.name === voiceName);
          if (v) u.voice = v;
        }
        u.rate = 1.0; u.pitch = 1.1; u.volume = 1.0;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }
    } catch {}
    // 2. Two beeps as backup.
    const url = getBeepUrl();
    [800, 1200].forEach((delay) => {
      setTimeout(() => { try { new Audio(url).play().catch(() => {}); } catch {} }, delay);
    });
    // 3. Vibration.
    try { navigator.vibrate?.([300, 100, 300, 100, 500]); } catch {}
    // 4. System notification (fires from page — works when app is in foreground/recently backgrounded).
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Bloom", { body: "Next set, bitch!", tag: "bloom-rest-" + Date.now(), requireInteraction: false });
      }
    } catch {}
  };

  const restDonePlayedFor = useRef(null); // tracks which timer instance was played
  useEffect(() => {
    if (!restTimer) { setRestSec(0); return; }
    const timerId = restTimer.endsAt; // unique per timer instance
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((restTimer.endsAt - Date.now()) / 1000));
      setRestSec(remaining);
      if (remaining <= 0 && restDonePlayedFor.current !== timerId) {
        restDonePlayedFor.current = timerId;
        playRestDone();
      }
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [restTimer]);

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const updateRow = (ei, ri, field, val) => {
    const next = [...sets];
    next[ei].rows[ri][field] = val;
    setSets(next);
  };

  const toggleDone = (ei, ri) => {
    ensureAudio(); // unlock audio on this user gesture
    const next = [...sets];
    const row = next[ei].rows[ri];
    row.done = !row.done;
    // Autofill empty weight/reps from placeholder when marking done.
    if (row.done) {
      if (!row.weight && row.targetWeight) row.weight = String(row.targetWeight);
      if (!row.reps && row.targetReps) row.reps = String(row.targetReps);
      const name = next[ei].name;
      // Superset handling: if this exercise is in a superset group, only
      // start the rest timer when ALL exercises in the group have completed
      // their set at this row index (the round is done).
      const ssGroup = (workout.supersets || []).find((g) => g.includes(name));
      let startRest = true;
      if (ssGroup && ssGroup.length > 1) {
        const groupSets = next.filter((ex) => ssGroup.includes(ex.name));
        // If an exercise has fewer rows than ri, treat that slot as done
        // (the exercise is shorter — that round doesn't apply to it).
        const allDone = groupSets.every((ex) => !ex.rows[ri] || ex.rows[ri].done);
        if (!allDone) startRest = false;
      }
      if (startRest) {
        const customRest = liveRests[name];
        const ex = allExercises.find((e) => e.name === name);
        const rest = customRest || ex?.restSec || 90;
        setRestTimer({ endsAt: Date.now() + rest * 1000, total: rest, exercise: name });
        // Schedule a server-side push notification as backup for when the app
        // is killed. Fire-and-forget; also subscribes to push on first call.
        scheduleRestPush(rest, name);
      }
    }
    setSets(next);
  };

  const addSet = (ei) => {
    const next = [...sets];
    const lastRow = next[ei].rows[next[ei].rows.length - 1] || {};
    next[ei].rows.push({
      reps: "", weight: "", done: false,
      targetReps: lastRow.targetReps || "",
      targetWeight: lastRow.targetWeight || "",
      prevReps: null, prevWeight: null,
    });
    setSets(next);
  };

  const removeSet = (ei, ri) => {
    const next = [...sets];
    next[ei].rows.splice(ri, 1);
    setSets(next);
  };

  const removeExercise = (ei) => {
    setSets(sets.filter((_, i) => i !== ei));
  };

  // Add/replace exercise picker state.
  const [showExPicker, setShowExPicker] = useState(null); // null | { mode: "add" } | { mode: "replace", ei: number }
  const [exPickerSearch, setExPickerSearch] = useState("");
  const allLibrary = allExercises;
  const filteredExLib = allLibrary.filter(e =>
    !sets.some(s => s.name === e.name) &&
    (e.name.toLowerCase().includes(exPickerSearch.toLowerCase()) ||
     (e.muscle || "").toLowerCase().includes(exPickerSearch.toLowerCase()))
  );

  const pickExercise = (exName, permanent) => {
    if (!showExPicker) return;
    const tReps = targets[exName] || 10;
    const newEx = {
      name: exName,
      rows: [1, 2, 3].map(() => ({
        reps: "", weight: "", done: false,
        targetReps: tReps, targetWeight: "",
        prevReps: null, prevWeight: null,
      })),
    };

    if (showExPicker.mode === "add") {
      setSets(cur => [...cur, newEx]);
      if (permanent && myWorkouts && setMyWorkouts) {
        setMyWorkouts(wks => wks.map(w =>
          w.id === workout.id && !w.exercises.includes(exName)
            ? { ...w, exercises: [...w.exercises, exName] }
            : w
        ));
      }
    } else if (showExPicker.mode === "replace") {
      const oldName = sets[showExPicker.ei]?.name;
      setSets(cur => cur.map((ex, i) => i === showExPicker.ei ? newEx : ex));
      if (permanent && myWorkouts && setMyWorkouts && oldName) {
        setMyWorkouts(wks => wks.map(w =>
          w.id === workout.id
            ? { ...w, exercises: w.exercises.map(e => e === oldName ? exName : e) }
            : w
        ));
      }
    }
    setShowExPicker(null);
    setExPickerSearch("");
  };

  const adjustRest = (delta) => {
    if (!restTimer) return;
    setRestTimer({ ...restTimer, endsAt: restTimer.endsAt + delta * 1000, total: Math.max(0, restTimer.total + delta) });
  };

  const [finishSummary, setFinishSummary] = useState(null);
  const finishWorkout = () => {
    // Save session to history before closing
    const exMap = {};
    // Per-set "on track" status vs the set's target (true = hit, false = missed,
    // null = no target to judge against).
    const perSetStatus = {};
    sets.forEach(ex => {
      // Record any set that's marked done and has at least reps or weight.
      // Treat missing values as 0 (e.g. bodyweight exercises have weight=0).
      const done = [];
      const statuses = [];
      for (const r of ex.rows) {
        if (!(r.done && (r.reps !== "" || r.weight !== ""))) continue;
        const reps = toNum(r.reps);
        const weight = toNum(r.weight);
        done.push({ reps, weight });
        const tReps = Number(r.targetReps) || 0;
        const tWeight = Number(r.targetWeight) || 0;
        if (tReps && tWeight) statuses.push(weight >= tWeight && reps >= tReps);
        else if (tReps) statuses.push(reps >= tReps);
        else statuses.push(null); // no target — can't judge
      }
      if (done.length) { exMap[ex.name] = done; perSetStatus[ex.name] = statuses; }
    });
    if (Object.keys(exMap).length === 0) {
      // Nothing logged → just close, no summary screen.
      onFinish();
      return;
    }
    recordSession({ workoutName: workout.name, tag: workout.tag || null, exercises: exMap, durationSec: elapsed });
    // Compute summary stats + per-exercise progression vs last session.
    const totalSets = Object.values(exMap).reduce((n, arr) => n + arr.length, 0);
    const exNames = Object.keys(exMap);
    // History (incl. today, already recorded above) for stall detection.
    const histAll = getSessions()
      .filter(s => !(s.workoutName || '').includes('(past entry)'))
      .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
    const maxW = (setsArr) => Math.max(...setsArr.map(x => Number(x.weight) || 0));
    const sumReps = (setsArr) => setsArr.reduce((n, x) => n + (Number(x.reps) || 0), 0);
    // Same definition as Wren's plateau detector: last 3 sessions, same top
    // weight, no total-rep gain.
    const isStalled = (name) => {
      const recent = histAll.filter(s => s.exercises?.[name]?.length).slice(0, 3);
      if (recent.length < 3) return false;
      const w0 = maxW(recent[0].exercises[name]);
      const sameWeight = recent.every(s => maxW(s.exercises[name]) === w0);
      return sameWeight && sumReps(recent[0].exercises[name]) <= sumReps(recent[2].exercises[name]);
    };

    // Compare each exercise to last session, judge progress, and recommend.
    const progressions = [];
    for (const [name, todaySets] of Object.entries(exMap)) {
      const lastEx = lastExForName(name);
      const isLower = /barbell|squat|deadlift|hip thrust|leg press|rdl/i.test(name);
      const inc = incrementFor(unit, isLower);
      const tTop = Number(targets[name]) || 0;
      const todayMaxWeight = Math.max(...todaySets.map((s) => s.weight));
      const topSets = todaySets.filter((s) => s.weight === todayMaxWeight);
      const allHit = tTop > 0 && topSets.length > 0 && topSets.every((s) => s.reps >= tTop);
      const noHistory = !lastEx || !lastEx.length;
      // First-time exercise: there's no target to judge against, so per-set
      // marks should be neutral rather than guessed from the rep target alone.
      const setStatuses = noHistory ? (perSetStatus[name] || []).map(() => null) : (perSetStatus[name] || []);
      const stalled = isStalled(name);

      let status, detail;
      if (!lastEx || !lastEx.length) {
        status = "new";
      } else {
        const lastMaxWeight = Math.max(...lastEx.map((s) => s.weight));
        const lastMaxReps = Math.max(...lastEx.map((s) => s.reps));
        const todayMaxReps = Math.max(...todaySets.map((s) => s.reps));
        if (todayMaxWeight > lastMaxWeight) { status = "weight_up"; detail = `${lastMaxWeight} → ${todayMaxWeight}${unit}`; }
        else if (todayMaxReps > lastMaxReps && todayMaxWeight >= lastMaxWeight) { status = "reps_up"; detail = `${lastMaxReps} → ${todayMaxReps} reps`; }
        else status = "same";
      }

      // On track if you progressed, logged a first session, or maxed the rep
      // range (ready to go up). A stall always counts as off track.
      const onTrack = !stalled && (status === "weight_up" || status === "reps_up" || status === "new" || allHit);

      let reco;
      if (stalled) reco = `Stalled 3 sessions at ${todayMaxWeight}${unit}. Try a deload (~10% lighter) or ask Wren to swap it.`;
      else if (status === "new") reco = `First time logged — next session, start at ${todayMaxWeight}${unit} as your working weight.`;
      else if (status === "weight_up") reco = `Up to ${todayMaxWeight}${unit}. Settle in and aim for ${tTop || "the top of your range"} reps on every set.`;
      else if (allHit) reco = `You maxed the rep range — add ${inc}${unit} next time.`;
      else if (status === "reps_up") reco = `More reps at ${todayMaxWeight}${unit}. Keep adding reps, then bump the weight.`;
      else reco = `Stay at ${todayMaxWeight}${unit} and add a rep per set next time.`;

      progressions.push({ name, status, detail, sets: setStatuses, onTrack, reco });
    }
    // PR detection: compare today's best set per exercise against ALL historical sessions.
    const allSessions = getSessions();
    const newPRs = [];
    const existingPRs = load("prs", {}); // { exerciseName: { weight, reps, date } }
    const updatedPRs = { ...existingPRs };
    for (const [name, todaySets] of Object.entries(exMap)) {
      // Find today's best set: highest weight, then most reps at that weight.
      const todayBest = todaySets.reduce((a, b) => {
        if (b.weight > a.weight) return b;
        if (b.weight === a.weight && b.reps > a.reps) return b;
        return a;
      }, todaySets[0]);
      // Find all-time best across all historical sessions.
      let allTimeBest = existingPRs[name] || null;
      if (!allTimeBest) {
        // Build from session history.
        for (const s of allSessions) {
          const sets = s.exercises?.[name];
          if (!sets) continue;
          for (const set of sets) {
            if (!allTimeBest || set.weight > allTimeBest.weight || (set.weight === allTimeBest.weight && set.reps > allTimeBest.reps)) {
              allTimeBest = { weight: set.weight, reps: set.reps };
            }
          }
        }
      }
      // Is today's best a new PR?
      const isPR = !allTimeBest
        || todayBest.weight > allTimeBest.weight
        || (todayBest.weight === allTimeBest.weight && todayBest.reps > allTimeBest.reps);
      if (isPR) {
        const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
        newPRs.push({ lift: name, weight: todayBest.weight, reps: todayBest.reps, date: dateStr });
        updatedPRs[name] = { weight: todayBest.weight, reps: todayBest.reps, date: dateStr };
      }
    }
    if (Object.keys(updatedPRs).length > 0) {
      save("prs", updatedPRs);
    }
    setFinishSummary({ totalSets, exNames, durationSec: elapsed, progressions, newPRs });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: c.cream, zIndex: 100, overflowY: "auto", maxWidth: 430, margin: "0 auto" }}>
      {/* sticky header with timer */}
      <div style={{ position: "sticky", top: 0, background: c.cream, borderBottom: `1px solid ${c.line}`, padding: "20px 24px 16px", zIndex: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={onFinish} style={{ background: "none", border: "none", color: c.muted, cursor: "pointer", fontSize: 14, fontWeight: 500 }}>Cancel</button>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 11, color: c.muted, margin: 0, letterSpacing: 0.5 }}>WORKOUT TIME</p>
            <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0", color: c.charcoal, fontVariantNumeric: "tabular-nums" }}>{fmt(elapsed)}</p>
          </div>
          <button onClick={finishWorkout} style={{ background: c.rosedeep, color: "white", border: "none", padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Finish</button>
        </div>
        <p style={{ fontSize: 16, fontWeight: 600, margin: "10px 0 0", textAlign: "center" }}>{workout.name}</p>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
          <button
            onClick={() => setShowBugReport(true)}
            style={{ background: "none", border: "none", color: c.muted, fontSize: 11, cursor: "pointer", padding: "2px 6px", display: "flex", alignItems: "center", gap: 4 }}
          >
            🐞 Report a bug{bugNotes.length > 0 ? ` · ${bugNotes.length}` : ""}
          </button>
        </div>
      </div>

      {/* deload note + coach button */}
      <div style={{ padding: "16px 24px 0", display: "flex", gap: 10 }}>
        {workout.deload && (
          <div style={{ flex: 1, background: `linear-gradient(135deg, ${c.blush}, ${c.blushLight})`, borderRadius: 14, padding: "12px 14px" }}>
            <p style={{ fontSize: 10, color: c.rosedeep, fontWeight: 700, margin: 0, letterSpacing: 0.5 }}>🌙 DELOAD WEEK</p>
            <p style={{ fontSize: 13, color: c.charcoal, margin: "4px 0 0", lineHeight: 1.4 }}>
              Lighter loads and fewer sets — recover and let your body adapt.
            </p>
          </div>
        )}
        {!workout.deload && <div style={{ flex: 1 }} />}
        <button onClick={() => setShowCoach(true)} style={{ background: c.charcoal, border: "none", borderRadius: 14, width: 56, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "white", gap: 2 }}>
          <Sparkles size={18} />
          <span style={{ fontSize: 9, fontWeight: 600 }}>Coach</span>
        </button>
      </div>

      {/* exercises */}
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14, paddingBottom: 140 }}>
        {(() => {
          const supersets = workout.supersets || [];
          const groupOf = (name) => supersets.findIndex(g => g.includes(name));
          const groups = [];
          const consumed = new Set();
          sets.forEach((ex, ei) => {
            if (consumed.has(ei)) return;
            const gi = groupOf(ex.name);
            if (gi !== -1) {
              const indices = sets.map((e, i) => groupOf(e.name) === gi ? i : -1).filter(i => i !== -1);
              indices.forEach(i => consumed.add(i));
              groups.push({ type: "superset", indices });
            } else {
              groups.push({ type: "single", indices: [ei] });
            }
          });
          return groups.map((grp, gIdx) => {
            if (grp.type === "superset") {
              const exs = grp.indices.map(i => sets[i]);
              const maxRows = Math.max(...exs.map(e => e.rows.length));
              return (
                <div key={`g${gIdx}`} style={{ background: c.white, borderRadius: 18, padding: 16, border: `2px solid ${c.blush}`, position: "relative" }}>
                  <div style={{ position: "absolute", top: -10, left: 16, background: c.rosedeep, color: "white", fontSize: 9, fontWeight: 700, letterSpacing: 1, padding: "3px 10px", borderRadius: 999, display: "flex", alignItems: "center", gap: 4 }}>
                    <Link2 size={10} /> SUPERSET
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12, marginTop: 4 }}>
                    {exs.map((ex, idx) => {
                      const exData = allExercises.find(e => e.name === ex.name);
                      return (
                        <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{String.fromCharCode(65 + idx)} · {ex.name}</p>
                            <p style={{ fontSize: 10, color: c.muted, margin: "1px 0 0" }}>
                              {exData?.muscle} · target {targets[ex.name] || 10} reps
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {Array.from({ length: maxRows }).map((_, ri) => (
                    <div key={ri} style={{ background: c.cream, borderRadius: 10, padding: "8px 10px", marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <p style={{ fontSize: 9, fontWeight: 700, color: c.muted, margin: 0, letterSpacing: 0.5 }}>ROUND {ri + 1}</p>
                        {maxRows > 1 && (
                          <button
                            onClick={() => grp.indices.forEach(i => removeSet(i, ri))}
                            style={{ background: "none", border: "none", color: c.muted, cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
                            title="Remove round"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                      {exs.map((ex, idx) => {
                        const row = ex.rows[ri];
                        if (!row) return null;
                        const realEi = grp.indices[idx];
                        return (
                          <div key={idx} style={{ display: "grid", gridTemplateColumns: "16px 1fr 1fr 1fr 28px", gap: 5, alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: c.rosedeep }}>{String.fromCharCode(65 + idx)}</span>
                            <span style={{ fontSize: 10, color: c.muted }}>{row.prevReps != null && row.prevWeight != null ? `${row.prevReps}×${row.prevWeight}${unit}` : "—"}</span>
                            <input value={row.reps} onChange={(e) => updateRow(realEi, ri, "reps", e.target.value)} placeholder={row.targetReps || "0"} style={inputStyle(row.done)} />
                            <input type="text" inputMode="decimal" value={row.weight} onChange={(e) => updateRow(realEi, ri, "weight", e.target.value)} placeholder={row.targetWeight || unit} style={inputStyle(row.done)} />
                            <button onClick={() => toggleDone(realEi, ri)} style={{ background: row.done ? c.rosedeep : c.white, border: `1px solid ${row.done ? c.rosedeep : c.line}`, borderRadius: 6, width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {row.done && <Check size={14} color="white" />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  <button onClick={() => grp.indices.forEach(i => addSet(i))} style={{ width: "100%", marginTop: 4, background: c.blushLight, border: `1px dashed ${c.rose}`, borderRadius: 10, padding: 8, color: c.rosedeep, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    <Plus size={14} /> Add round
                  </button>
                </div>
              );
            }
            const ei = grp.indices[0];
            const ex = sets[ei];
            const exData = allExercises.find((e) => e.name === ex.name);
            return (
              <div key={ei} style={{ background: c.white, borderRadius: 18, padding: 16, border: `1px solid ${c.line}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{ex.name}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <p style={{ fontSize: 11, color: c.muted, margin: 0 }}>{exData?.muscle}</p>
                    <button
                      onClick={() => {
                        const cur = liveRests[ex.name] || exData?.restSec || 90;
                        const mins = prompt("Rest time (minutes):", (cur / 60).toFixed(1));
                        if (mins !== null && isFinite(parseFloat(mins))) {
                          setLiveRests((r) => ({ ...r, [ex.name]: Math.round(parseFloat(mins) * 60) }));
                        }
                      }}
                      style={{ background: c.blushLight, border: "none", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 600, color: c.rosedeep, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
                    >
                      <Timer size={10} /> {(() => {
                        const sec = liveRests[ex.name] || exData?.restSec || 90;
                        const m = Math.floor(sec / 60);
                        const r = sec % 60;
                        return r === 0 ? `${m}m` : `${m}:${String(r).padStart(2, "0")}`;
                      })()}
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => { setShowExPicker({ mode: "replace", ei }); setExPickerSearch(""); }} style={{ ...iconBtn, background: c.white }} title="Replace exercise">
                    <RefreshCw size={14} color={c.muted} />
                  </button>
                  <button onClick={() => removeExercise(ei)} style={{ ...iconBtn, background: c.white }} title="Remove exercise">
                    <X size={16} color={c.muted} />
                  </button>
                </div>
              </div>

              {/* per-exercise recommendation */}
              <div style={{ background: c.blushLight, borderRadius: 12, padding: "10px 12px", marginBottom: 10, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Sparkles size={14} color={c.rosedeep} style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, color: c.charcoal, margin: 0, lineHeight: 1.5 }}>{exerciseGoals[ex.name]}</p>
                  <button
                    onClick={() => askWrenForBump(ex.name)}
                    disabled={!!bumpLoading[ex.name]}
                    style={{ marginTop: 6, background: c.white, border: `1px solid ${c.rose}`, borderRadius: 999, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: c.rosedeep, cursor: bumpLoading[ex.name] ? "default" : "pointer", letterSpacing: 0.3, display: "inline-flex", alignItems: "center", gap: 4 }}
                  >
                    <Sparkles size={10} /> {bumpLoading[ex.name] ? "Asking Wren…" : "Ask Wren for the jump"}
                  </button>
                </div>
              </div>

              {/* note */}
              {exerciseNotes[ex.name] ? (
                <div style={{ background: c.white, borderRadius: 12, padding: "10px 12px", marginBottom: 12, border: `1px solid ${c.line}`, borderLeft: `3px solid ${c.rosedeep}`, display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <Pencil size={12} color={c.rosedeep} style={{ flexShrink: 0, marginTop: 3 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: c.rosedeep, margin: 0, letterSpacing: 0.5 }}>NOTE</p>
                    <p style={{ fontSize: 12, color: c.charcoal, margin: "2px 0 0", lineHeight: 1.4, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{exerciseNotes[ex.name]}</p>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => openNote(ex.name)} style={{ background: "none", border: "none", cursor: "pointer", color: c.muted, padding: 2 }} title="Edit note"><Pencil size={13} /></button>
                    <button onClick={() => removeNote(ex.name)} style={{ background: "none", border: "none", cursor: "pointer", color: c.muted, padding: 2 }} title="Remove note"><X size={14} /></button>
                  </div>
                </div>
              ) : (
                <button onClick={() => openNote(ex.name)} style={{ width: "100%", background: "none", border: `1px dashed ${c.line}`, borderRadius: 12, padding: "8px 12px", marginBottom: 12, color: c.muted, fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Pencil size={12} /> Add a note
                </button>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "30px 1fr 1fr 1fr 36px", gap: 8, fontSize: 10, color: c.muted, marginBottom: 6, letterSpacing: 0.5 }}>
                <span>SET</span>
                <span>PREVIOUS</span>
                <span>
                  REPS
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      const v = prompt("Target reps:", targets[ex.name] || 10);
                      if (v !== null && isFinite(parseInt(v))) updateTarget(ex.name, parseInt(v));
                    }}
                    style={{ display: "block", fontSize: 9, color: c.rosedeep, fontWeight: 600, letterSpacing: 0.3, textTransform: "none", marginTop: 1, cursor: "pointer", textDecoration: "underline dotted" }}
                  >target: {targets[ex.name] || 10}</span>
                </span>
                <span>WEIGHT</span>
                <span></span>
              </div>

              {ex.rows.map((row, ri) => (
                <div key={ri} style={{ display: "grid", gridTemplateColumns: "24px 1fr 1fr 1fr 32px 28px", gap: 6, alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: c.muted }}>{ri + 1}</span>
                    {row.targetReps && <span style={{ fontSize: 8, color: c.rosedeep, fontWeight: 700, lineHeight: 1 }}>×{row.targetReps}</span>}
                  </div>
                  <span style={{ fontSize: 11, color: c.muted }}>
                    {row.prevReps != null && row.prevWeight != null ? `${row.prevReps}×${row.prevWeight}${unit}` : "—"}
                  </span>
                  <input value={row.reps} onChange={(e) => updateRow(ei, ri, "reps", e.target.value)} placeholder={row.targetReps || "0"} style={inputStyle(row.done)} />
                  <input type="text" inputMode="decimal" value={row.weight} onChange={(e) => updateRow(ei, ri, "weight", e.target.value)} placeholder={row.targetWeight || unit} style={inputStyle(row.done)} />
                  <button onClick={() => toggleDone(ei, ri)} style={{ background: row.done ? c.rosedeep : c.white, border: `1px solid ${row.done ? c.rosedeep : c.line}`, borderRadius: 8, width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {row.done && <Check size={16} color="white" />}
                  </button>
                  <button onClick={() => removeSet(ei, ri)} style={{ background: "none", border: "none", color: c.muted, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }} title="Remove set">
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button onClick={() => addSet(ei)} style={{ width: "100%", marginTop: 8, background: c.blushLight, border: `1px dashed ${c.rose}`, borderRadius: 10, padding: 8, color: c.rosedeep, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <Plus size={14} /> Add set
              </button>
            </div>
          );
          });
        })()}

        {/* Add exercise button */}
        <button
          onClick={() => { setShowExPicker({ mode: "add" }); setExPickerSearch(""); }}
          style={{ width: "100%", marginTop: 4, background: c.white, border: `1px dashed ${c.rose}`, borderRadius: 14, padding: 12, color: c.rosedeep, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
        >
          <Plus size={14} /> Add exercise
        </button>
      </div>

      {/* Exercise picker modal (add / replace) */}
      {showExPicker && (
        <div style={{ position: "fixed", inset: 0, background: c.cream, zIndex: 250, maxWidth: 430, margin: "0 auto", display: "flex", flexDirection: "column" }}>
          {/* Header */}
          <div style={{ position: "sticky", top: 0, background: c.cream, borderBottom: `1px solid ${c.line}`, padding: "20px 24px 12px", zIndex: 5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <button onClick={() => setShowExPicker(null)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: c.charcoal, fontSize: 14, fontWeight: 500 }}>
                <ChevronLeft size={20} /> Back
              </button>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
                {showExPicker.mode === "replace" ? `Replace ${sets[showExPicker.ei]?.name || "exercise"}` : "Add exercise"}
              </p>
              <div style={{ width: 50 }} />
            </div>
            <input
              autoFocus
              type="text"
              value={exPickerSearch}
              onChange={e => setExPickerSearch(e.target.value)}
              placeholder="Search by name or muscle group..."
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1px solid ${c.line}`, background: c.white, fontSize: 14, outline: "none", color: c.charcoal }}
            />
          </div>
          {/* Exercise list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px 100px" }}>
            {filteredExLib.length === 0 && (
              <p style={{ fontSize: 13, color: c.muted, textAlign: "center", margin: "32px 0" }}>No exercises found</p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filteredExLib.map(ex => (
                <div key={ex.id || ex.name} style={{ background: c.white, border: `1px solid ${c.line}`, borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: c.charcoal }}>{ex.name}</p>
                    <p style={{ fontSize: 11, color: c.muted, margin: "2px 0 0" }}>{ex.muscle || "General"}</p>
                  </div>
                  <button
                    onClick={() => pickExercise(ex.name, false)}
                    style={{ background: c.blushLight, border: `1px solid ${c.rose}`, borderRadius: 10, padding: "8px 12px", color: c.rosedeep, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    Today
                  </button>
                  <button
                    onClick={() => pickExercise(ex.name, true)}
                    style={{ background: c.rosedeep, border: "none", borderRadius: 10, padding: "8px 12px", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    Keep
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* finish summary */}
      {finishSummary && (
        <div style={{ position: "fixed", inset: 0, background: c.cream, zIndex: 250, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "24px 24px calc(40px + env(safe-area-inset-bottom)) 24px", maxWidth: 430, margin: "0 auto", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: `linear-gradient(135deg, ${c.rose}, ${c.blush})`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, boxShadow: "0 12px 28px rgba(180,140,200,0.35)" }}>
            <Check size={42} color="white" strokeWidth={3} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: -0.5, textAlign: "center", background: `linear-gradient(90deg, ${c.rosedeep}, ${c.rose})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Workout complete
          </h1>
          <p style={{ fontSize: 14, color: c.muted, margin: "6px 0 28px", textAlign: "center" }}>
            {workout.name}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, width: "100%", marginBottom: 24 }}>
            <div style={{ background: c.white, border: `1px solid ${c.line}`, borderRadius: 16, padding: 14, textAlign: "center" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: c.muted, margin: 0, letterSpacing: 0.5 }}>TIME</p>
              <p style={{ fontSize: 20, fontWeight: 700, margin: "4px 0 0", color: c.charcoal, fontVariantNumeric: "tabular-nums" }}>{fmt(finishSummary.durationSec)}</p>
            </div>
            <div style={{ background: c.white, border: `1px solid ${c.line}`, borderRadius: 16, padding: 14, textAlign: "center" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: c.muted, margin: 0, letterSpacing: 0.5 }}>SETS</p>
              <p style={{ fontSize: 20, fontWeight: 700, margin: "4px 0 0", color: c.charcoal }}>{finishSummary.totalSets}</p>
            </div>
            <div style={{ background: c.white, border: `1px solid ${c.line}`, borderRadius: 16, padding: 14, textAlign: "center" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: c.muted, margin: 0, letterSpacing: 0.5 }}>EXERCISES</p>
              <p style={{ fontSize: 20, fontWeight: 700, margin: "4px 0 0", color: c.charcoal }}>{finishSummary.exNames.length}</p>
            </div>
          </div>
          {/* New PRs */}
          {finishSummary.newPRs && finishSummary.newPRs.length > 0 && (
            <div style={{ width: "100%", background: "linear-gradient(135deg, #FFD700 0%, #FFA500 100%)", borderRadius: 16, padding: 16, marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "white", margin: 0, letterSpacing: 0.5, textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>NEW PERSONAL RECORDS</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                {finishSummary.newPRs.map((pr, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.25)", borderRadius: 10, padding: "8px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Trophy size={14} color="white" />
                      <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: "white" }}>{pr.lift}</p>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "white" }}>{pr.weight}{unit} x {pr.reps}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Per-exercise breakdown: per-set ✓/✗ + what to do next time */}
          <div style={{ width: "100%", background: c.white, border: `1px solid ${c.line}`, borderRadius: 16, padding: 16, marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: c.muted, margin: 0, letterSpacing: 0.5 }}>HOW IT WENT</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
              {(finishSummary.progressions || []).map((p, i) => (
                <div key={i} style={{ borderLeft: `3px solid ${p.onTrack ? "#4a8a5a" : "#d98a3d"}`, paddingLeft: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: c.charcoal, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</p>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      {(p.sets && p.sets.length ? p.sets : [null]).map((ok, j) => (
                        <span key={j} title={`Set ${j + 1}`} style={{
                          width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                          background: ok === true ? "#e6f4ea" : ok === false ? "#fbe7da" : c.cream,
                          color: ok === true ? "#4a8a5a" : ok === false ? "#d98a3d" : c.muted,
                          fontSize: 11, fontWeight: 800,
                        }}>
                          {ok === true ? "✓" : ok === false ? "✕" : "·"}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: c.muted, margin: "4px 0 0", lineHeight: 1.45 }}>{p.reco}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Wren's post-session reaction */}
          <PostSessionReaction sessionData={finishSummary} workout={workout} />

          <button
            onClick={() => { setFinishSummary(null); onFinish(); }}
            style={{ width: "100%", background: c.charcoal, color: "white", border: "none", padding: 16, borderRadius: 16, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            Done
          </button>
        </div>
      )}

      {/* rest timer */}
      {restTimer && restSec > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: c.charcoal, color: "white", padding: "16px 24px 24px", borderRadius: "20px 20px 0 0", zIndex: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ fontSize: 11, opacity: 0.7, margin: 0, letterSpacing: 0.5 }}>REST · {restTimer.exercise}</p>
              <p style={{ fontSize: 32, fontWeight: 700, margin: "4px 0 0", fontVariantNumeric: "tabular-nums" }}>{fmt(restSec)}</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => adjustRest(-15)} style={timerBtn}>-15</button>
              <button onClick={() => adjustRest(15)} style={timerBtn}>+15</button>
              <button onClick={() => { setRestTimer(null); cancelRestPush(); }} style={{ ...timerBtn, background: c.rose, color: c.charcoal }}>Skip</button>
            </div>
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 2, marginTop: 12, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(restSec / restTimer.total) * 100}%`, background: c.rose, transition: "width 0.5s linear" }} />
          </div>
        </div>
      )}

      {/* bug report modal */}
      {showBugReport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }} onClick={() => setShowBugReport(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: c.cream, width: "100%", maxWidth: 430, borderRadius: "28px 28px 0 0", padding: 24, maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>App bugs</h2>
              <button onClick={() => setShowBugReport(false)} style={iconBtn}><X size={18} /></button>
            </div>
            <p style={{ fontSize: 12, color: c.muted, margin: "0 0 14px" }}>Jot anything weird you spot. Hit Email when you want to send the list to yourself.</p>

            <textarea
              value={bugDraft}
              onChange={(e) => setBugDraft(e.target.value)}
              placeholder="Describe the issue..."
              rows={3}
              style={{ width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 12, border: `1px solid ${c.line}`, background: "white", fontSize: 14, fontFamily: "inherit", resize: "vertical" }}
            />
            <button
              onClick={() => {
                const text = bugDraft.trim();
                if (!text) return;
                persistBugNotes([...bugNotes, { ts: Date.now(), text, workout: workout.name }]);
                setBugDraft("");
              }}
              disabled={!bugDraft.trim()}
              style={{ width: "100%", marginTop: 8, padding: 12, borderRadius: 12, border: "none", cursor: bugDraft.trim() ? "pointer" : "default", background: bugDraft.trim() ? c.charcoal : c.line, color: "white", fontSize: 14, fontWeight: 600 }}
            >
              Add to list
            </button>

            {bugNotes.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: c.muted, letterSpacing: 0.5, margin: "0 0 8px" }}>SAVED · {bugNotes.length}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {bugNotes.map((n, i) => (
                    <div key={i} style={{ background: "white", borderRadius: 12, padding: 12, border: `1px solid ${c.line}`, display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 10, color: c.muted, margin: 0 }}>{new Date(n.ts).toLocaleString()} · {n.workout || "(no workout)"}</p>
                        <p style={{ fontSize: 13, color: c.charcoal, margin: "2px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{n.text}</p>
                      </div>
                      <button
                        onClick={() => persistBugNotes(bugNotes.filter((_, j) => j !== i))}
                        style={{ background: "none", border: "none", cursor: "pointer", color: c.muted, padding: 4, flexShrink: 0 }}
                        aria-label="Remove"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <a
                    href={`mailto:ldunmore92@gmail.com?subject=${encodeURIComponent("Bloom app bugs")}&body=${encodeURIComponent(
                      bugNotes.map((n) => `• ${new Date(n.ts).toLocaleString()} · ${n.workout || "(no workout)"}\n${n.text}`).join("\n\n")
                    )}`}
                    style={{ flex: 1, textDecoration: "none", textAlign: "center", padding: 12, borderRadius: 12, background: c.rosedeep, color: "white", fontSize: 14, fontWeight: 600 }}
                  >
                    Email me ({bugNotes.length})
                  </a>
                  <button
                    onClick={() => { if (confirm("Clear all saved notes?")) persistBugNotes([]); }}
                    style={{ padding: "12px 14px", borderRadius: 12, border: `1px solid ${c.line}`, background: "white", color: c.muted, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* form tips modal */}
      {showFormTips && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }} onClick={() => setShowFormTips(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: c.cream, width: "100%", maxWidth: 430, borderRadius: "28px 28px 0 0", padding: 24, maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{showFormTips.name}</h2>
              <button onClick={() => setShowFormTips(null)} style={iconBtn}><X size={18} /></button>
            </div>
            <div style={{ borderRadius: 16, overflow: "hidden", marginBottom: 16, aspectRatio: "16/9", background: c.charcoal }}>
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${showFormTips.videoId}`}
                title={`${showFormTips.name} form tutorial`}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ display: "block", border: 0 }}
              />
            </div>
            <SectionTitle title="Form cues" />
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {showFormTips.tips.map((tip, i) => (
                <div key={i} style={{ background: c.white, borderRadius: 12, padding: 12, border: `1px solid ${c.line}`, display: "flex", gap: 10 }}>
                  <span style={{ color: c.rosedeep, fontWeight: 700 }}>{i + 1}.</span>
                  <span style={{ fontSize: 13, lineHeight: 1.5 }}>{tip}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* note editor */}
      {editingNote && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }} onClick={() => setEditingNote(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: c.cream, width: "100%", maxWidth: 430, borderRadius: "28px 28px 0 0", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Note · {editingNote}</h2>
              <button onClick={() => setEditingNote(null)} style={iconBtn}><X size={18} /></button>
            </div>
            <p style={{ fontSize: 12, color: c.muted, margin: "0 0 12px" }}>Stays here until you remove it. You'll see it next time you do this lift.</p>
            <textarea
              autoFocus
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="e.g. Felt tight on left side — warm up hips longer next time."
              rows={4}
              style={{ width: "100%", padding: 12, borderRadius: 12, border: `1px solid ${c.line}`, background: c.white, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical", marginBottom: 12 }}
            />
            <button onClick={saveNote} style={{ width: "100%", background: c.charcoal, color: "white", border: "none", padding: 14, borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Save note
            </button>
          </div>
        </div>
      )}

      {/* mid-workout coach */}
      {showCoach && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }} onClick={() => setShowCoach(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: c.cream, width: "100%", maxWidth: 430, borderRadius: "28px 28px 0 0", padding: 24, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Sparkles size={20} color={c.rosedeep} />
                <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Quick Coach</h2>
              </div>
              <button onClick={() => setShowCoach(false)} style={iconBtn}><X size={18} /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, marginBottom: 12, minHeight: 200 }}>
              {coachMsgs.map((m, i) => (
                <div key={i} style={{ alignSelf: m.from === "user" ? "flex-end" : "flex-start", background: m.from === "user" ? c.charcoal : c.white, color: m.from === "user" ? "white" : c.charcoal, border: m.from === "user" ? "none" : `1px solid ${c.line}`, padding: "10px 14px", borderRadius: 16, maxWidth: "80%", fontSize: 13, lineHeight: 1.5 }}>
                  {m.text}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={coachInput}
                onChange={(e) => setCoachInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMidWorkoutChat()}
                placeholder="e.g. this feels heavy..."
                style={{ flex: 1, padding: "12px 16px", borderRadius: 24, border: `1px solid ${c.line}`, background: c.white, fontSize: 14, outline: "none" }}
              />
              <button onClick={sendMidWorkoutChat} style={{ background: c.rosedeep, border: "none", borderRadius: "50%", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "white" }}>
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const timerBtn = { background: "rgba(255,255,255,0.15)", color: "white", border: "none", borderRadius: 12, padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const iconBtn = { background: c.white, border: `1px solid ${c.line}`, borderRadius: "50%", width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };

function inputStyle(done) {
  return {
    padding: "8px 8px",
    borderRadius: 8,
    border: `1px solid ${c.line}`,
    background: done ? c.blush : c.white,
    fontSize: 14,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    textAlign: "center",
  };
}

// ---------- SESSIONS OVERVIEW ----------
function WeekOverview({ onClose, onSessionsChange }) {
  const [view, setView] = useState("month");
  const [bump, setBump] = useState(0);
  const sessions = useMemo(() => getSessions().slice().sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0)), [bump]);
  const [editing, setEditing] = useState(null); // session object being edited
  const refresh = () => { setBump(b => b + 1); if (onSessionsChange) onSessionsChange(); };
  const startOfWeek = (d) => {
    const x = new Date(d); x.setHours(0, 0, 0, 0);
    const off = x.getDay() === 0 ? 6 : x.getDay() - 1; // Monday-first
    x.setDate(x.getDate() - off);
    return x;
  };
  const weekly = useMemo(() => {
    const out = [];
    for (let i = 4; i >= 0; i--) {
      const start = startOfWeek(new Date()); start.setDate(start.getDate() - i * 7);
      const end = new Date(start); end.setDate(end.getDate() + 7);
      const count = sessions.filter(s => s.finishedAt >= start.getTime() && s.finishedAt < end.getTime()).length;
      out.push({ label: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }), count });
    }
    return out;
  }, [sessions]);
  const monthly = useMemo(() => {
    const out = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const count = sessions.filter(s => s.finishedAt >= m.getTime() && s.finishedAt < next.getTime()).length;
      out.push({ label: m.toLocaleDateString("en-US", { month: "short" }), count });
    }
    return out;
  }, [sessions]);
  const yearly = useMemo(() => {
    const byYear = {};
    sessions.forEach(s => { const y = new Date(s.finishedAt).getFullYear(); byYear[y] = (byYear[y] || 0) + 1; });
    const years = Object.keys(byYear).sort();
    if (years.length === 0) years.push(String(new Date().getFullYear()));
    return years.map(y => ({ label: y, count: byYear[y] || 0 }));
  }, [sessions]);
  const data = view === "week" ? weekly : view === "month" ? monthly : yearly;
  const max = Math.max(...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  const avg = (total / data.length).toFixed(1);

  return (
    <div style={{ position: "fixed", inset: 0, background: c.cream, zIndex: 100, overflowY: "auto", maxWidth: 430, margin: "0 auto" }}>
      <div style={{ position: "sticky", top: 0, background: c.cream, borderBottom: `1px solid ${c.line}`, padding: "20px 24px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 5 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: c.charcoal, fontSize: 14, fontWeight: 500 }}>
          <ChevronLeft size={20} /> Back
        </button>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Sessions</p>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: 24, paddingBottom: 100 }}>
        <div style={{ display: "flex", gap: 6, background: c.white, borderRadius: 14, padding: 4, border: `1px solid ${c.line}`, marginBottom: 20 }}>
          {["week", "month", "year"].map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: view === v ? c.charcoal : "transparent", color: view === v ? "white" : c.charcoal, fontSize: 13, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}>
              {v}
            </button>
          ))}
        </div>

        <div style={{ background: `linear-gradient(135deg, ${c.blush}, ${c.blushLight})`, borderRadius: 20, padding: 20, marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: c.rosedeep, fontWeight: 700, margin: 0, letterSpacing: 0.5 }}>
            {view === "week" ? "LAST 5 WEEKS" : view === "month" ? "LAST 6 MONTHS" : "ALL YEARS"}
          </p>
          <h1 style={{ fontSize: 36, margin: "6px 0", fontWeight: 700, letterSpacing: -1 }}>{total}</h1>
          <p style={{ fontSize: 13, color: c.charcoal, margin: 0 }}>total sessions · {avg} avg per {view}</p>
        </div>

        <div style={{ background: c.white, borderRadius: 18, padding: 18, border: `1px solid ${c.line}`, marginBottom: 16 }}>
          <SectionTitle title="History" subtitle="Tap a session to edit" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {sessions.length === 0 && (
              <p style={{ fontSize: 12, color: c.muted, margin: 0 }}>No sessions yet.</p>
            )}
            {sessions.map((s) => {
              const totalSets = Object.values(s.exercises || {}).reduce((n, arr) => n + arr.length, 0);
              return (
                <button key={s.finishedAt} onClick={() => setEditing(s)} style={{ background: c.cream, border: `1px solid ${c.line}`, borderRadius: 12, padding: "10px 12px", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: c.charcoal }}>{s.workoutName}</p>
                    <p style={{ fontSize: 11, color: c.muted, margin: "2px 0 0" }}>{new Date(s.finishedAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {totalSets} sets</p>
                  </div>
                  <Pencil size={14} color={c.muted} />
                </button>
              );
            })}
          </div>
        </div>

        {editing && (
          <SessionEditModal
            session={editing}
            onClose={() => setEditing(null)}
            onSave={(patch) => { updateSession(editing.finishedAt, patch); setEditing(null); refresh(); }}
            onDelete={() => { deleteSession(editing.finishedAt); setEditing(null); refresh(); }}
          />
        )}

        <div style={{ background: c.white, borderRadius: 18, padding: 18, border: `1px solid ${c.line}` }}>
          <SectionTitle title="Sessions Hit" subtitle={`Per ${view}`} />
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 180, marginTop: 20 }}>
            {data.map((d, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: c.charcoal }}>{d.count}</p>
                <div style={{ width: "100%", height: `${(d.count / max) * 100}%`, background: `linear-gradient(180deg, ${c.rose}, ${c.rosedeep})`, borderRadius: 8, minHeight: 14 }} />
                <p style={{ fontSize: 10, color: c.muted, margin: 0 }}>{d.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- EXERCISE PROGRESS VIEW ----------
function ExerciseProgressView({ exerciseName, onClose }) {
  const unit = useUnit();
  const sessions = getSessions();
  const prs = load("prs", {});
  const pr = prs[exerciseName] || null;

  // Gather all sessions containing this exercise, sorted by date.
  const data = useMemo(() => {
    return sessions
      .filter(s => s.exercises && s.exercises[exerciseName] && !(s.workoutName || '').includes('(past entry)'))
      .map(s => {
        const sets = s.exercises[exerciseName];
        // Working weight = mode (most common weight)
        const counts = new Map();
        for (const st of sets) {
          const w = Number(st.weight);
          if (isFinite(w)) counts.set(w, (counts.get(w) || 0) + 1);
        }
        let workingW = 0, bestC = 0;
        for (const [w, count] of counts) {
          if (count > bestC || (count === bestC && w > workingW)) { workingW = w; bestC = count; }
        }
        const bestSet = sets.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps)) ? b : a, sets[0]);
        const volume = sets.reduce((n, st) => n + (Number(st.reps) || 0) * (Number(st.weight) || 0), 0);
        return {
          date: new Date(s.finishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          finishedAt: s.finishedAt,
          workingWeight: workingW,
          bestWeight: bestSet.weight,
          bestReps: bestSet.reps,
          totalSets: sets.length,
          volume: Math.round(volume),
          workoutName: s.workoutName,
        };
      })
      .sort((a, b) => a.finishedAt - b.finishedAt);
  }, [sessions, exerciseName]);

  const hasData = data.length > 0;
  const latest = hasData ? data[data.length - 1] : null;
  const maxWeight = hasData ? Math.max(...data.map(d => d.workingWeight)) : 0;
  const minWeight = hasData ? Math.min(...data.map(d => d.workingWeight)) : 0;
  const maxVolume = hasData ? Math.max(...data.map(d => d.volume)) : 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: c.cream, zIndex: 100, overflowY: "auto", maxWidth: 430, margin: "0 auto" }}>
      <div style={{ position: "sticky", top: 0, background: c.cream, borderBottom: `1px solid ${c.line}`, padding: "20px 24px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 5 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: c.charcoal, fontSize: 14, fontWeight: 500 }}>
          <ChevronLeft size={20} /> Back
        </button>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Lift Progress</p>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: 24, paddingBottom: 100 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px", letterSpacing: -0.5 }}>{exerciseName}</h1>
        <p style={{ fontSize: 12, color: c.muted, margin: "0 0 20px" }}>
          {hasData ? `${data.length} session${data.length === 1 ? "" : "s"} logged` : "No sessions logged yet"}
        </p>

        {!hasData ? (
          <div style={{ background: c.white, borderRadius: 18, padding: 24, border: `1px solid ${c.line}`, textAlign: "center" }}>
            <p style={{ fontSize: 14, color: c.muted, margin: 0, lineHeight: 1.5 }}>
              Complete a workout with {exerciseName} to start tracking progress.
            </p>
          </div>
        ) : (<>
          {/* Current stats */}
          <div style={{ background: `linear-gradient(135deg, ${c.blush}, ${c.blushLight})`, borderRadius: 20, padding: 20, marginBottom: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: c.rosedeep, margin: 0, letterSpacing: 0.5 }}>CURRENT WEIGHT</p>
                <p style={{ fontSize: 28, fontWeight: 700, margin: "4px 0 0", letterSpacing: -1 }}>{latest.workingWeight} {unit}</p>
              </div>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: c.rosedeep, margin: 0, letterSpacing: 0.5 }}>BEST SET</p>
                <p style={{ fontSize: 28, fontWeight: 700, margin: "4px 0 0", letterSpacing: -1 }}>{latest.bestWeight}{unit} x{latest.bestReps}</p>
              </div>
            </div>
            {pr && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.5)", display: "flex", alignItems: "center", gap: 8 }}>
                <Trophy size={14} color={c.rosedeep} />
                <p style={{ fontSize: 12, fontWeight: 600, color: c.charcoal, margin: 0 }}>
                  PR: {pr.weight}{unit} x {pr.reps} ({pr.date})
                </p>
              </div>
            )}
            <div style={{ display: "flex", gap: 12, marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.5)" }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 10, color: c.muted, margin: 0 }}>Weight change</p>
                <p style={{ fontSize: 14, fontWeight: 700, margin: "2px 0 0", color: data.length > 1 ? (latest.workingWeight > data[0].workingWeight ? "#4a8a5a" : latest.workingWeight < data[0].workingWeight ? "#c0392b" : c.charcoal) : c.charcoal }}>
                  {data.length > 1 ? `${latest.workingWeight - data[0].workingWeight >= 0 ? "+" : ""}${latest.workingWeight - data[0].workingWeight} ${unit}` : "—"}
                </p>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 10, color: c.muted, margin: 0 }}>Sessions</p>
                <p style={{ fontSize: 14, fontWeight: 700, margin: "2px 0 0" }}>{data.length}</p>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 10, color: c.muted, margin: 0 }}>Last session</p>
                <p style={{ fontSize: 14, fontWeight: 700, margin: "2px 0 0" }}>{latest.date}</p>
              </div>
            </div>
          </div>

          {/* Working weight chart */}
          <div style={{ background: c.white, borderRadius: 18, padding: 18, border: `1px solid ${c.line}`, marginBottom: 16 }}>
            <SectionTitle title="Working Weight" subtitle="Over time" />
            <div style={{ position: "relative", height: 160, marginTop: 16 }}>
              {/* Y-axis labels */}
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 20, width: 30, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <span style={{ fontSize: 9, color: c.muted }}>{maxWeight}</span>
                <span style={{ fontSize: 9, color: c.muted }}>{minWeight}</span>
              </div>
              {/* Chart area */}
              <div style={{ marginLeft: 34, height: 140, display: "flex", alignItems: "flex-end", gap: data.length > 12 ? 1 : 4 }}>
                {data.map((d, i) => {
                  const range = maxWeight - minWeight || 1;
                  const h = ((d.workingWeight - minWeight) / range) * 100;
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, maxWidth: 36 }}>
                      <p style={{ fontSize: 8, color: c.charcoal, margin: 0, fontWeight: 700 }}>{d.workingWeight}</p>
                      <div style={{
                        width: "100%", minHeight: 8,
                        height: `${Math.max(8, h)}%`,
                        background: `linear-gradient(180deg, ${c.rose}, ${c.rosedeep})`,
                        borderRadius: 4,
                      }} />
                      <p style={{ fontSize: 7, color: c.muted, margin: 0, whiteSpace: "nowrap" }}>{d.date}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Volume chart */}
          <div style={{ background: c.white, borderRadius: 18, padding: 18, border: `1px solid ${c.line}`, marginBottom: 16 }}>
            <SectionTitle title="Volume" subtitle="Total weight × reps per session" />
            <div style={{ display: "flex", alignItems: "flex-end", gap: data.length > 12 ? 1 : 4, height: 100, marginTop: 14 }}>
              {data.map((d, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, maxWidth: 36 }}>
                  <p style={{ fontSize: 7, color: c.charcoal, margin: 0, fontWeight: 600 }}>{d.volume}</p>
                  <div style={{
                    width: "100%", minHeight: 4,
                    height: `${(d.volume / (maxVolume || 1)) * 100}%`,
                    background: `linear-gradient(180deg, ${c.blush}, ${c.rose})`,
                    borderRadius: 4,
                  }} />
                  <p style={{ fontSize: 7, color: c.muted, margin: 0 }}>{d.date}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Session history list */}
          <div style={{ background: c.white, borderRadius: 18, padding: 18, border: `1px solid ${c.line}` }}>
            <SectionTitle title="Session History" subtitle="All logged sets" />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {data.slice().reverse().map((d, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < data.length - 1 ? `1px solid ${c.line}` : "none" }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: c.charcoal }}>{d.date}</p>
                    <p style={{ fontSize: 10, color: c.muted, margin: "2px 0 0" }}>{d.workoutName} · {d.totalSets} sets</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: c.charcoal }}>{d.workingWeight}{unit}</p>
                    <p style={{ fontSize: 10, color: c.muted, margin: "1px 0 0" }}>best: {d.bestWeight}{unit} x{d.bestReps}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>)}
      </div>
    </div>
  );
}

// ---------- SETTINGS MODAL ----------
// Dedicated rest-timer settings page reachable from Settings → "Rest timer".
// Two controls: a free text input for the spoken message (bloom:restPhrase)
// and a dropdown of system speechSynthesis voices (bloom:restVoiceName), plus
// a Preview button. Voice recording is intentionally not offered here — it's
// a kept-it-simple decision so this surface doesn't keep breaking.
function RestTimerScreen({ onBack }) {
  const [phrase, setPhrase] = useState(() => localStorage.getItem("bloom:restPhrase") || DEFAULT_REST_PHRASE);
  const [voiceName, setVoiceName] = useState(() => localStorage.getItem("bloom:restVoiceName") || "");
  const [voices, setVoices] = useState(() => (typeof window !== "undefined" && window.speechSynthesis ? window.speechSynthesis.getVoices() : []));

  // System voices load asynchronously on some platforms (notably iOS Safari).
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => setVoices(window.speechSynthesis.getVoices() || []);
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const updatePhrase = (v) => {
    setPhrase(v);
    try { localStorage.setItem("bloom:restPhrase", v); } catch {}
  };
  const updateVoice = (v) => {
    setVoiceName(v);
    try { localStorage.setItem("bloom:restVoiceName", v); } catch {}
  };
  const preview = () => {
    try {
      if (!window.speechSynthesis) return;
      const u = new SpeechSynthesisUtterance(phrase || DEFAULT_REST_PHRASE);
      if (voiceName) {
        const v = voices.find(x => x.name === voiceName);
        if (v) u.voice = v;
      }
      u.rate = 1.0; u.pitch = 1.1; u.volume = 1.0;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {}
  };

  const btn = { width: "100%", background: c.white, border: `1px solid ${c.line}`, borderRadius: 14, padding: 14, fontSize: 13, fontWeight: 600, cursor: "pointer", color: c.charcoal, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 400 }} onClick={onBack}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: c.cream, width: "100%", maxWidth: 430, borderRadius: "28px 28px 0 0", padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 18 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: c.charcoal, cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }} aria-label="Back">
            <ChevronLeft size={20} />
          </button>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Rest timer</h2>
        </div>

        <div style={{ background: c.white, border: `1px solid ${c.line}`, borderRadius: 16, padding: 16, marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: c.rosedeep, margin: "0 0 8px", letterSpacing: 0.5 }}>MESSAGE</p>
          <p style={{ fontSize: 12, color: c.muted, margin: "0 0 12px", lineHeight: 1.4 }}>
            Spoken when the rest timer ends. Type whatever you want.
          </p>
          <input
            type="text"
            value={phrase}
            onChange={(e) => updatePhrase(e.target.value)}
            placeholder={DEFAULT_REST_PHRASE}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "10px 12px", borderRadius: 12,
              border: `1px solid ${c.line}`, background: "white",
              fontSize: 14, fontFamily: "inherit", color: c.charcoal,
            }}
          />
        </div>

        <div style={{ background: c.white, border: `1px solid ${c.line}`, borderRadius: 16, padding: 16, marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: c.rosedeep, margin: "0 0 8px", letterSpacing: 0.5 }}>VOICE</p>
          <p style={{ fontSize: 12, color: c.muted, margin: "0 0 12px", lineHeight: 1.4 }}>
            {voices.length === 0
              ? "Loading available voices… If none show up, your device may need to enable speech voices in system settings."
              : "Choose which system voice speaks the message."}
          </p>
          <select
            value={voiceName}
            onChange={(e) => updateVoice(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "10px 12px", borderRadius: 12,
              border: `1px solid ${c.line}`, background: "white",
              fontSize: 14, fontFamily: "inherit", color: c.charcoal,
            }}
          >
            <option value="">System default</option>
            {voices.map((v) => (
              <option key={`${v.name}-${v.lang}`} value={v.name}>{v.name} ({v.lang})</option>
            ))}
          </select>
        </div>

        <button onClick={preview} style={{ ...btn, background: c.rosedeep, color: "white", border: "none" }}>
          <Play size={14} /> Preview
        </button>
      </div>
    </div>
  );
}

function SettingsModal({ onClose, onExport, unit, setUnit }) {
  const [showRestTimer, setShowRestTimer] = useState(false);

  const btn = { width: "100%", background: c.white, border: `1px solid ${c.line}`, borderRadius: 14, padding: 14, fontSize: 13, fontWeight: 600, cursor: "pointer", color: c.charcoal, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 300 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: c.cream, width: "100%", maxWidth: 430, borderRadius: "28px 28px 0 0", padding: 24, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Settings</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: c.muted, cursor: "pointer" }}><X size={20} /></button>
        </div>

        {/* Rest timer → opens its own page */}
        <button onClick={() => setShowRestTimer(true)} style={{ ...btn, marginBottom: 10, justifyContent: "space-between" }}>
          <span>Rest timer</span>
          <ChevronRight size={16} color={c.muted} />
        </button>

        {/* Refresh */}
        <button onClick={() => window.location.reload()} style={{ ...btn, marginBottom: 10 }}>
          <RefreshCw size={14} /> Refresh app
        </button>

        {/* Unit toggle */}
        <button onClick={() => setUnit(unit === "kg" ? "lb" : "kg")} style={{ ...btn, marginBottom: 10 }}>
          Switch to {unit === "kg" ? "lb" : "kg"}
        </button>

        {/* Reset Wren */}
        <button onClick={() => {
          if (confirm("Reset Wren? This clears your chat history and program. Wren will start onboarding fresh.")) {
            localStorage.removeItem('bloom:wrenChat');
            localStorage.removeItem('bloom:wrenProgram');
            localStorage.removeItem('bloom:wrenMissedSessions');
            window.location.reload();
          }
        }} style={{ ...btn, marginBottom: 10, color: c.rosedeep }}>
          Reset Wren
        </button>

        {/* Export */}
        <button onClick={onExport} style={{ ...btn, marginBottom: 10 }}>
          Export data
        </button>

        {/* Sign out */}
        {isSupabaseConfigured && (
          <button onClick={async () => { if (confirm("Sign out of Bloom?")) await supabase.auth.signOut(); }} style={{ ...btn, color: c.rosedeep }}>
            Sign out
          </button>
        )}
      </div>
      {showRestTimer && <RestTimerScreen onBack={() => setShowRestTimer(false)} />}
    </div>
  );
}

// ---------- EXPORT DATA MODAL (temporary, for migration) ----------
function ExportDataModal({ onClose }) {
  const dump = (() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("bloom:")) continue;
      const raw = localStorage.getItem(k);
      try { out[k] = JSON.parse(raw); } catch { out[k] = raw; }
    }
    return out;
  })();
  const text = JSON.stringify(dump, null, 2);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the textarea
      const ta = document.getElementById("bloom-export-ta");
      if (ta) { ta.focus(); ta.select(); }
    }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 400, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: c.cream, width: "100%", maxWidth: 430, borderRadius: "28px 28px 0 0", padding: 20, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Export data</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: c.muted, cursor: "pointer" }}><X size={20} /></button>
        </div>
        <p style={{ fontSize: 12, color: c.muted, margin: "0 0 10px" }}>All bloom:* localStorage keys. Tap copy or long-press the text to select.</p>
        <button onClick={copy} style={{ background: c.charcoal, color: "white", border: "none", padding: 12, borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 10 }}>
          {copied ? "Copied!" : "Copy to clipboard"}
        </button>
        <textarea
          id="bloom-export-ta"
          readOnly
          value={text}
          onFocus={(e) => e.target.select()}
          style={{ flex: 1, minHeight: 300, width: "100%", boxSizing: "border-box", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, padding: 10, border: `1px solid ${c.line}`, borderRadius: 12, background: c.white, color: c.charcoal, resize: "vertical" }}
        />
      </div>
    </div>
  );
}

// ---------- SESSION EDIT MODAL ----------
function SessionEditModal({ session, onClose, onSave, onDelete }) {
  const unit = useUnit();
  const [exercises, setExercises] = useState(() => {
    // Deep clone to avoid mutating original
    const out = {};
    for (const [name, sets] of Object.entries(session.exercises || {})) {
      out[name] = sets.map(s => ({ reps: String(s.reps ?? ""), weight: String(s.weight ?? "") }));
    }
    return out;
  });
  const [dateStr, setDateStr] = useState(() => {
    const d = new Date(session.finishedAt);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const updateSet = (name, idx, field, val) => {
    setExercises(prev => {
      const next = { ...prev, [name]: prev[name].map((s, i) => i === idx ? { ...s, [field]: val } : s) };
      return next;
    });
  };
  const addSet = (name) => setExercises(prev => ({ ...prev, [name]: [...prev[name], { reps: "", weight: "" }] }));
  const removeSet = (name, idx) => setExercises(prev => ({ ...prev, [name]: prev[name].filter((_, i) => i !== idx) }));
  const removeExercise = (name) => setExercises(prev => {
    const next = { ...prev };
    delete next[name];
    return next;
  });
  const addExercise = (name) => {
    if (!name || exercises[name]) return;
    setExercises(prev => ({ ...prev, [name]: [{ reps: "", weight: "" }] }));
    setShowAdd(false);
    setAddSearch("");
  };

  // Exercise picker state
  const [showAdd, setShowAdd] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const customs = load("customExercises", []);
  const allLibrary = [...EXERCISE_DB, ...customs];
  const filteredLib = allLibrary.filter(e =>
    !exercises[e.name] &&
    (e.name.toLowerCase().includes(addSearch.toLowerCase()) ||
     (e.muscle || "").toLowerCase().includes(addSearch.toLowerCase()))
  );
  const save = () => {
    const cleaned = {};
    for (const [name, sets] of Object.entries(exercises)) {
      const valid = sets.filter(s => s.reps !== "" && s.weight !== "").map(s => ({ reps: toNum(s.reps), weight: toNum(s.weight) }));
      if (valid.length) cleaned[name] = valid;
    }
    const [y, m, d] = dateStr.split("-").map(Number);
    const orig = new Date(session.finishedAt);
    const newDate = new Date(y, m - 1, d, orig.getHours(), orig.getMinutes(), orig.getSeconds());
    onSave({ exercises: cleaned, finishedAt: newDate.getTime() });
  };
  const inp = { padding: "8px 4px", borderRadius: 8, border: `1px solid ${c.line}`, background: c.cream, fontSize: 14, outline: "none", textAlign: "center", boxSizing: "border-box", width: "100%", minWidth: 0 };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 300 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: c.cream, width: "100%", maxWidth: 430, borderRadius: "28px 28px 0 0", padding: 24, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{session.workoutName}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: c.muted, cursor: "pointer" }}><X size={20} /></button>
        </div>
        <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} style={{ width: "100%", padding: 12, borderRadius: 12, border: `1px solid ${c.line}`, background: c.white, fontSize: 14, marginBottom: 12, outline: "none", boxSizing: "border-box", color: c.charcoal }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {Object.entries(exercises).map(([name, sets]) => (
            <div key={name} style={{ background: c.white, border: `1px solid ${c.line}`, borderRadius: 14, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{name}</p>
                <button onClick={() => removeExercise(name)} title="Remove exercise" style={{ background: "none", border: "none", color: c.muted, cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}>
                  <X size={14} />
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "20px 1fr 1fr 22px", gap: 6, fontSize: 9, color: c.muted, marginBottom: 4, letterSpacing: 0.5 }}>
                <span>SET</span><span style={{ textAlign: "center" }}>REPS</span><span style={{ textAlign: "center" }}>{unit.toUpperCase()}</span><span></span>
              </div>
              {sets.map((s, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "20px 1fr 1fr 22px", gap: 6, alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: c.muted, textAlign: "center" }}>{i + 1}</span>
                  <input type="text" inputMode="numeric" value={s.reps} onChange={(e) => updateSet(name, i, "reps", e.target.value)} placeholder="0" style={inp} />
                  <input type="text" inputMode="decimal" value={s.weight} onChange={(e) => updateSet(name, i, "weight", e.target.value)} placeholder="0" style={inp} />
                  <button onClick={() => removeSet(name, i)} style={{ background: "none", border: "none", color: c.muted, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={12} /></button>
                </div>
              ))}
              <button onClick={() => addSet(name)} style={{ width: "100%", marginTop: 4, background: c.blushLight, border: `1px dashed ${c.rose}`, borderRadius: 8, padding: 6, color: c.rosedeep, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <Plus size={11} /> Add set
              </button>
            </div>
          ))}

          {showAdd ? (
            <div style={{ background: c.white, border: `1px solid ${c.line}`, borderRadius: 14, padding: 12 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <input
                  autoFocus
                  type="text"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  placeholder="Search exercises…"
                  style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.line}`, background: c.cream, fontSize: 13, outline: "none", color: c.charcoal, boxSizing: "border-box" }}
                />
                <button onClick={() => { setShowAdd(false); setAddSearch(""); }} style={{ background: "none", border: "none", color: c.muted, cursor: "pointer", padding: "0 4px" }}><X size={16} /></button>
              </div>
              <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {filteredLib.length === 0 && (
                  <p style={{ fontSize: 12, color: c.muted, margin: "8px 0", textAlign: "center" }}>No matches</p>
                )}
                {filteredLib.slice(0, 60).map((ex) => (
                  <button
                    key={ex.id || ex.name}
                    onClick={() => addExercise(ex.name)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.line}`, background: c.cream, cursor: "pointer", textAlign: "left" }}
                  >
                    <span style={{ fontSize: 12, color: c.charcoal, fontWeight: 600 }}>{ex.name}</span>
                    <span style={{ fontSize: 10, color: c.muted }}>{ex.muscle || ""}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAdd(true)} style={{ width: "100%", background: c.white, border: `1px dashed ${c.rose}`, borderRadius: 14, padding: 12, color: c.rosedeep, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Plus size={14} /> Add exercise
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onDelete} style={{ flex: 1, background: c.white, color: c.rosedeep, border: `1px solid ${c.rose}`, padding: 14, borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Delete</button>
          <button onClick={save} style={{ flex: 2, background: c.charcoal, color: "white", border: "none", padding: 14, borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Save changes</button>
        </div>
      </div>
    </div>
  );
}

// ---------- LIBRARY VIEW ----------
function LibraryView({ onClose, allExercises, customExercises, setCustomExercises }) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // exercise being edited (or "new")
  const [draft, setDraft] = useState({ name: "", muscle: "", restSec: 90, videoId: "" });
  const filtered = allExercises.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) || (e.muscle || "").toLowerCase().includes(search.toLowerCase())
  );
  const isCustom = (ex) => customExercises.some(c => c.id === ex.id);
  const openNew = () => {
    setDraft({ name: search.trim(), muscle: "", restSec: 90, videoId: "" });
    setEditing("new");
  };
  const openEdit = (ex) => {
    setDraft({ name: ex.name, muscle: ex.muscle || "", restSec: ex.restSec || 90, videoId: ex.videoId || "" });
    setEditing(ex);
  };
  const extractVideoId = (url) => {
    if (!url) return "";
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
    if (m) return m[1];
    if (/^[\w-]{11}$/.test(url.trim())) return url.trim();
    return "";
  };
  const saveDraft = async () => {
    const n = draft.name.trim();
    if (!n) return;
    let videoId = extractVideoId(draft.videoId) || draft.videoId;
    if (!videoId) {
      try {
        const r = await fetch(`/api/youtube-search?q=${encodeURIComponent(n + " form tutorial")}`);
        if (r.ok) videoId = (await r.json()).videoId || "";
      } catch {}
    }
    const ex = { id: editing === "new" ? `cx${Date.now()}` : editing.id, name: n, muscle: draft.muscle.trim() || "Custom", restSec: parseInt(draft.restSec) || 90, tips: editing?.tips || [], videoId };
    if (editing === "new") {
      setCustomExercises([...customExercises, ex]);
    } else if (isCustom(editing)) {
      setCustomExercises(customExercises.map(c => c.id === editing.id ? ex : c));
    } else {
      // Built-in: store override under same id
      setCustomExercises([...customExercises.filter(c => c.id !== editing.id), ex]);
    }
    setEditing(null);
  };
  const deleteCustom = () => {
    if (editing === "new") return setEditing(null);
    setCustomExercises(customExercises.filter(c => c.id !== editing.id));
    setEditing(null);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: c.cream, zIndex: 100, overflowY: "auto", maxWidth: 430, margin: "0 auto" }}>
      <div style={{ position: "sticky", top: 0, background: c.cream, borderBottom: `1px solid ${c.line}`, padding: "20px 20px 12px", zIndex: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", color: c.charcoal, padding: 4 }}>
            <ChevronLeft size={22} />
          </button>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, flex: 1 }}>Exercise library</h2>
          <button onClick={openNew} style={{ background: c.charcoal, color: "white", border: "none", borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <Plus size={14} /> New
          </button>
        </div>
        <div style={{ position: "relative" }}>
          <Search size={16} style={{ position: "absolute", left: 14, top: 14, color: c.muted }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lifts..."
            style={{ width: "100%", padding: "12px 12px 12px 38px", borderRadius: 14, border: `1px solid ${c.line}`, background: c.white, fontSize: 14, outline: "none", boxSizing: "border-box" }}
          />
        </div>
      </div>
      <div style={{ padding: "16px 20px 100px", display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map(ex => (
          <button
            key={ex.id}
            onClick={() => openEdit(ex)}
            style={{ background: c.white, border: `1px solid ${c.line}`, borderRadius: 14, padding: 14, textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{ex.name}</p>
              <p style={{ fontSize: 11, color: c.muted, margin: "2px 0 0" }}>
                {ex.muscle || "—"} · Rest {Math.floor((ex.restSec || 90) / 60)}:{String((ex.restSec || 90) % 60).padStart(2, "0")}
                {isCustom(ex) && " · Custom"}
              </p>
            </div>
            <Pencil size={14} color={c.muted} />
          </button>
        ))}
      </div>

      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }} onClick={() => setEditing(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: c.cream, width: "100%", maxWidth: 430, borderRadius: "28px 28px 0 0", padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{editing === "new" ? "New lift" : "Edit lift"}</h2>
              <button onClick={() => setEditing(null)} style={iconBtn}><X size={18} /></button>
            </div>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Lift name" style={{ width: "100%", padding: 12, borderRadius: 12, border: `1px solid ${c.line}`, background: c.white, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
            <input value={draft.muscle} onChange={(e) => setDraft({ ...draft, muscle: e.target.value })} placeholder="Muscle group (e.g. Glutes, Chest)" style={{ width: "100%", padding: 12, borderRadius: 12, border: `1px solid ${c.line}`, background: c.white, fontSize: 14, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <input
                type="text"
                inputMode="decimal"
                defaultValue={draft.restSec ? (Number(draft.restSec) / 60).toFixed(Number(draft.restSec) % 60 === 0 ? 0 : 1) : ""}
                onBlur={(e) => {
                  const mins = parseFloat(e.target.value);
                  setDraft({ ...draft, restSec: isFinite(mins) && mins > 0 ? Math.round(mins * 60) : 90 });
                }}
                placeholder="1.5"
                style={{ flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${c.line}`, background: c.white, fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
              <span style={{ fontSize: 13, color: c.muted, fontWeight: 600 }}>min rest</span>
            </div>
            <input value={draft.videoId} onChange={(e) => setDraft({ ...draft, videoId: e.target.value })} placeholder="YouTube URL or ID (optional)" style={{ width: "100%", padding: 12, borderRadius: 12, border: `1px solid ${c.line}`, background: c.white, fontSize: 13, marginBottom: 14, outline: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8 }}>
              {editing !== "new" && isCustom(editing) && (
                <button onClick={deleteCustom} style={{ flex: 1, background: c.white, border: `1px solid ${c.rosedeep}`, color: c.rosedeep, padding: 12, borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Delete</button>
              )}
              <button onClick={saveDraft} disabled={!draft.name.trim()} style={{ flex: 2, background: draft.name.trim() ? c.charcoal : c.muted, color: "white", border: "none", padding: 12, borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- FOCUS LIFT VIEW ----------
function FocusLiftView({ onClose, focusLiftName, setFocusLiftName, allExercises = EXERCISE_DB }) {
  const unit = useUnit();
  const [mode, setMode] = useState("volume"); // volume | strength
  const [showPicker, setShowPicker] = useState(false);
  const [showAddPast, setShowAddPast] = useState(false);
  const [pastDate, setPastDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pastSets, setPastSets] = useState([{ reps: "", weight: "" }, { reps: "", weight: "" }, { reps: "", weight: "" }]);
  const [_, forceRerender] = useState(0);
  const updatePastSet = (i, field, val) => setPastSets(pastSets.map((s, j) => j === i ? { ...s, [field]: val } : s));
  const addPastSet = () => setPastSets([...pastSets, { reps: "", weight: "" }]);
  const removePastSet = (i) => setPastSets(pastSets.filter((_, j) => j !== i));
  const savePastEntry = () => {
    const valid = pastSets
      .map(s => ({ reps: toNum(s.reps), weight: toNum(s.weight) }))
      .filter(s => s.reps && s.weight);
    if (!valid.length) return;
    const list = load("sessions", []);
    list.push({
      workoutName: `${focusLiftName} (past entry)`,
      tag: mode,
      exercises: { [focusLiftName]: valid },
      durationSec: 0,
      finishedAt: new Date(pastDate + "T12:00:00").getTime(),
    });
    save("sessions", list);
    setPastSets([{ reps: "", weight: "" }, { reps: "", weight: "" }, { reps: "", weight: "" }]);
    setShowAddPast(false);
    forceRerender(n => n + 1);
  };

  // Pull session history for this lift, filtered by tag.
  // For each session: working weight = mode of weights, reps = min reps at
  // that weight (the "weakest" set, which is what the all-sets rule cares about).
  const sessions = getSessions();
  const targetReps = mode === "strength" ? 6 : 12; // user's rep-range top
  const isLowerLift = /barbell|squat|deadlift|hip thrust|leg press|rdl/i.test(focusLiftName);
  const data = useMemo(() => {
    return sessions
      .filter(s => s.tag === mode && s.exercises && s.exercises[focusLiftName])
      .map(s => {
        const sets = s.exercises[focusLiftName];
        // working weight = most common weight (handles top single + back-offs)
        const counts = new Map();
        for (const st of sets) {
          const w = Number(st.weight);
          if (isFinite(w)) counts.set(w, (counts.get(w) || 0) + 1);
        }
        let workingW = null, bestC = -1, bestI = -1;
        for (const [w, count] of counts) {
          const lastIdx = sets.map(x => Number(x.weight)).lastIndexOf(w);
          if (count > bestC || (count === bestC && lastIdx > bestI)) {
            workingW = w; bestC = count; bestI = lastIdx;
          }
        }
        const setsAtWorking = sets.filter(st => Number(st.weight) === workingW);
        const minReps = Math.min(...setsAtWorking.map(st => Number(st.reps) || 0));
        return {
          date: new Date(s.finishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          weight: workingW,
          reps: minReps,
          numSets: setsAtWorking.length,
          finishedAt: s.finishedAt,
        };
      })
      .sort((a, b) => a.finishedAt - b.finishedAt);
  }, [sessions, focusLiftName, mode]);

  const hasData = data.length > 0;
  const current = hasData ? data[data.length - 1] : null;
  const first = hasData ? data[0] : null;
  const gain = hasData ? current.weight - first.weight : 0;
  const weeks = data.length || 1;

  // Walk forward N weeks applying the user's progressive overload rule.
  function projectAhead(start, weeksAhead) {
    let w = start.weight;
    let r = start.reps;
    // After a weight bump, drop reps by 2 (e.g. strength: 6→4, volume: 12→10)
    // and climb back up one rep per week.
    const resetReps = Math.max(1, targetReps - 2);
    for (let i = 0; i < weeksAhead; i++) {
      if (r < targetReps) {
        r += 1;
      } else {
        w = bumpWeight(w, unit, isLowerLift);
        r = resetReps;
      }
    }
    return { weight: w, reps: r };
  }
  const projection = hasData ? [2, 4, 8].map((wk) => ({
    label: `In ${wk} week${wk === 1 ? "" : "s"}`,
    ...projectAhead(current, wk),
  })) : [];

  return (
    <div style={{ position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)", bottom: 72, width: "100%", background: c.cream, zIndex: 8, overflowY: "auto", maxWidth: 430 }}>
      <div style={{ position: "sticky", top: 0, background: c.cream, borderBottom: `1px solid ${c.line}`, padding: "20px 24px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 5 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: c.charcoal, fontSize: 14, fontWeight: 500 }}>
          <ChevronLeft size={20} /> Back
        </button>
        <p style={{ fontSize: 11, color: c.rosedeep, fontWeight: 700, margin: 0, letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 5 }}>
          <Star size={12} fill={c.rosedeep} color={c.rosedeep} /> FOCUS LIFT
        </p>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: 24, paddingBottom: 100 }}>
        <button onClick={() => setShowPicker(true)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -0.5, color: c.charcoal }}>{focusLiftName}</h1>
          <Pencil size={14} color={c.muted} />
        </button>
        <p style={{ fontSize: 12, color: c.muted, margin: "0 0 20px" }}>{hasData ? `${weeks} ${mode} session${weeks === 1 ? "" : "s"} logged` : "No sessions yet — finish a workout to see your progress"}</p>

        {/* mode toggle */}
        <div style={{ display: "flex", gap: 6, background: c.white, borderRadius: 14, padding: 4, border: `1px solid ${c.line}`, marginBottom: 20 }}>
          {["volume", "strength"].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: mode === m ? c.charcoal : "transparent", color: mode === m ? "white" : c.charcoal, fontSize: 13, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}
            >
              {m === "volume" ? "Volume day" : "Strength day"}
            </button>
          ))}
        </div>

        <button onClick={() => setShowAddPast(true)} style={{ width: "100%", background: c.white, border: `1px dashed ${c.rose}`, borderRadius: 12, padding: 10, color: c.rosedeep, fontSize: 12, fontWeight: 600, cursor: "pointer", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Plus size={14} /> Add past entry
        </button>

        {!hasData ? (
          <div style={{ background: c.white, borderRadius: 18, padding: 24, border: `1px solid ${c.line}`, textAlign: "center" }}>
            <p style={{ fontSize: 14, color: c.muted, margin: 0, lineHeight: 1.5 }}>
              No <strong>{mode}</strong> sessions logged yet for {focusLiftName}.<br />
              Tag a workout as "{mode}" in the builder, include this lift, and finish a session to start tracking.
            </p>
          </div>
        ) : (<>
        {/* hero stats */}
        <div style={{ background: `linear-gradient(135deg, ${c.blush}, ${c.blushLight})`, borderRadius: 20, padding: 20, marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: c.rosedeep, fontWeight: 700, margin: 0, letterSpacing: 0.5 }}>CURRENT WORKING SET</p>
          <p style={{ fontSize: 32, fontWeight: 700, margin: "4px 0 0", letterSpacing: -1 }}>
            {current.numSets}×{current.reps} @ {current.weight} {unit}
          </p>
          <p style={{ fontSize: 13, color: c.muted, margin: "2px 0 0" }}>
            target {targetReps} reps · {current.date}
          </p>
          <div style={{ display: "flex", gap: 12, paddingTop: 16, marginTop: 16, borderTop: `1px solid rgba(255,255,255,0.5)` }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 11, color: c.muted, margin: 0 }}>Weight gain</p>
              <p style={{ fontSize: 16, fontWeight: 700, margin: "2px 0 0", color: c.rosedeep }}>+{gain} {unit}</p>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 11, color: c.muted, margin: 0 }}>Reps to top</p>
              <p style={{ fontSize: 16, fontWeight: 700, margin: "2px 0 0", color: c.rosedeep }}>{Math.max(0, targetReps - current.reps)}</p>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 11, color: c.muted, margin: 0 }}>Sessions</p>
              <p style={{ fontSize: 16, fontWeight: 700, margin: "2px 0 0", color: c.rosedeep }}>{weeks}</p>
            </div>
          </div>
        </div>

        {/* progression chart */}
        <div style={{ background: c.white, borderRadius: 18, padding: 18, border: `1px solid ${c.line}`, marginBottom: 20 }}>
          <SectionTitle title="Progression" subtitle="Top set weight over time" />
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140, marginTop: 16 }}>
            {data.map((d, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <p style={{ fontSize: 9, color: c.muted, margin: 0, fontWeight: 600 }}>{d.weight}</p>
                <div style={{ width: "100%", height: `${(d.weight / Math.max(...data.map((x) => x.weight))) * 100}%`, background: `linear-gradient(180deg, ${c.rose}, ${c.rosedeep})`, borderRadius: 6, minHeight: 10 }} />
                <p style={{ fontSize: 8, color: c.muted, margin: 0, transform: "rotate(-30deg)", whiteSpace: "nowrap" }}>{d.date}</p>
              </div>
            ))}
          </div>
        </div>

        {/* projection */}
        <div style={{ background: c.white, borderRadius: 18, padding: 18, border: `1px solid ${c.line}`, marginBottom: 20 }}>
          <SectionTitle title="Where you'll be" subtitle={`If you progress 1 rep/week then bump 5% at ${targetReps} reps`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
            {projection.map((row, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: c.cream, borderRadius: 12 }}>
                <p style={{ fontSize: 13, margin: 0, color: c.muted }}>{row.label}</p>
                <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: c.charcoal }}>
                  {current.numSets}×{row.reps} @ {row.weight} {unit}
                </p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: c.muted, fontStyle: "italic", margin: "12px 0 0", lineHeight: 1.4 }}>
            ✨ Assumes one quality session per week. Once every set hits {targetReps}, weight bumps ~5% and reps reset to {Math.max(1, targetReps - 2)}.
          </p>
        </div>

        {/* coach insight */}
        <div style={{ background: c.blushLight, border: `1px solid ${c.blush}`, borderRadius: 16, padding: 16, display: "flex", gap: 10 }}>
          <Sparkles size={18} color={c.rosedeep} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: c.rosedeep, margin: 0, letterSpacing: 0.3 }}>BLOOM'S TAKE</p>
            <p style={{ fontSize: 13, color: c.charcoal, margin: "4px 0 0", lineHeight: 1.5 }}>
              {mode === "volume"
                ? `Your last volume day — push for one more rep at the same weight. Once you nail your top reps, bump the weight by ${incrementFor(unit, true)} ${unit}.`
                : `Your last strength day — push for one more rep, then add ${incrementFor(unit, true)} ${unit} next session.`}
            </p>
          </div>
        </div>
        </>)}
      </div>

      {showAddPast && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }} onClick={() => setShowAddPast(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: c.cream, width: "100%", maxWidth: 430, borderRadius: "28px 28px 0 0", padding: 20, maxHeight: "90vh", overflowY: "auto", boxSizing: "border-box" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Add past {mode} entry</h2>
              <button onClick={() => setShowAddPast(false)} style={iconBtn}><X size={18} /></button>
            </div>
            <p style={{ fontSize: 12, color: c.muted, margin: "0 0 14px" }}>{focusLiftName} · log all sets</p>
            <input type="date" value={pastDate} onChange={(e) => setPastDate(e.target.value)} style={{ width: "100%", padding: 12, borderRadius: 12, border: `1px solid ${c.line}`, background: c.white, fontSize: 14, marginBottom: 12, outline: "none", boxSizing: "border-box", color: c.charcoal }} />
            <div style={{ background: c.white, border: `1px solid ${c.line}`, borderRadius: 14, padding: 12, marginBottom: 12, boxSizing: "border-box" }}>
              <div style={{ display: "grid", gridTemplateColumns: "20px 1fr 1fr 22px", gap: 6, fontSize: 9, color: c.muted, marginBottom: 4, letterSpacing: 0.5 }}>
                <span>SET</span><span style={{ textAlign: "center" }}>REPS</span><span style={{ textAlign: "center" }}>{unit.toUpperCase()}</span><span></span>
              </div>
              {pastSets.map((s, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "20px 1fr 1fr 22px", gap: 6, alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: c.muted, textAlign: "center" }}>{i + 1}</span>
                  <input type="number" inputMode="numeric" value={s.reps} onChange={(e) => updatePastSet(i, "reps", e.target.value)} placeholder="0" style={{ padding: "8px 4px", borderRadius: 8, border: `1px solid ${c.line}`, background: c.cream, fontSize: 14, outline: "none", textAlign: "center", boxSizing: "border-box", width: "100%", minWidth: 0 }} />
                  <input type="text" inputMode="decimal" value={s.weight} onChange={(e) => updatePastSet(i, "weight", e.target.value)} placeholder="0" style={{ padding: "8px 4px", borderRadius: 8, border: `1px solid ${c.line}`, background: c.cream, fontSize: 14, outline: "none", textAlign: "center", boxSizing: "border-box", width: "100%", minWidth: 0 }} />
                  <button onClick={() => removePastSet(i)} style={{ background: "none", border: "none", color: c.muted, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={12} /></button>
                </div>
              ))}
              <button onClick={addPastSet} style={{ width: "100%", marginTop: 4, background: c.blushLight, border: `1px dashed ${c.rose}`, borderRadius: 8, padding: 6, color: c.rosedeep, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                <Plus size={11} /> Add set
              </button>
            </div>
            <button onClick={savePastEntry} style={{ width: "100%", background: c.charcoal, color: "white", border: "none", padding: 14, borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Save entry
            </button>
          </div>
        </div>
      )}

      {showPicker && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }} onClick={() => setShowPicker(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: c.cream, width: "100%", maxWidth: 430, borderRadius: "28px 28px 0 0", padding: 24, maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Choose focus lift</h2>
              <button onClick={() => setShowPicker(false)} style={iconBtn}><X size={18} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {allExercises.map(ex => (
                <button
                  key={ex.id}
                  onClick={() => { setFocusLiftName(ex.name); setShowPicker(false); }}
                  style={{ background: ex.name === focusLiftName ? c.blush : c.white, border: `1px solid ${ex.name === focusLiftName ? c.rose : c.line}`, borderRadius: 12, padding: 12, textAlign: "left", cursor: "pointer" }}
                >
                  <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{ex.name}</p>
                  <p style={{ fontSize: 11, color: c.muted, margin: "2px 0 0" }}>{ex.muscle}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- SCHEDULE MODAL ----------
function ScheduleModal({ schedule, myWorkouts, onClose, onSave }) {
  const [draft, setDraft] = useState(schedule);
  const weekOrder = [1, 2, 3, 4, 5, 6, 0];
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: c.cream, width: "100%", maxWidth: 430, borderRadius: "28px 28px 0 0", padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Weekly Schedule</h2>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12, color: c.muted, margin: "0 0 16px" }}>Assign a workout to each day. Wren can swap it if you tell her you're sore or short on time.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {weekOrder.map((dayIdx, i) => (
            <div key={dayIdx} style={{ background: c.white, borderRadius: 14, padding: 12, border: `1px solid ${c.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0, minWidth: 80 }}>{dayNames[i]}</p>
              <select
                value={draft[dayIdx] || ""}
                onChange={(e) => setDraft({ ...draft, [dayIdx]: e.target.value || null })}
                style={{ flex: 1, padding: "8px 10px", borderRadius: 10, border: `1px solid ${c.line}`, background: c.cream, fontSize: 13, outline: "none" }}
              >
                <option value="">Rest day</option>
                {myWorkouts.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <button onClick={() => onSave(draft)} style={{ width: "100%", background: c.charcoal, color: "white", border: "none", padding: 16, borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
          Save Schedule
        </button>
      </div>
    </div>
  );
}

// ---------- BUILDER (pick from exercise DB) ----------
function BuilderModal({ onClose, onSave, existing, allExercises = EXERCISE_DB, onAddCustom }) {
  const [name, setName] = useState(existing?.name || "");
  const [picked, setPicked] = useState(existing?.exercises || []);
  const [search, setSearch] = useState("");
  const [sceneId, setSceneId] = useState(
    SCENES.find(s => s.id === existing?.scene)?.id || SCENES[0].id
  );
  const [tag, setTag] = useState(existing?.tag || null);
  const [supersets, setSupersets] = useState(existing?.supersets || []); // string[][]
  const [targets, setTargets] = useState(existing?.targets || {}); // { [name]: number }
  const [rests, setRests] = useState(existing?.rests || {}); // { [name]: seconds }
  const [setsConfig, setSetsConfig] = useState(existing?.setsConfig || {}); // { [name]: number }
  // Helper: which group index a name belongs to (or -1)
  const groupOf = (n) => supersets.findIndex(g => g.includes(n));
  // Toggle a link between picked[i] and picked[i+1]
  const toggleLink = (i) => {
    const a = picked[i], b = picked[i + 1];
    if (!a || !b) return;
    const ga = groupOf(a), gb = groupOf(b);
    let next = supersets.map(g => [...g]);
    if (ga !== -1 && ga === gb) {
      // unlink: split group at b
      const g = next[ga];
      const ai = g.indexOf(a), bi = g.indexOf(b);
      if (bi - ai === 1) {
        // remove b from this group
        g.splice(bi, 1);
        if (g.length < 2) next.splice(ga, 1);
      }
    } else if (ga !== -1) {
      next[ga].push(b);
      if (gb !== -1) next.splice(gb, 1);
    } else if (gb !== -1) {
      next[gb].unshift(a);
    } else {
      next.push([a, b]);
    }
    setSupersets(next);
  };
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customMuscle, setCustomMuscle] = useState("");
  const [customVideo, setCustomVideo] = useState("");
  const [savingCustom, setSavingCustom] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const isEdit = !!existing;
  const filtered = allExercises.filter(
    (e) => e.name.toLowerCase().includes(search.toLowerCase()) || (e.muscle || "").toLowerCase().includes(search.toLowerCase())
  );
  const extractVideoId = (url) => {
    if (!url) return "";
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
    if (m) return m[1];
    if (/^[\w-]{11}$/.test(url.trim())) return url.trim();
    return "";
  };
  const saveCustom = async () => {
    const n = customName.trim();
    if (!n) return;
    setSavingCustom(true);
    let videoId = extractVideoId(customVideo);
    if (!videoId) {
      try {
        const res = await fetch(`/api/youtube-search?q=${encodeURIComponent(n + " form tutorial")}`);
        if (res.ok) {
          const data = await res.json();
          videoId = data.videoId || "";
        }
      } catch {}
    }
    const ex = { id: `cx${Date.now()}`, name: n, muscle: customMuscle.trim() || "Custom", restSec: 90, tips: [], videoId };
    onAddCustom?.(ex);
    if (!picked.includes(n)) setPicked([...picked, n]);
    setCustomName(""); setCustomMuscle(""); setCustomVideo(""); setShowCustomForm(false); setSearch(""); setSavingCustom(false);
  };

  const togglePick = (name) => {
    if (picked.includes(name)) setPicked(picked.filter((p) => p !== name));
    else {
      setPicked([...picked, name]);
      if (!targets[name]) setTargets({ ...targets, [name]: 10 });
    }
  };

  if (searchOpen) {
    return (
      <div style={{ position: "fixed", inset: 0, background: c.cream, zIndex: 60, display: "flex", flexDirection: "column", maxWidth: 430, margin: "0 auto" }}>
        <div style={{ padding: "20px 20px 12px", borderBottom: `1px solid ${c.line}`, background: c.cream }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <button onClick={() => setSearchOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", color: c.charcoal, padding: 4 }}>
              <ChevronLeft size={22} />
            </button>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, flex: 1 }}>Add exercises</h2>
            <button onClick={() => setSearchOpen(false)} style={{ background: c.charcoal, color: "white", border: "none", borderRadius: 999, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Done · {picked.length}</button>
          </div>
          <div style={{ position: "relative" }}>
            <Search size={16} style={{ position: "absolute", left: 14, top: 14, color: c.muted }} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search lifts (e.g. squat, glute, chest)..."
              style={{ width: "100%", padding: "12px 12px 12px 38px", borderRadius: 14, border: `1px solid ${c.line}`, background: c.white, fontSize: 14, outline: "none", boxSizing: "border-box" }}
            />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>
          {!showCustomForm ? (
            <button
              onClick={() => { setShowCustomForm(true); setCustomName(search.trim()); }}
              style={{ width: "100%", background: c.blushLight, border: `1px dashed ${c.rose}`, borderRadius: 14, padding: 12, marginBottom: 12, color: c.rosedeep, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <Plus size={16} /> Add a new lift to the library
            </button>
          ) : (
            <div style={{ background: c.white, border: `1px solid ${c.line}`, borderRadius: 14, padding: 12, marginBottom: 12 }}>
              <input autoFocus value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Lift name" style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${c.line}`, background: c.cream, fontSize: 14, marginBottom: 8, outline: "none", boxSizing: "border-box" }} />
              <input value={customMuscle} onChange={(e) => setCustomMuscle(e.target.value)} placeholder="Muscle group" style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${c.line}`, background: c.cream, fontSize: 14, marginBottom: 8, outline: "none", boxSizing: "border-box" }} />
              <input value={customVideo} onChange={(e) => setCustomVideo(e.target.value)} placeholder="YouTube URL (optional)" style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${c.line}`, background: c.cream, fontSize: 13, marginBottom: 10, outline: "none", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setShowCustomForm(false); setCustomName(""); setCustomMuscle(""); setCustomVideo(""); }} style={{ flex: 1, background: c.white, border: `1px solid ${c.line}`, color: c.charcoal, padding: 10, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                <button onClick={saveCustom} disabled={!customName.trim() || savingCustom} style={{ flex: 2, background: customName.trim() && !savingCustom ? c.charcoal : c.muted, color: "white", border: "none", padding: 10, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{savingCustom ? "Finding video…" : "Save to library"}</button>
              </div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((ex) => {
              const isPicked = picked.includes(ex.name);
              return (
                <button
                  key={ex.id}
                  onClick={() => togglePick(ex.name)}
                  style={{ background: isPicked ? c.blush : c.white, border: `1px solid ${isPicked ? c.rose : c.line}`, borderRadius: 14, padding: 14, textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{ex.name}</p>
                    <p style={{ fontSize: 11, color: c.muted, margin: "2px 0 0" }}>{ex.muscle}</p>
                  </div>
                  {isPicked ? <Check size={18} color={c.rosedeep} /> : <Plus size={18} color={c.muted} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: c.cream, width: "100%", maxWidth: 430, borderRadius: "28px 28px 0 0", padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{isEdit ? "Edit Workout" : "Build Workout"}</h2>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Workout name..."
          style={{ width: "100%", padding: 14, borderRadius: 14, border: `1px solid ${c.line}`, background: c.white, fontSize: 15, marginBottom: 18, outline: "none", boxSizing: "border-box" }}
        />

        {/* Gradient picker */}
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: c.rosedeep, textTransform: "uppercase", margin: "0 0 10px" }}>Choose a color</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 18 }}>
          {SCENES.map(s => (
            <button
              key={s.id}
              onClick={() => setSceneId(s.id)}
              style={{
                background: s.gradient, border: sceneId === s.id ? `2.5px solid ${c.charcoal}` : "2.5px solid transparent",
                borderRadius: 14, cursor: "pointer", padding: 0, height: 62,
                boxShadow: sceneId === s.id ? "0 6px 18px rgba(0,0,0,0.18)" : "0 2px 8px rgba(0,0,0,0.06)",
                position: "relative",
              }}
              title={s.name}
            >
              {sceneId === s.id && (
                <div style={{ position: "absolute", bottom: 6, right: 6, width: 18, height: 18, borderRadius: "50%", background: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Check size={11} color={c.charcoal} strokeWidth={3} />
                </div>
              )}
            </button>
          ))}
        </div>

        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: c.rosedeep, textTransform: "uppercase", margin: "0 0 10px" }}>Workout type</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {[{ k: null, label: "None" }, { k: "strength", label: "Strength" }, { k: "volume", label: "Volume" }].map(opt => (
            <button
              key={opt.label}
              onClick={() => setTag(opt.k)}
              style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: `1px solid ${tag === opt.k ? c.charcoal : c.line}`, background: tag === opt.k ? c.charcoal : c.white, color: tag === opt.k ? "white" : c.charcoal, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: c.rosedeep, textTransform: "uppercase", margin: "0 0 10px" }}>Pick exercises</p>

        <button
          onClick={() => setSearchOpen(true)}
          style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: `1px solid ${c.line}`, background: c.white, fontSize: 14, marginBottom: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, color: c.muted }}
        >
          <Search size={16} /> Browse & search lifts...
        </button>

        {picked.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: c.rosedeep, textTransform: "uppercase", margin: "8px 0 8px" }}>Selected ({picked.length}) — tap link to make a superset</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {picked.map((p, i) => {
                const g = groupOf(p);
                const next = picked[i + 1];
                const sameGroupNext = next && groupOf(next) === g && g !== -1;
                return (
                  <div key={p + i}>
                    <div style={{ background: g !== -1 ? c.blushLight : c.white, border: `1px solid ${g !== -1 ? c.blush : c.line}`, borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <button disabled={i === 0} onClick={() => { const n = [...picked]; [n[i-1], n[i]] = [n[i], n[i-1]]; setPicked(n); }} style={{ background: "none", border: "none", color: i === 0 ? c.line : c.muted, cursor: i === 0 ? "default" : "pointer", padding: 0, lineHeight: 1 }}>
                          <ChevronLeft size={12} style={{ transform: "rotate(90deg)" }} />
                        </button>
                        <button disabled={i === picked.length - 1} onClick={() => { const n = [...picked]; [n[i], n[i+1]] = [n[i+1], n[i]]; setPicked(n); }} style={{ background: "none", border: "none", color: i === picked.length - 1 ? c.line : c.muted, cursor: i === picked.length - 1 ? "default" : "pointer", padding: 0, lineHeight: 1 }}>
                          <ChevronLeft size={12} style={{ transform: "rotate(-90deg)" }} />
                        </button>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: c.charcoal, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={setsConfig[p] || ""}
                          onChange={(e) => setSetsConfig({ ...setsConfig, [p]: e.target.value ? parseInt(e.target.value) : undefined })}
                          placeholder="3"
                          style={{ width: 28, padding: "4px 2px", borderRadius: 6, border: `1px solid ${c.line}`, background: c.white, fontSize: 12, textAlign: "center", outline: "none" }}
                          title="Number of sets"
                        />
                        <span style={{ fontSize: 10, color: c.muted, fontWeight: 600 }}>sets</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={targets[p] || ""}
                          onChange={(e) => setTargets({ ...targets, [p]: e.target.value ? parseInt(e.target.value) : undefined })}
                          placeholder="10"
                          style={{ width: 28, padding: "4px 2px", borderRadius: 6, border: `1px solid ${c.line}`, background: c.white, fontSize: 12, textAlign: "center", outline: "none" }}
                          title="Target reps"
                        />
                        <span style={{ fontSize: 10, color: c.muted, fontWeight: 600 }}>reps</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input
                          type="text"
                          inputMode="decimal"
                          defaultValue={rests[p] ? (rests[p] / 60).toFixed(rests[p] % 60 === 0 ? 0 : 1) : ""}
                          onBlur={(e) => {
                            const mins = parseFloat(e.target.value);
                            setRests({ ...rests, [p]: isFinite(mins) && mins > 0 ? Math.round(mins * 60) : undefined });
                          }}
                          placeholder="1.5"
                          style={{ width: 36, padding: "4px 4px", borderRadius: 6, border: `1px solid ${c.line}`, background: c.white, fontSize: 12, textAlign: "center", outline: "none" }}
                          title="Rest time in minutes"
                        />
                        <span style={{ fontSize: 10, color: c.muted, fontWeight: 600 }}>min</span>
                      </div>
                      <button onClick={() => setPicked(picked.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: c.muted, cursor: "pointer", padding: 0 }}><X size={14} /></button>
                    </div>
                    {next && (
                      <div style={{ display: "flex", justifyContent: "center", padding: "2px 0" }}>
                        <button
                          onClick={() => toggleLink(i)}
                          title={sameGroupNext ? "Unlink superset" : "Link as superset"}
                          style={{ background: sameGroupNext ? c.rosedeep : c.white, border: `1px solid ${sameGroupNext ? c.rosedeep : c.line}`, borderRadius: 999, width: 24, height: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: sameGroupNext ? "white" : c.muted }}
                        >
                          {sameGroupNext ? <Link2 size={12} /> : <Link2Off size={12} />}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          disabled={!name.trim() || !picked.length}
          onClick={() => onSave({ id: existing?.id || `c${Date.now()}`, name, exercises: picked, scene: sceneId, tag, supersets: supersets.filter(g => g.length >= 2), targets, rests, setsConfig })}
          style={{ width: "100%", background: !name.trim() || !picked.length ? c.muted : c.charcoal, color: "white", border: "none", padding: 16, borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
        >
          {isEdit ? "Save Changes" : "Save Workout"}
        </button>
      </div>
    </div>
  );
}

// ---------- IMPORT HISTORY ----------
function ImportHistoryModal({ workout, onClose, onSave, mode = "create" }) {
  const unit = useUnit();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState(() =>
    workout.exercises.map(name => ({ name, sets: [{ reps: "", weight: "" }, { reps: "", weight: "" }, { reps: "", weight: "" }] }))
  );
  const updateSet = (ei, si, field, val) => {
    const next = rows.map((r, i) => i === ei ? { ...r, sets: r.sets.map((s, j) => j === si ? { ...s, [field]: val } : s) } : r);
    setRows(next);
  };
  const addSet = (ei) => setRows(rows.map((r, i) => i === ei ? { ...r, sets: [...r.sets, { reps: "", weight: "" }] } : r));
  const removeSet = (ei, si) => setRows(rows.map((r, i) => i === ei ? { ...r, sets: r.sets.filter((_, j) => j !== si) } : r));
  const handleSave = () => {
    const dateObj = date ? new Date(date + "T12:00:00") : new Date();
    const data = { date: dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" }), finishedAt: dateObj.getTime(), exercises: {} };
    rows.forEach(r => {
      const valid = r.sets
        .map(s => ({ reps: toNum(s.reps), weight: toNum(s.weight) }))
        .filter(s => s.reps && s.weight);
      if (valid.length) data.exercises[r.name] = valid;
    });
    if (Object.keys(data.exercises).length === 0) return onClose();
    onSave(data);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: c.cream, width: "100%", maxWidth: 430, borderRadius: "28px 28px 0 0", padding: 20, maxHeight: "90vh", overflowY: "auto", overflowX: "hidden", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{mode === "backfill" ? "Log past session" : "Got previous data?"}</h2>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12, color: c.muted, margin: "0 0 12px", lineHeight: 1.5 }}>
          {mode === "backfill"
            ? "Add a workout you did in the past. Pick the date and your top sets — it'll show up in your history and Focus Lift charts."
            : "If you've been doing these lifts already, add your last top set — Wren will use it as a starting point. Skip if you're starting fresh."}
        </p>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ width: "100%", padding: 12, borderRadius: 12, border: `1px solid ${c.line}`, background: c.white, fontSize: 14, marginBottom: 12, outline: "none", boxSizing: "border-box", fontFamily: "inherit", color: c.charcoal }}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {rows.map((r, ei) => {
            const inp = { padding: "8px 4px", borderRadius: 8, border: `1px solid ${c.line}`, background: c.cream, fontSize: 14, outline: "none", textAlign: "center", boxSizing: "border-box", width: "100%", minWidth: 0 };
            return (
              <div key={ei} style={{ background: c.white, border: `1px solid ${c.line}`, borderRadius: 14, padding: 12, boxSizing: "border-box" }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px", overflowWrap: "anywhere" }}>{r.name}</p>
                <div style={{ display: "grid", gridTemplateColumns: "20px 1fr 1fr 22px", gap: 6, fontSize: 9, color: c.muted, marginBottom: 4, letterSpacing: 0.5, alignItems: "center" }}>
                  <span>SET</span><span style={{ textAlign: "center" }}>REPS</span><span style={{ textAlign: "center" }}>{unit.toUpperCase()}</span><span></span>
                </div>
                {r.sets.map((s, si) => (
                  <div key={si} style={{ display: "grid", gridTemplateColumns: "20px 1fr 1fr 22px", gap: 6, alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: c.muted, textAlign: "center" }}>{si + 1}</span>
                    <input type="number" inputMode="numeric" value={s.reps} onChange={(e) => updateSet(ei, si, "reps", e.target.value)} placeholder="0" style={inp} />
                    <input type="text" inputMode="decimal" value={s.weight} onChange={(e) => updateSet(ei, si, "weight", e.target.value)} placeholder="0" style={inp} />
                    <button onClick={() => removeSet(ei, si)} style={{ background: "none", border: "none", color: c.muted, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button onClick={() => addSet(ei)} style={{ width: "100%", marginTop: 4, background: c.blushLight, border: `1px dashed ${c.rose}`, borderRadius: 8, padding: 6, color: c.rosedeep, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <Plus size={11} /> Add set
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, background: c.white, border: `1px solid ${c.line}`, color: c.charcoal, padding: 14, borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Skip
          </button>
          <button onClick={handleSave} style={{ flex: 2, background: c.charcoal, color: "white", border: "none", padding: 14, borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Save history
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- COACH ----------
function CoachView({ chat, chatInput, setChatInput, sendChat, chatHistory = [], loadChat, startNewChat, deleteChatFromHistory, currentChatId }) {
  const [showHistory, setShowHistory] = useState(false);
  return (
    <div style={{ padding: "8px 24px", display: "flex", flexDirection: "column", height: "calc(100vh - 220px)" }}>
      <div style={{ background: `linear-gradient(135deg, ${c.blush}, ${c.blushLight})`, borderRadius: 18, padding: 16, marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: c.white, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Sparkles size={22} color={c.rosedeep} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Wren 🌙 — AI Coach</p>
          <p style={{ fontSize: 12, color: c.muted, margin: "2px 0 0" }}>Share goals, injuries, or how you feel</p>
        </div>
        <button onClick={() => setShowHistory(true)} title="Chat history" style={{ background: c.white, border: `1px solid ${c.line}`, borderRadius: 999, padding: "6px 12px", fontSize: 11, fontWeight: 700, color: c.charcoal, cursor: "pointer", letterSpacing: 0.3, display: "flex", alignItems: "center", gap: 4 }}>
          <History size={12} /> History
        </button>
      </div>

      {showHistory && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200 }} onClick={() => setShowHistory(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: c.cream, width: "100%", maxWidth: 430, borderRadius: "28px 28px 0 0", padding: 24, maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Past chats</h2>
              <button onClick={() => setShowHistory(false)} style={iconBtn}><X size={18} /></button>
            </div>
            <button onClick={() => { startNewChat(); setShowHistory(false); }} style={{ width: "100%", background: c.charcoal, color: "white", border: "none", padding: 12, borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Plus size={14} /> New chat
            </button>
            {chatHistory.length === 0 ? (
              <p style={{ fontSize: 12, color: c.muted, textAlign: "center", margin: "20px 0" }}>No past chats yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {chatHistory.map(ch => (
                  <div key={ch.id} style={{ background: ch.id === currentChatId ? c.blushLight : c.white, border: `1px solid ${ch.id === currentChatId ? c.blush : c.line}`, borderRadius: 12, padding: 12, display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={() => { loadChat(ch.id); setShowHistory(false); }} style={{ flex: 1, minWidth: 0, background: "none", border: "none", textAlign: "left", cursor: "pointer", padding: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: c.charcoal, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.title}</p>
                      <p style={{ fontSize: 11, color: c.muted, margin: "2px 0 0" }}>{new Date(ch.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {ch.messages.length} messages</p>
                    </button>
                    <button onClick={() => deleteChatFromHistory(ch.id)} style={{ background: "none", border: "none", color: c.muted, cursor: "pointer", padding: 4 }} title="Delete chat"><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 12 }}>
        {chat.map((m, i) => {
          const workoutActions = (m.actions || []).filter(a => a.type === "create_workout");
          return (
            <div key={i} style={{ alignSelf: m.from === "user" ? "flex-end" : "flex-start", maxWidth: "88%", display: "flex", flexDirection: "column", gap: 8, alignItems: m.from === "user" ? "flex-end" : "flex-start" }}>
              {m.text && (
                <div style={{ background: m.from === "user" ? c.charcoal : c.white, color: m.from === "user" ? "white" : c.charcoal, border: m.from === "user" ? "none" : `1px solid ${c.line}`, padding: "12px 16px", borderRadius: 18, fontSize: 14, lineHeight: 1.5 }}>
                  {m.text}
                </div>
              )}
              {workoutActions.map((a, j) => {
                const sceneId = defaultSceneFor(a.name);
                return (
                  <div key={j} style={{ width: "100%", borderRadius: 18, overflow: "hidden", border: `1px solid ${c.line}`, boxShadow: "0 6px 18px rgba(180,140,200,0.18)" }}>
                    <div style={{ position: "relative", height: 80 }}>
                      <SceneSvg id={sceneId} />
                      <div style={{ position: "absolute", inset: 0, padding: 14, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                        <p style={{ fontSize: 9, fontWeight: 700, color: "white", letterSpacing: 1.2, margin: 0, textTransform: "uppercase", textShadow: "0 1px 4px rgba(0,0,0,0.25)" }}>New workout</p>
                        <p style={{ fontSize: 18, fontWeight: 700, color: "white", margin: "2px 0 0", textShadow: "0 2px 6px rgba(0,0,0,0.3)" }}>{a.name}</p>
                      </div>
                    </div>
                    <div style={{ background: c.white, padding: 14 }}>
                      {(a.exercises || []).map((ex, k) => {
                        const t = a.targets?.[ex];
                        return (
                          <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: k < a.exercises.length - 1 ? `1px solid ${c.line}` : "none" }}>
                            <div style={{ width: 22, height: 22, borderRadius: 6, background: c.blushLight, color: c.rosedeep, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{k + 1}</div>
                            <span style={{ fontSize: 13, color: c.charcoal, fontWeight: 500, flex: 1, minWidth: 0 }}>{ex}</span>
                            {t && <span style={{ fontSize: 10, fontWeight: 700, color: c.rosedeep, background: c.blushLight, padding: "2px 7px", borderRadius: 999 }}>🎯 {t}</span>}
                          </div>
                        );
                      })}
                      <p style={{ fontSize: 11, color: c.muted, margin: "10px 0 0", textAlign: "center" }}>Saved to your workouts</p>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendChat()}
          placeholder="e.g. what should I do today?"
          style={{ flex: 1, padding: "14px 18px", borderRadius: 24, border: `1px solid ${c.line}`, background: c.white, fontSize: 14, outline: "none" }}
        />
        <button onClick={sendChat} style={{ background: c.rosedeep, border: "none", borderRadius: "50%", width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "white" }}>
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

// ---------- PROGRESS ----------
function ProgressView({ onSessionsChange, onExerciseTap }) {
  const [bump, setBump] = useState(0);
  const sessions = useMemo(
    () => getSessions().slice().sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0)),
    [bump]
  );
  const [editing, setEditing] = useState(null);
  const refresh = () => { setBump((b) => b + 1); if (onSessionsChange) onSessionsChange(); };

  // Group sessions by month label.
  const groups = useMemo(() => {
    const out = {};
    for (const s of sessions) {
      const d = new Date(s.finishedAt || 0);
      const key = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      (out[key] ||= []).push(s);
    }
    return Object.entries(out);
  }, [sessions]);

  return (
    <div style={{ padding: "8px 24px 24px" }}>
      <SectionTitle title="History" subtitle={`${sessions.length} session${sessions.length === 1 ? "" : "s"} logged`} />
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 18 }}>
        {sessions.length === 0 && (
          <p style={{ fontSize: 13, color: c.muted, margin: 0 }}>
            No sessions logged yet. Finish a workout and it'll show up here.
          </p>
        )}
        {groups.map(([month, items]) => (
          <div key={month}>
            <p style={{ fontSize: 11, fontWeight: 700, color: c.muted, letterSpacing: 1, textTransform: "uppercase", margin: "0 0 8px" }}>{month}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((s) => {
                const totalSets = Object.values(s.exercises || {}).reduce((n, arr) => n + arr.length, 0);
                const totalVolume = Object.values(s.exercises || {}).reduce(
                  (n, arr) => n + arr.reduce((m, set) => m + (Number(set.reps) || 0) * (Number(set.weight) || 0), 0),
                  0
                );
                const exNames = Object.keys(s.exercises || {});
                return (
                  <button
                    key={s.finishedAt + "|" + s.workoutName}
                    onClick={() => setEditing(s)}
                    style={{
                      background: c.white,
                      border: `1px solid ${c.line}`,
                      borderRadius: 14,
                      padding: 14,
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: c.charcoal }}>{s.workoutName}</p>
                      <p style={{ fontSize: 11, color: c.muted, margin: 0, whiteSpace: "nowrap" }}>
                        {new Date(s.finishedAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </p>
                    </div>
                    {exNames.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: 0 }}>
                        {exNames.slice(0, 4).map((n) => (
                          <button
                            key={n}
                            onClick={(e) => { e.stopPropagation(); if (onExerciseTap) onExerciseTap(n); }}
                            style={{ fontSize: 10, color: c.rosedeep, background: c.blushLight, border: "none", borderRadius: 999, padding: "2px 8px", cursor: "pointer", fontWeight: 600 }}
                          >
                            {n}
                          </button>
                        ))}
                        {exNames.length > 4 && <span style={{ fontSize: 10, color: c.muted, padding: "2px 0" }}>+{exNames.length - 4}</span>}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 14, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: c.rosedeep, fontWeight: 600 }}>{totalSets} sets</span>
                      {totalVolume > 0 && <span style={{ fontSize: 11, color: c.rosedeep, fontWeight: 600 }}>{Math.round(totalVolume)} kg volume</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <SessionEditModal
          session={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => { updateSession(editing.finishedAt, patch); setEditing(null); refresh(); }}
          onDelete={() => { deleteSession(editing.finishedAt); setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}
