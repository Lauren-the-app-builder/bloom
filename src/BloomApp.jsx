import { useState, useMemo, useEffect, useRef } from "react";
import { useLocalState, recordSession, getSessions } from "./lib/storage";
import { askWren } from "./lib/wren";
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
  Info,
  Heart,
  Timer,
  History,
  Calendar,
} from "lucide-react";

// ---------- design tokens ----------
const c = {
  blush: "#F4B8D4",
  blushLight: "#FBEFEC",
  cream: "#FBF6F4",
  rose: "#C8B4E8",
  rosedeep: "#C97AAE",
  charcoal: "#3B2B4A",
  muted: "#7A6B85",
  line: "#EFE6F2",
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
  { id: "e1", name: "Hip Thrust", muscle: "Glutes", restSec: 120, tips: ["Drive through your heels, not your toes", "Squeeze glutes hard at the top — pause 1 sec", "Keep chin tucked and ribs down", "Bar over your hips, feet shoulder-width"], videoId: "LM8XHLYJoYs" },
  { id: "e2", name: "Romanian Deadlift", muscle: "Hamstrings", restSec: 120, tips: ["Hinge at the hips, not the knees", "Bar stays close to your legs", "Feel a deep stretch in your hamstrings", "Neutral spine — no rounding"], videoId: "JCXUYuzwNrM" },
  { id: "e3", name: "Bulgarian Split Squat", muscle: "Quads/Glutes", restSec: 90, tips: ["Front foot far enough that knee tracks over ankle", "Lean slightly forward for glute focus", "Lower under control — 2 sec down", "Drive through full foot"], videoId: "2C-uNgKwPLE" },
  { id: "e4", name: "Cable Kickback", muscle: "Glutes", restSec: 60, tips: ["Squeeze glute, not lower back", "Slow eccentric — control the return", "Keep hips square to the cable"], videoId: "SqO-VUEAg7I" },
  { id: "e5", name: "Hip Abduction", muscle: "Glutes", restSec: 60, tips: ["Lean forward slightly to target upper glutes", "Pause at the top of each rep", "Don't use momentum"], videoId: "WJaRlwBFRyo" },
  { id: "e6", name: "DB Bench Press", muscle: "Chest", restSec: 90, tips: ["Retract shoulder blades, slight arch", "Lower DBs to mid-chest level", "Press in a slight arc inward", "Feet planted firmly"], videoId: "VmB1G1K7v94" },
  { id: "e7", name: "Incline DB Press", muscle: "Upper chest", restSec: 90, tips: ["Bench at 30° (not too steep)", "Elbows ~45° from torso", "Full range of motion"], videoId: "8iPEnn-ltC8" },
  { id: "e8", name: "Lateral Raise", muscle: "Side delts", restSec: 60, tips: ["Lead with elbows, not hands", "Raise to shoulder height — no higher", "Slight forward lean"], videoId: "3VcKaXpzqRo" },
  { id: "e9", name: "Lat Pulldown", muscle: "Lats", restSec: 90, tips: ["Pull elbows down and back", "Squeeze lats at the bottom", "Don't lean back excessively"], videoId: "CAwf7n6Luuc" },
  { id: "e10", name: "Seated Cable Row", muscle: "Mid back", restSec: 90, tips: ["Chest up, shoulders down", "Pull to lower ribs", "Squeeze shoulder blades"], videoId: "GZbfZ033f74" },
  { id: "e11", name: "DB Curl", muscle: "Biceps", restSec: 60, tips: ["Elbows pinned at sides", "Full supination at the top", "Slow eccentric"], videoId: "ykJmrZ5v0Oo" },
  { id: "e12", name: "Tricep Pushdown", muscle: "Triceps", restSec: 60, tips: ["Elbows pinned, only forearms move", "Squeeze at the bottom", "Don't lean over the bar"], videoId: "2-LAMcpzODU" },
  { id: "e13", name: "Back Squat", muscle: "Quads", restSec: 150, tips: ["Brace core hard before each rep", "Knees track over toes", "Hit at least parallel", "Drive chest up out of the hole"], videoId: "ultWZbUMPL8" },
  { id: "e14", name: "Leg Press", muscle: "Quads", restSec: 120, tips: ["Feet shoulder-width", "Don't lock out knees", "Control the descent"], videoId: "IZxyjW7MPJQ" },
  { id: "e15", name: "Walking Lunge", muscle: "Quads/Glutes", restSec: 90, tips: ["Long stride for glute focus", "Back knee almost touches floor", "Stay tall through the torso"], videoId: "L8fvypPrzzs" },
  { id: "e16", name: "Barbell Overhead Press", muscle: "Shoulders", restSec: 150, tips: ["Brace core, squeeze glutes", "Bar starts at collarbone", "Press straight up, head through at lockout", "Don't flare elbows excessively"], videoId: "2yjwXTZQDDI" },
];

// ---------- focus lift data ----------
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
const SEED_PRS = [
  { lift: "Hip Thrust", value: "225 lb × 8", date: "Mar 24", icon: "👑" },
  { lift: "Back Squat", value: "165 lb × 5", date: "Mar 18", icon: "🏆" },
  { lift: "RDL", value: "135 lb × 10", date: "Mar 30", icon: "🌟" },
  { lift: "DB Bench", value: "35 lb × 10", date: "Apr 1", icon: "💪" },
];

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

// ---------- main ----------
export default function BloomApp() {
  const [tab, setTab] = useState("home");
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
  const [chat, setChat] = useLocalState("chat", [
    { from: "coach", text: "Hi Lauren! I'm Wren 🌙 — your coach. I can see your workouts, PRs, schedule, and history. Try asking 'what should I do today?' or 'am I plateauing on hip thrust?'" },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [coachContext, setCoachContext] = useLocalState("coachContext", []);

  const sendChat = async () => {
    if (!chatInput.trim()) return;
    const userMsg = { from: "user", text: chatInput };
    const currentInput = chatInput;
    setChat([...chat, userMsg, { from: "coach", text: "…" }]);
    setChatInput("");
    setCoachContext([...coachContext, currentInput]);

    try {
      const reply = await askWren(currentInput, {
        myWorkouts,
        schedule,
        sessions: getSessions(),
        history: chat.slice(-10),
      });
      setChat(c => {
        const next = [...c];
        next[next.length - 1] = { from: "coach", text: reply };
        return next;
      });
    } catch (e) {
      setChat(c => {
        const next = [...c];
        next[next.length - 1] = { from: "coach", text: "Couldn't reach Wren — check your connection." };
        return next;
      });
    }
  };

  return (
    <div style={{ background: c.cream, minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", color: c.charcoal }}>
      <div style={{ maxWidth: 430, margin: "0 auto", paddingBottom: 100, position: "relative", minHeight: "100vh" }}>
        <header style={{ padding: "28px 24px 8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <p style={{ fontSize: 11, color: c.muted, margin: 0, letterSpacing: 1.5 }}>MON · APR 6</p>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: `linear-gradient(135deg, ${c.rose}, ${c.blush})`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "white", fontSize: 14 }}>L</div>
          </div>
          <h1 style={{ fontSize: 32, margin: 0, fontWeight: 800, letterSpacing: -0.8, background: `linear-gradient(90deg, ${c.rosedeep}, ${c.rose})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Bloom</h1>
          <p style={{ fontSize: 13, color: c.muted, margin: "2px 0 0" }}>Hi Lauren <Heart size={12} style={{ color: c.rosedeep, verticalAlign: "middle" }} fill={c.rosedeep} /></p>
        </header>

        {tab === "home" && <HomeView setTab={setTab} myWorkouts={myWorkouts} setActiveWorkout={setActiveWorkout} coachContext={coachContext} schedule={schedule} setShowSchedule={setShowSchedule} setShowFocusLift={setShowFocusLift} setShowWeek={setShowWeek} />}
        {tab === "workouts" && <WorkoutsView myWorkouts={myWorkouts} setActiveWorkout={setActiveWorkout} setShowBuilder={setShowBuilder} />}
        {tab === "coach" && <CoachView chat={chat} chatInput={chatInput} setChatInput={setChatInput} sendChat={sendChat} />}
        {tab === "progress" && <ProgressView />}

        {activeWorkout && !inProgress && (
          <WorkoutPreview
            workout={activeWorkout}
            onClose={() => setActiveWorkout(null)}
            onStart={() => {
              setInProgress(activeWorkout);
              setActiveWorkout(null);
            }}
          />
        )}

        {inProgress && <ActiveWorkout workout={inProgress} onFinish={() => setInProgress(null)} />}

        {showFocusLift && <FocusLiftView onClose={() => setShowFocusLift(false)} />}

        {showWeek && <WeekOverview onClose={() => setShowWeek(false)} />}

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
            onClose={() => setShowBuilder(false)}
            onSave={(w) => {
              setMyWorkouts([...myWorkouts, w]);
              setShowBuilder(false);
            }}
          />
        )}

        <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(20px)", borderTop: `1px solid ${c.line}`, padding: "12px 0 24px", display: "flex", justifyContent: "space-around", zIndex: 10 }}>
          <NavBtn icon={Home} label="Home" active={tab === "home"} onClick={() => setTab("home")} />
          <NavBtn icon={Dumbbell} label="Workouts" active={tab === "workouts"} onClick={() => setTab("workouts")} />
          <NavBtn icon={Trophy} label="Focus" active={false} onClick={() => setShowFocusLift(true)} />
          <NavBtn icon={Sparkles} label="Coach" active={tab === "coach"} onClick={() => setTab("coach")} />
          <NavBtn icon={TrendingUp} label="Progress" active={tab === "progress"} onClick={() => setTab("progress")} />
        </nav>
      </div>
    </div>
  );
}

function NavBtn({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: active ? c.rosedeep : c.muted, cursor: "pointer" }}>
      <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
      <span style={{ fontSize: 11, fontWeight: active ? 600 : 500 }}>{label}</span>
    </button>
  );
}

// ---------- HOME ----------
function HomeView({ setTab, myWorkouts, setActiveWorkout, coachContext, schedule, setShowSchedule, setShowFocusLift, setShowWeek }) {
  const today = new Date().getDay();
  const todayId = schedule[today];
  const todayWorkout = myWorkouts.find((w) => w.id === todayId);
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div style={{ padding: "8px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <SectionTitle title="Today's Workout" />
        <button onClick={() => setShowSchedule(true)} style={{ background: "none", border: "none", color: c.rosedeep, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          <Calendar size={14} /> Schedule
        </button>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {dayNames.map((d, i) => {
          const has = schedule[i];
          const isToday = i === today;
          return (
            <div key={i} style={{ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 12, background: isToday ? c.rosedeep : has ? c.blush : c.white, color: isToday ? "white" : c.charcoal, border: `1px solid ${isToday ? c.rosedeep : c.line}` }}>
              <p style={{ fontSize: 10, margin: 0, opacity: 0.7 }}>{d}</p>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: has ? (isToday ? "white" : c.rosedeep) : "transparent", margin: "4px auto 0" }} />
            </div>
          );
        })}
      </div>
      {todayWorkout ? (
        <button
          onClick={() => setActiveWorkout(todayWorkout)}
          style={{ width: "100%", background: gradientFor(todayWorkout.name), color: "white", border: "none", borderRadius: 28, padding: 22, textAlign: "left", cursor: "pointer", marginBottom: 20, boxShadow: "0 16px 36px rgba(180,140,200,0.3)" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ fontSize: 11, opacity: 0.95, margin: 0, letterSpacing: 1, fontWeight: 600, textTransform: "uppercase" }}>Today · Ready to go</p>
              <p style={{ fontSize: 22, fontWeight: 700, margin: "6px 0 0" }}>{todayWorkout.name}</p>
              <p style={{ fontSize: 12, opacity: 0.9, margin: "4px 0 0" }}>{todayWorkout.exercises.length} lifts · ~{todayWorkout.exercises.length * 12} min</p>
            </div>
            <div style={{ background: "rgba(255,255,255,0.3)", backdropFilter: "blur(10px)", borderRadius: "50%", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronRight size={22} />
            </div>
          </div>
        </button>
      ) : (
        <div style={{ background: c.white, border: `1px solid ${c.line}`, borderRadius: 20, padding: 24, textAlign: "center", marginBottom: 20 }}>
          <p style={{ fontSize: 24, margin: 0 }}>🌿</p>
          <p style={{ fontSize: 15, fontWeight: 600, margin: "8px 0 4px" }}>Rest day</p>
          <p style={{ fontSize: 12, color: c.muted, margin: 0 }}>Recovery is where the magic happens</p>
        </div>
      )}

      <button onClick={() => setShowWeek(true)} style={{ width: "100%", textAlign: "left", background: `linear-gradient(135deg, ${c.blush} 0%, ${c.blushLight} 100%)`, border: "none", borderRadius: 24, padding: 24, marginBottom: 20, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ fontSize: 12, color: c.rosedeep, fontWeight: 600, letterSpacing: 0.5, margin: 0 }}>THIS WEEK</p>
          <h2 style={{ fontSize: 32, margin: "6px 0", fontWeight: 700, letterSpacing: -1 }}>4 / 5</h2>
          <p style={{ fontSize: 13, color: c.charcoal, margin: 0 }}>workouts complete · tap for details</p>
        </div>
        <ChevronRight size={22} color={c.rosedeep} />
      </button>

      {/* focus lift card */}
      <button
        onClick={() => setShowFocusLift(true)}
        style={{ width: "100%", background: c.white, border: `1px solid ${c.line}`, borderRadius: 20, padding: 18, marginBottom: 20, textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <div>
          <p style={{ fontSize: 11, color: c.rosedeep, fontWeight: 700, margin: 0, letterSpacing: 0.5 }}>⭐ FOCUS LIFT</p>
          <p style={{ fontSize: 16, fontWeight: 600, margin: "4px 0 2px" }}>{FOCUS_LIFT.name}</p>
          <p style={{ fontSize: 12, color: c.muted, margin: 0 }}>+20 lb on volume · +20 lb on strength since Feb 10</p>
        </div>
        <ChevronRight size={18} color={c.muted} />
      </button>

      <SectionTitle title="Recent PBs" subtitle="Personal records you've smashed 💪" />
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, marginBottom: 24, marginTop: 12 }}>
        {SEED_PRS.map((pr, i) => (
          <div key={i} style={{ background: c.white, borderRadius: 18, padding: 16, border: `1px solid ${c.line}`, minWidth: 150 }}>
            <div style={{ fontSize: 24 }}>{pr.icon}</div>
            <p style={{ fontSize: 12, color: c.muted, margin: "8px 0 2px" }}>{pr.lift}</p>
            <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: c.rosedeep }}>{pr.value}</p>
            <p style={{ fontSize: 11, color: c.muted, margin: "4px 0 0" }}>{pr.date}</p>
          </div>
        ))}
      </div>

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
function WorkoutsView({ myWorkouts, setActiveWorkout, setShowBuilder }) {
  return (
    <div style={{ padding: "8px 24px" }}>
      <button
        onClick={() => setShowBuilder(true)}
        style={{ width: "100%", background: c.blush, border: `1px dashed ${c.rose}`, borderRadius: 18, padding: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", marginBottom: 20, color: c.rosedeep, fontWeight: 600, fontSize: 14 }}
      >
        <Plus size={18} /> Build a workout
      </button>

      <SectionTitle title="My Workouts" subtitle={`${myWorkouts.length} saved`} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {myWorkouts.map((w) => (
          <button
            key={w.id}
            onClick={() => setActiveWorkout(w)}
            style={{ background: gradientFor(w.name), border: "none", borderRadius: 22, padding: 18, textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", color: "white", boxShadow: "0 10px 24px rgba(180,140,200,0.22)" }}
          >
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{w.name}</p>
              <p style={{ fontSize: 12, opacity: 0.9, margin: "4px 0 0" }}>
                {w.exercises.length} lifts · {w.exercises.slice(0, 2).join(" · ")}{w.exercises.length > 2 ? "..." : ""}
              </p>
            </div>
            <div style={{ background: "rgba(255,255,255,0.3)", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronRight size={18} color="white" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- WORKOUT PREVIEW (with last session + targets) ----------
function WorkoutPreview({ workout, onClose, onStart }) {
  const last = LAST_SESSIONS[workout.name];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: c.cream, width: "100%", maxWidth: 430, maxHeight: "90vh", borderRadius: "28px 28px 0 0", overflowY: "auto" }}>
        <div style={{ padding: "20px 24px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${c.line}`, position: "sticky", top: 0, background: c.cream, zIndex: 2 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{workout.name}</h2>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
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
              const ex = EXERCISE_DB.find((e) => e.name === exName);
              const lastEx = last?.exercises[exName];
              return (
                <div key={i} style={{ background: c.white, borderRadius: 16, padding: 14, border: `1px solid ${c.line}` }}>
                  <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{exName}</p>
                  <p style={{ fontSize: 12, color: c.muted, margin: "4px 0 0" }}>
                    {ex?.muscle} · Rest {ex ? Math.floor(ex.restSec / 60) + ":" + String(ex.restSec % 60).padStart(2, "0") : "—"}
                  </p>
                  {lastEx && (
                    <div style={{ marginTop: 10, padding: "8px 12px", background: c.cream, borderRadius: 10 }}>
                      <p style={{ fontSize: 11, color: c.muted, margin: 0 }}>Last: {lastEx.length}×{lastEx[0].reps} @ {lastEx[0].weight}lb</p>
                      <p style={{ fontSize: 11, color: c.rosedeep, margin: "2px 0 0", fontWeight: 600 }}>Target today: {lastEx.length}×{lastEx[0].reps} @ {lastEx[0].weight + 5}lb ✨</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button onClick={onStart} style={{ width: "100%", background: c.charcoal, color: "white", border: "none", padding: 18, borderRadius: 16, fontSize: 16, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Play size={18} fill="white" /> Start Workout
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- ACTIVE WORKOUT (gymshark-style) ----------
function ActiveWorkout({ workout, onFinish }) {
  const last = LAST_SESSIONS[workout.name];
  const [overallGoal, setOverallGoal] = useState("Beat last session: add +5 lb to your top set");
  const [exerciseGoals, setExerciseGoals] = useState(() => {
    const map = {};
    workout.exercises.forEach((name) => {
      const lastEx = last?.exercises[name];
      if (lastEx) {
        map[name] = `Last: ${lastEx.length}×${lastEx[0].reps} @ ${lastEx[0].weight}lb · Target: ${lastEx.length}×${lastEx[0].reps} @ ${lastEx[0].weight + 5}lb ✨`;
      } else {
        map[name] = "First time! Find a working weight you can hit for 8–10 reps.";
      }
    });
    return map;
  });
  const [showCoach, setShowCoach] = useState(false);
  const [coachMsgs, setCoachMsgs] = useState([
    { from: "coach", text: `You're crushing ${workout.name} today! Ask me to adjust any exercise goal — e.g. "make hip thrust easier" or "push harder on RDLs".` },
  ]);
  const [coachInput, setCoachInput] = useState("");
  const sendMidWorkoutChat = async () => {
    if (!coachInput.trim()) return;
    const u = { from: "user", text: coachInput };
    const current = coachInput;
    setCoachMsgs([...coachMsgs, u, { from: "coach", text: "…" }]);
    setCoachInput("");
    try {
      const reply = await askWren(current, {
        myWorkouts: [workout],
        schedule: {},
        sessions: getSessions(),
        history: coachMsgs.slice(-6),
      }, true);
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
  const [elapsed, setElapsed] = useState(0);
  const [sets, setSets] = useState(
    workout.exercises.map((name) => {
      const lastEx = last?.exercises[name];
      const numSets = lastEx?.length || 3;
      return {
        name,
        rows: Array.from({ length: numSets }).map((_, i) => ({
          reps: "",
          weight: "",
          done: false,
          targetReps: lastEx?.[i]?.reps || "",
          targetWeight: lastEx ? (lastEx[i]?.weight || 0) + 5 : "",
        })),
      };
    })
  );
  const [showFormTips, setShowFormTips] = useState(null);
  const [restTimer, setRestTimer] = useState(null); // {sec, total}

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!restTimer || restTimer.sec <= 0) return;
    const t = setTimeout(() => setRestTimer({ ...restTimer, sec: restTimer.sec - 1 }), 1000);
    return () => clearTimeout(t);
  }, [restTimer]);

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const updateRow = (ei, ri, field, val) => {
    const next = [...sets];
    next[ei].rows[ri][field] = val;
    setSets(next);
  };

  const toggleDone = (ei, ri) => {
    const next = [...sets];
    next[ei].rows[ri].done = !next[ei].rows[ri].done;
    setSets(next);
    if (next[ei].rows[ri].done) {
      const ex = EXERCISE_DB.find((e) => e.name === next[ei].name);
      const rest = ex?.restSec || 90;
      setRestTimer({ sec: rest, total: rest, exercise: next[ei].name });
    }
  };

  const addSet = (ei) => {
    const next = [...sets];
    next[ei].rows.push({ reps: "", weight: "", done: false, targetReps: "", targetWeight: "" });
    setSets(next);
  };

  const removeSet = (ei, ri) => {
    const next = [...sets];
    next[ei].rows.splice(ri, 1);
    setSets(next);
  };

  const removeExercise = (ei) => {
    if (!confirm("Remove this exercise from today's workout?")) return;
    setSets(sets.filter((_, i) => i !== ei));
  };

  const adjustRest = (delta) => {
    if (!restTimer) return;
    setRestTimer({ ...restTimer, sec: Math.max(0, restTimer.sec + delta), total: Math.max(0, restTimer.total + delta) });
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
          <button onClick={() => {
            // Record session on finish — only include exercises with at least one completed set
            const exMap = {};
            sets.forEach(ex => {
              const done = ex.rows.filter(r => r.done && r.reps && r.weight).map(r => ({ reps: Number(r.reps), weight: Number(r.weight) }));
              if (done.length) exMap[ex.name] = done;
            });
            if (Object.keys(exMap).length > 0) {
              recordSession({ workoutName: workout.name, exercises: exMap, durationSec: elapsed });
            }
            onFinish();
          }} style={{ background: c.rosedeep, color: "white", border: "none", padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Finish</button>
        </div>
        <p style={{ fontSize: 16, fontWeight: 600, margin: "10px 0 0", textAlign: "center" }}>{workout.name}</p>
      </div>

      {/* goal banner + coach button */}
      <div style={{ padding: "16px 24px 0", display: "flex", gap: 10 }}>
        <div style={{ flex: 1, background: `linear-gradient(135deg, ${c.blush}, ${c.blushLight})`, borderRadius: 14, padding: "12px 14px" }}>
          <p style={{ fontSize: 10, color: c.rosedeep, fontWeight: 700, margin: 0, letterSpacing: 0.5 }}>🎯 TODAY'S GOAL</p>
          <p style={{ fontSize: 13, color: c.charcoal, margin: "4px 0 0", lineHeight: 1.4 }}>
            {overallGoal}
          </p>
        </div>
        <button onClick={() => setShowCoach(true)} style={{ background: c.charcoal, border: "none", borderRadius: 14, width: 56, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "white", gap: 2 }}>
          <Sparkles size={18} />
          <span style={{ fontSize: 9, fontWeight: 600 }}>Coach</span>
        </button>
      </div>

      {/* exercises */}
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14, paddingBottom: 140 }}>
        {sets.map((ex, ei) => {
          const exData = EXERCISE_DB.find((e) => e.name === ex.name);
          return (
            <div key={ei} style={{ background: c.white, borderRadius: 18, padding: 16, border: `1px solid ${c.line}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{ex.name}</p>
                  <p style={{ fontSize: 11, color: c.muted, margin: "2px 0 0" }}>{exData?.muscle}</p>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setShowFormTips(exData)} style={{ ...iconBtn, background: c.blushLight }}>
                    <Info size={16} color={c.rosedeep} />
                  </button>
                  <button onClick={() => removeExercise(ei)} style={{ ...iconBtn, background: c.white }} title="Remove exercise">
                    <X size={16} color={c.muted} />
                  </button>
                </div>
              </div>

              {/* per-exercise recommendation */}
              <div style={{ background: c.blushLight, borderRadius: 12, padding: "10px 12px", marginBottom: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Sparkles size={14} color={c.rosedeep} style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: 11, color: c.charcoal, margin: 0, lineHeight: 1.5 }}>{exerciseGoals[ex.name]}</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "30px 1fr 1fr 1fr 36px", gap: 8, fontSize: 10, color: c.muted, marginBottom: 6, letterSpacing: 0.5 }}>
                <span>SET</span><span>PREVIOUS</span><span>REPS</span><span>WEIGHT</span><span></span>
              </div>

              {ex.rows.map((row, ri) => (
                <div key={ri} style={{ display: "grid", gridTemplateColumns: "24px 1fr 1fr 1fr 32px 28px", gap: 6, alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: c.muted }}>{ri + 1}</span>
                  <span style={{ fontSize: 11, color: c.muted }}>
                    {row.targetReps ? `${row.targetReps}×${row.targetWeight - 5}` : "—"}
                  </span>
                  <input value={row.reps} onChange={(e) => updateRow(ei, ri, "reps", e.target.value)} placeholder={row.targetReps || "0"} style={inputStyle(row.done)} />
                  <input value={row.weight} onChange={(e) => updateRow(ei, ri, "weight", e.target.value)} placeholder={row.targetWeight || "lb"} style={inputStyle(row.done)} />
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
        })}
      </div>

      {/* rest timer */}
      {restTimer && restTimer.sec > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: c.charcoal, color: "white", padding: "16px 24px 24px", borderRadius: "20px 20px 0 0", zIndex: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ fontSize: 11, opacity: 0.7, margin: 0, letterSpacing: 0.5 }}>REST · {restTimer.exercise}</p>
              <p style={{ fontSize: 32, fontWeight: 700, margin: "4px 0 0", fontVariantNumeric: "tabular-nums" }}>{fmt(restTimer.sec)}</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => adjustRest(-15)} style={timerBtn}>-15</button>
              <button onClick={() => adjustRest(15)} style={timerBtn}>+15</button>
              <button onClick={() => setRestTimer(null)} style={{ ...timerBtn, background: c.rose, color: c.charcoal }}>Skip</button>
            </div>
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 2, marginTop: 12, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(restTimer.sec / restTimer.total) * 100}%`, background: c.rose, transition: "width 1s linear" }} />
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
function WeekOverview({ onClose }) {
  const [view, setView] = useState("month");
  const weekly = [
    { label: "Mar 9", count: 4 }, { label: "Mar 16", count: 5 }, { label: "Mar 23", count: 3 }, { label: "Mar 30", count: 5 }, { label: "Apr 6", count: 4 },
  ];
  const monthly = [
    { label: "Nov", count: 14 }, { label: "Dec", count: 12 }, { label: "Jan", count: 16 }, { label: "Feb", count: 18 }, { label: "Mar", count: 17 }, { label: "Apr", count: 4 },
  ];
  const yearly = [
    { label: "2023", count: 142 }, { label: "2024", count: 168 }, { label: "2025", count: 195 }, { label: "2026", count: 81 },
  ];
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

// ---------- FOCUS LIFT VIEW ----------
function FocusLiftView({ onClose }) {
  const [mode, setMode] = useState("volume"); // volume | strength
  const data = mode === "volume" ? FOCUS_LIFT.volumeHistory : FOCUS_LIFT.strengthHistory;
  const targetReps = mode === "volume" ? 12 : 6;

  // estimated 1RM via Epley: w * (1 + reps/30)
  const e1rm = (w, r) => Math.round(w * (1 + r / 30));
  const e1rmHistory = data.map((d) => ({ ...d, e1rm: e1rm(d.weight, d.reps) }));
  const current = e1rmHistory[e1rmHistory.length - 1];
  const first = e1rmHistory[0];
  const gain = current.e1rm - first.e1rm;
  const weeks = e1rmHistory.length;
  const perWeek = (gain / weeks).toFixed(1);

  // simple linear projection for next 8 weeks
  const projection = Array.from({ length: 8 }).map((_, i) => ({
    week: `Wk +${i + 1}`,
    e1rm: Math.round(current.e1rm + (i + 1) * (gain / weeks)),
  }));

  const maxE = Math.max(...e1rmHistory.map((d) => d.e1rm), ...projection.map((p) => p.e1rm));

  return (
    <div style={{ position: "fixed", inset: 0, background: c.cream, zIndex: 100, overflowY: "auto", maxWidth: 430, margin: "0 auto" }}>
      <div style={{ position: "sticky", top: 0, background: c.cream, borderBottom: `1px solid ${c.line}`, padding: "20px 24px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 5 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: c.charcoal, fontSize: 14, fontWeight: 500 }}>
          <ChevronLeft size={20} /> Back
        </button>
        <p style={{ fontSize: 11, color: c.rosedeep, fontWeight: 700, margin: 0, letterSpacing: 0.5 }}>⭐ FOCUS LIFT</p>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ padding: 24, paddingBottom: 100 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>{FOCUS_LIFT.name}</h1>
        <p style={{ fontSize: 12, color: c.muted, margin: "4px 0 20px" }}>Tracking since {FOCUS_LIFT.startedTracking}</p>

        {/* mode toggle */}
        <div style={{ display: "flex", gap: 6, background: c.white, borderRadius: 14, padding: 4, border: `1px solid ${c.line}`, marginBottom: 20 }}>
          {["volume", "strength"].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: mode === m ? c.charcoal : "transparent", color: mode === m ? "white" : c.charcoal, fontSize: 13, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}
            >
              {m === "volume" ? "Volume (12 reps)" : "Strength (6 reps)"}
            </button>
          ))}
        </div>

        {/* hero stats */}
        <div style={{ background: `linear-gradient(135deg, ${c.blush}, ${c.blushLight})`, borderRadius: 20, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 11, color: c.rosedeep, fontWeight: 700, margin: 0, letterSpacing: 0.5 }}>CURRENT TOP SET</p>
              <p style={{ fontSize: 32, fontWeight: 700, margin: "4px 0 0", letterSpacing: -1 }}>{current.weight} lb</p>
              <p style={{ fontSize: 13, color: c.muted, margin: "2px 0 0" }}>× {current.reps} reps · {current.date}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 11, color: c.rosedeep, fontWeight: 700, margin: 0, letterSpacing: 0.5 }}>EST. 1RM</p>
              <p style={{ fontSize: 32, fontWeight: 700, margin: "4px 0 0", letterSpacing: -1 }}>{current.e1rm}</p>
              <p style={{ fontSize: 13, color: c.muted, margin: "2px 0 0" }}>lb</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, paddingTop: 16, borderTop: `1px solid rgba(255,255,255,0.5)` }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 11, color: c.muted, margin: 0 }}>Total gain</p>
              <p style={{ fontSize: 16, fontWeight: 700, margin: "2px 0 0", color: c.rosedeep }}>+{gain} lb</p>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 11, color: c.muted, margin: 0 }}>Pace</p>
              <p style={{ fontSize: 16, fontWeight: 700, margin: "2px 0 0", color: c.rosedeep }}>{perWeek} lb/wk</p>
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
            {e1rmHistory.map((d, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <p style={{ fontSize: 9, color: c.muted, margin: 0, fontWeight: 600 }}>{d.weight}</p>
                <div style={{ width: "100%", height: `${(d.weight / Math.max(...e1rmHistory.map((x) => x.weight))) * 100}%`, background: `linear-gradient(180deg, ${c.rose}, ${c.rosedeep})`, borderRadius: 6, minHeight: 10 }} />
                <p style={{ fontSize: 8, color: c.muted, margin: 0, transform: "rotate(-30deg)", whiteSpace: "nowrap" }}>{d.date}</p>
              </div>
            ))}
          </div>
        </div>

        {/* projection */}
        <div style={{ background: c.white, borderRadius: 18, padding: 18, border: `1px solid ${c.line}`, marginBottom: 20 }}>
          <SectionTitle title="Where you'll be" subtitle="Linear projection at current pace" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
            {[
              { label: "In 2 weeks", value: projection[1] },
              { label: "In 4 weeks", value: projection[3] },
              { label: "In 8 weeks", value: projection[7] },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: c.cream, borderRadius: 12 }}>
                <p style={{ fontSize: 13, margin: 0, color: c.muted }}>{row.label}</p>
                <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: c.charcoal }}>~{row.value.e1rm} lb e1RM</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: c.muted, fontStyle: "italic", margin: "12px 0 0", lineHeight: 1.4 }}>
            ✨ At {perWeek} lb/wk, you're on a great trajectory. Linear gains usually slow after 12+ weeks — Wren will flag when to deload.
          </p>
        </div>

        {/* coach insight */}
        <div style={{ background: c.blushLight, border: `1px solid ${c.blush}`, borderRadius: 16, padding: 16, display: "flex", gap: 10 }}>
          <Sparkles size={18} color={c.rosedeep} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: c.rosedeep, margin: 0, letterSpacing: 0.3 }}>BLOOM'S TAKE</p>
            <p style={{ fontSize: 13, color: c.charcoal, margin: "4px 0 0", lineHeight: 1.5 }}>
              {mode === "volume"
                ? "You hit 75 lb × 10 last volume day — try 75 lb × 12 next session. Once you nail 12, jump to 80 lb."
                : "You hit 95 lb × 5 last strength day — push for 95 × 6 next session. After that, attempt 100 lb × 5."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- SCHEDULE MODAL ----------
function ScheduleModal({ schedule, myWorkouts, onClose, onSave }) {
  const [draft, setDraft] = useState(schedule);
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: c.cream, width: "100%", maxWidth: 430, borderRadius: "28px 28px 0 0", padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Weekly Schedule</h2>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12, color: c.muted, margin: "0 0 16px" }}>Assign a workout to each day. Wren can swap it if you tell her you're sore or short on time.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {dayNames.map((d, i) => (
            <div key={i} style={{ background: c.white, borderRadius: 14, padding: 12, border: `1px solid ${c.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0, minWidth: 80 }}>{d}</p>
              <select
                value={draft[i] || ""}
                onChange={(e) => setDraft({ ...draft, [i]: e.target.value || null })}
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
function BuilderModal({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState([]);
  const [search, setSearch] = useState("");
  const filtered = EXERCISE_DB.filter(
    (e) => e.name.toLowerCase().includes(search.toLowerCase()) || e.muscle.toLowerCase().includes(search.toLowerCase())
  );

  const togglePick = (name) => {
    if (picked.includes(name)) setPicked(picked.filter((p) => p !== name));
    else setPicked([...picked, name]);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: c.cream, width: "100%", maxWidth: 430, borderRadius: "28px 28px 0 0", padding: 24, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Build Workout</h2>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Workout name..."
          style={{ width: "100%", padding: 14, borderRadius: 14, border: `1px solid ${c.line}`, background: c.white, fontSize: 15, marginBottom: 16, outline: "none", boxSizing: "border-box" }}
        />

        <div style={{ position: "relative", marginBottom: 12 }}>
          <Search size={16} style={{ position: "absolute", left: 14, top: 14, color: c.muted }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lifts (e.g. squat, glute, chest)..."
            style={{ width: "100%", padding: "12px 12px 12px 38px", borderRadius: 14, border: `1px solid ${c.line}`, background: c.white, fontSize: 14, outline: "none", boxSizing: "border-box" }}
          />
        </div>

        {picked.length > 0 && (
          <p style={{ fontSize: 12, color: c.rosedeep, fontWeight: 600, margin: "8px 0" }}>{picked.length} added</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, maxHeight: 280, overflowY: "auto" }}>
          {filtered.map((ex) => {
            const isPicked = picked.includes(ex.name);
            return (
              <button
                key={ex.id}
                onClick={() => togglePick(ex.name)}
                style={{ background: isPicked ? c.blush : c.white, border: `1px solid ${isPicked ? c.rose : c.line}`, borderRadius: 14, padding: 12, textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
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

        <button
          disabled={!name.trim() || !picked.length}
          onClick={() => onSave({ id: `c${Date.now()}`, name, exercises: picked })}
          style={{ width: "100%", background: !name.trim() || !picked.length ? c.muted : c.charcoal, color: "white", border: "none", padding: 16, borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
        >
          Save Workout
        </button>
      </div>
    </div>
  );
}

// ---------- COACH ----------
function CoachView({ chat, chatInput, setChatInput, sendChat }) {
  return (
    <div style={{ padding: "8px 24px", display: "flex", flexDirection: "column", height: "calc(100vh - 220px)" }}>
      <div style={{ background: `linear-gradient(135deg, ${c.blush}, ${c.blushLight})`, borderRadius: 18, padding: 16, marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: c.white, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Sparkles size={22} color={c.rosedeep} />
        </div>
        <div>
          <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Wren 🌙 — AI Coach</p>
          <p style={{ fontSize: 12, color: c.muted, margin: "2px 0 0" }}>Share goals, injuries, or how you feel</p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 12 }}>
        {chat.map((m, i) => (
          <div key={i} style={{ alignSelf: m.from === "user" ? "flex-end" : "flex-start", background: m.from === "user" ? c.charcoal : c.white, color: m.from === "user" ? "white" : c.charcoal, border: m.from === "user" ? "none" : `1px solid ${c.line}`, padding: "12px 16px", borderRadius: 18, maxWidth: "80%", fontSize: 14, lineHeight: 1.5 }}>
            {m.text}
          </div>
        ))}
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
function ProgressView() {
  return (
    <div style={{ padding: "8px 24px" }}>
      <SectionTitle title="All-Time PBs" subtitle="Tap any lift to see history" />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {SEED_PRS.map((pr, i) => (
          <div key={i} style={{ background: c.white, borderRadius: 16, padding: 16, border: `1px solid ${c.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ fontSize: 28 }}>{pr.icon}</div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{pr.lift}</p>
                <p style={{ fontSize: 11, color: c.muted, margin: "2px 0 0" }}>set on {pr.date}</p>
              </div>
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: c.rosedeep }}>{pr.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
