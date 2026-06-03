/**
 * The program — every day a teacher fills out as their own DB row.
 * Day id → workout-sync id. Update exercises here, redeploy, done.
 *
 * Add new days by appending to PROGRAM. The day toggle UI iterates this
 * array in order so swiping right walks through the week.
 */

export type Exercise = {
  id: string;
  name: string;
  sets: number;
  targetReps: number;
  targetWeight: number | null;
  note?: string;
  description: string;
};

export type Day = {
  id: string;
  name: string;          // e.g. "Upper Day 2"
  subtitle: string;      // e.g. "PULL FOCUS · VOLUME"
  weekLabel: string;     // e.g. "6-Week Program · Week 1"
  exercises: Exercise[];
};

export const PROGRAM: Day[] = [
  {
    id: "upper1",
    name: "Upper Day 1",
    subtitle: "PUSH FOCUS · STRENGTH",
    weekLabel: "6-Week Program · Week 1",
    exercises: [
      {
        id: "cardio_warmup",
        name: "Cardio Warm-up",
        sets: 1, targetReps: 15, targetWeight: null,
        note: "Treadmill or stairs · 15 min",
        description: "Treadmill or StairMaster before your sets. Easy-to-moderate pace, 15 minutes to warm up the legs, raise heart rate, and get blood moving. Log reps as minutes.",
      },
      {
        id: "bench_press",
        name: "Bench Press",
        sets: 4, targetReps: 6, targetWeight: 185,
        note: "Warmup: 135×5",
        description: "Flat bench. Shoulder blades pinched and tucked, slight arch, feet planted. Lower the bar to your sternum with control, drive up explosively. Strength focus — leave one rep in the tank each set.",
      },
      {
        id: "weighted_pullup",
        name: "Weighted Pull-up",
        sets: 4, targetReps: 6, targetWeight: 25,
        note: "Bodyweight + 25lb",
        description: "Hang from a bar, palms forward, wider than shoulders. Pull until your chin clears the bar. Add weight via dip belt or dumbbell between feet. Full hang at the bottom each rep.",
      },
      {
        id: "overhead_press",
        name: "Overhead Press",
        sets: 4, targetReps: 8, targetWeight: 95,
        description: "Standing barbell press. Bar starts at collarbone, brace your core, press straight up. Don't lean back — if you can't keep your torso vertical, the weight is too heavy.",
      },
      {
        id: "barbell_row_u1",
        name: "Barbell Row",
        sets: 4, targetReps: 8, targetWeight: 135,
        description: "Hinge forward at the hips with a flat back, overhand grip just outside your hips. Pull the bar up toward your lower ribs.",
      },
      {
        id: "dips",
        name: "Dips",
        sets: 3, targetReps: 10, targetWeight: 0,
        note: "Bodyweight; add weight if 10 is easy",
        description: "Parallel bars, arms locked at the top. Lower under control until shoulders dip slightly below elbows, then press back up. Lean forward slightly to bias chest, stay vertical for tricep emphasis.",
      },
      {
        id: "hammer_curl",
        name: "Hammer Curl",
        sets: 3, targetReps: 12, targetWeight: 30,
        description: "Dumbbells in each hand, neutral grip (palms facing each other). Curl up keeping the neutral grip the whole way. Hits brachialis + forearm.",
      },
      {
        id: "core",
        name: "Core",
        sets: 1, targetReps: 150, targetWeight: 0,
        note: "150 reps total, split across whatever you want",
        description: "Core finisher. Pick 2-3 movements (planks, crunches, leg raises, hanging knees-to-chest) and split 150 reps across them. Planks: count seconds as reps.",
      },
    ],
  },
  {
    id: "lower1",
    name: "Lower Day 1",
    subtitle: "SQUAT FOCUS · STRENGTH",
    weekLabel: "6-Week Program · Week 1",
    exercises: [
      {
        id: "cardio_warmup",
        name: "Cardio Warm-up",
        sets: 1, targetReps: 15, targetWeight: null,
        note: "Treadmill or stairs · 15 min",
        description: "Treadmill or StairMaster before your sets. Easy-to-moderate pace, 15 minutes to warm up the legs, raise heart rate, and get blood moving. Log reps as minutes.",
      },
      {
        id: "back_squat",
        name: "Back Squat",
        sets: 5, targetReps: 5, targetWeight: 225,
        note: "Warmup: 135×5, 185×3",
        description: "Bar high on traps, feet shoulder-width or slightly wider, toes slightly out. Brace, break at hips and knees together, descend to at least parallel. Drive up through the whole foot. Strength focus.",
      },
      {
        id: "rdl",
        name: "Romanian Deadlift",
        sets: 4, targetReps: 8, targetWeight: 185,
        description: "Bar in front, soft knees, push hips back while keeping the bar close to your legs. Feel the hamstrings stretch. Stop when you feel a deep stretch, don't round your back. Drive hips forward to stand.",
      },
      {
        id: "bulgarian_split_squat",
        name: "Bulgarian Split Squat",
        sets: 3, targetReps: 10, targetWeight: 40,
        note: "Per leg, dumbbells",
        description: "Rear foot elevated on a bench, front foot far enough out that knee tracks over ankle. Lower straight down. Dumbbells in each hand. Brutal — these are why your legs grow.",
      },
      {
        id: "leg_curl",
        name: "Leg Curl",
        sets: 3, targetReps: 12, targetWeight: 90,
        description: "Lying or seated. Pull heel toward butt against the resistance, squeeze hamstring hard at the contracted position, slow lower.",
      },
      {
        id: "standing_calf",
        name: "Standing Calf Raise",
        sets: 4, targetReps: 15, targetWeight: 135,
        description: "On a calf machine or with a barbell on traps. Rise up onto the balls of your feet as high as possible, hold for a beat at the top, lower under control with a stretch at the bottom.",
      },
      {
        id: "core",
        name: "Core",
        sets: 1, targetReps: 150, targetWeight: 0,
        note: "150 reps total, split across whatever you want",
        description: "Core finisher. Pick 2-3 movements (planks, crunches, leg raises, hanging knees-to-chest) and split 150 reps across them. Planks: count seconds as reps.",
      },
    ],
  },
  {
    id: "upper2",
    name: "Upper Day 2",
    subtitle: "PULL FOCUS · VOLUME",
    weekLabel: "6-Week Program · Week 1",
    exercises: [
      {
        id: "cardio_warmup",
        name: "Cardio Warm-up",
        sets: 1, targetReps: 15, targetWeight: null,
        note: "Treadmill or stairs · 15 min",
        description: "Treadmill or StairMaster before your sets. Easy-to-moderate pace, 15 minutes to warm up the legs, raise heart rate, and get blood moving. Log reps as minutes.",
      },
      {
        id: "barbell_row",
        name: "Barbell Row",
        sets: 4, targetReps: 10, targetWeight: 135,
        note: "Warmup: 95×5",
        description: "Hinge forward at the hips with a flat back, overhand grip just outside your hips. Pull the bar up toward your lower ribs — elbows drive back close to your sides. Lower under control. Your back should be roughly parallel to the floor throughout.",
      },
      {
        id: "incline_bench",
        name: "Incline Bench Press",
        sets: 4, targetReps: 8, targetWeight: 135,
        note: "Bumped target from 125. Warmup: 95×5",
        description: "Set bench to 30–45°. Shoulder blades pinched back and down, slight arch. Lower the bar to your upper chest (just below the collarbone), then press straight up. Same mechanics as flat bench — the incline shifts emphasis to the upper pec and front delt.",
      },
      {
        id: "lat_pulldown",
        name: "Lat Pulldown",
        sets: 4, targetReps: 10, targetWeight: 155,
        description: "Seated cable machine, wide bar, overhand grip. Thighs locked under the pad. Pull the bar straight down to your upper chest by driving your elbows toward your hips — like you're trying to put them in your back pockets. Slow return to full arm extension at the top.",
      },
      {
        id: "db_shoulder_press",
        name: "DB Shoulder Press",
        sets: 4, targetReps: 10, targetWeight: 55,
        note: "Working up from 50 toward 60",
        description: "Seated or standing, dumbbell in each hand at shoulder height, palms facing forward. Press both straight up until arms are extended overhead, then lower back to shoulder height. Keep core braced — don't arch your lower back to grind out reps.",
      },
      {
        id: "cable_curl",
        name: "Cable Curl",
        sets: 3, targetReps: 12, targetWeight: 45,
        note: "Moved earlier so it doesn't get skipped",
        description: "Single cable set low, handle or rope. Grab with underhand grip, elbows pinned to your sides. Curl your hands up toward your shoulders, squeeze at the top, lower under control. Elbows stay put the whole time — if they're drifting forward, the weight is too heavy.",
      },
      {
        id: "tricep_pushdown",
        name: "Tricep Pushdown",
        sets: 3, targetReps: 12, targetWeight: 55,
        description: "Cable set high, rope or bar attachment. Grip at chest height, elbows locked at your sides. Push the attachment straight down until your arms are fully extended. Don't let elbows flare or your body hinge forward. Squeeze triceps at the bottom, slow return.",
      },
      {
        id: "lateral_raise",
        name: "Lateral Raise",
        sets: 4, targetReps: 12, targetWeight: 20,
        note: "2-sec eccentric (was 3s × 25, kept fading)",
        description: "Stand with dumbbells at your sides, slight bend in elbows locked throughout the set. Raise both arms out to the sides until parallel to the floor — like a T. Lower slowly over 2 seconds. No swinging or momentum. This builds the side delt which creates shoulder width.",
      },
      {
        id: "face_pull",
        name: "Face Pull",
        sets: 3, targetReps: 15, targetWeight: 40,
        note: "Lock in 40 across all sets",
        description: "Cable set at face height with a rope attachment. Step back until there's tension, palms facing down. Pull the rope directly toward your face — hands split apart so your fists end up either side of your head, elbows flared high. Squeeze hard at the end. Trains rear delts and rotator cuff.",
      },
      {
        id: "core",
        name: "Core",
        sets: 1, targetReps: 150, targetWeight: 0,
        note: "150 reps total, split across whatever you want",
        description: "Core finisher. Pick 2-3 movements (planks, crunches, leg raises, hanging knees-to-chest) and split 150 reps across them. Planks: count seconds as reps.",
      },
    ],
  },
  {
    id: "lower2",
    name: "Lower Day 2",
    subtitle: "DEADLIFT FOCUS · VOLUME",
    weekLabel: "6-Week Program · Week 1",
    exercises: [
      {
        id: "cardio_warmup",
        name: "Cardio Warm-up",
        sets: 1, targetReps: 15, targetWeight: null,
        note: "Treadmill or stairs · 15 min",
        description: "Treadmill or StairMaster before your sets. Easy-to-moderate pace, 15 minutes to warm up the legs, raise heart rate, and get blood moving. Log reps as minutes.",
      },
      {
        id: "deadlift",
        name: "Deadlift",
        sets: 4, targetReps: 6, targetWeight: 275,
        note: "Warmup: 135×5, 185×3, 225×2",
        description: "Bar over mid-foot, hip-hinge to grip the bar, flat back, chest up. Push the floor away with your whole foot, hips and shoulders rise together. Reset every rep — don't bounce.",
      },
      {
        id: "front_squat",
        name: "Front Squat",
        sets: 4, targetReps: 8, targetWeight: 155,
        description: "Bar on front delts, elbows high, fingertip grip. Brace hard. Descend with knees tracking over toes — torso stays vertical. Easier on the lower back than back squat, brutal on the quads.",
      },
      {
        id: "walking_lunge",
        name: "Walking Lunge",
        sets: 3, targetReps: 12, targetWeight: 35,
        note: "Per leg, dumbbells",
        description: "Dumbbells at your sides. Step forward, knee tracks over ankle, back knee taps the floor (or near it). Push through the front heel to stand and step into the next rep. 12 per leg.",
      },
      {
        id: "hip_thrust",
        name: "Hip Thrust",
        sets: 3, targetReps: 10, targetWeight: 225,
        description: "Upper back on a bench, barbell over hips with a pad. Drive hips up until your body forms a straight line from knees to shoulders. Squeeze glutes hard at the top, lower under control.",
      },
      {
        id: "seated_calf",
        name: "Seated Calf Raise",
        sets: 4, targetReps: 15, targetWeight: 90,
        description: "Hits the soleus (deeper calf muscle). Pad on lower thighs, balls of feet on the platform. Same range of motion as standing calf — full stretch, full contraction.",
      },
      {
        id: "core",
        name: "Core",
        sets: 1, targetReps: 150, targetWeight: 0,
        note: "150 reps total, split across whatever you want",
        description: "Core finisher. Pick 2-3 movements (planks, crunches, leg raises, hanging knees-to-chest) and split 150 reps across them. Planks: count seconds as reps.",
      },
    ],
  },
  {
    // Generic activity vocabulary that powers the "Add exercise" picker
    // when you want to log something outside the structured strength
    // program — runs, walks, hikes, classes, swims, etc.
    id: "activities",
    name: "Activities",
    subtitle: "PICK ANYTHING",
    weekLabel: "Activity options",
    exercises: [
      {
        id: "act_walk",
        name: "Walk",
        sets: 1, targetReps: 30, targetWeight: null,
        note: "Reps = minutes · weight = miles",
        description: "Log any walk — outdoor, treadmill, errands. Use reps for total minutes, weight for distance in miles (optional).",
      },
      {
        id: "act_run",
        name: "Run",
        sets: 1, targetReps: 30, targetWeight: null,
        note: "Reps = minutes · weight = miles",
        description: "Outdoor or treadmill run, any pace. Log reps as minutes, weight as miles.",
      },
      {
        id: "act_bike",
        name: "Bike",
        sets: 1, targetReps: 30, targetWeight: null,
        note: "Reps = minutes · weight = miles",
        description: "Cycling — road, gravel, indoor. Log reps as minutes, weight as miles.",
      },
      {
        id: "act_hike",
        name: "Hike",
        sets: 1, targetReps: 60, targetWeight: null,
        note: "Reps = minutes · weight = miles",
        description: "Hikes of any length. Reps = minutes, weight = miles.",
      },
      {
        id: "act_swim",
        name: "Swim",
        sets: 1, targetReps: 30, targetWeight: null,
        note: "Reps = minutes · weight = laps or yards",
        description: "Pool or open water. Reps = minutes, weight = laps or yards (your call).",
      },
      {
        id: "act_yoga",
        name: "Yoga",
        sets: 1, targetReps: 30, targetWeight: null,
        note: "Reps = minutes",
        description: "Yoga session, any style. Reps = minutes.",
      },
      {
        id: "act_pilates",
        name: "Pilates",
        sets: 1, targetReps: 30, targetWeight: null,
        note: "Reps = minutes",
        description: "Mat or reformer Pilates. Reps = minutes.",
      },
      {
        id: "act_stretch",
        name: "Stretch / Mobility",
        sets: 1, targetReps: 15, targetWeight: null,
        note: "Reps = minutes",
        description: "Mobility / stretching session. Reps = minutes.",
      },
      {
        id: "act_hiit",
        name: "HIIT",
        sets: 1, targetReps: 20, targetWeight: null,
        note: "Reps = minutes",
        description: "High-intensity interval training — circuits, intervals, MetCon. Reps = minutes.",
      },
      {
        id: "act_cardio",
        name: "Cardio (general)",
        sets: 1, targetReps: 30, targetWeight: null,
        note: "Reps = minutes",
        description: "Any cardio you don't want to categorize further. Reps = minutes.",
      },
      {
        id: "act_strength",
        name: "Strength Session",
        sets: 1, targetReps: 0, targetWeight: 0,
        note: "Catch-all for a lift session not broken out by exercise",
        description: "Use when you don't want to log lift-by-lift — just a single 'I lifted' entry. Reps = total reps if you tracked them, otherwise leave blank.",
      },
    ],
  },
  {
    id: "run1",
    name: "Easy Run",
    subtitle: "ZONE 2 · CONVERSATIONAL",
    weekLabel: "6-Week Program · Week 1",
    exercises: [
      {
        id: "warmup_walk",
        name: "Warmup Walk",
        sets: 1, targetReps: 5, targetWeight: null,
        note: "5 minutes brisk",
        description: "Brisk walk for 5 minutes to raise heart rate and loosen up before running. Log reps as minutes.",
      },
      {
        id: "easy_run",
        name: "Easy Run",
        sets: 1, targetReps: 30, targetWeight: null,
        note: "30 min @ Z2 — should be able to hold a conversation",
        description: "Zone 2 effort — nose-breathing pace, no labored breathing. If you can't talk in full sentences, slow down. Log reps as total minutes of running; weight optional (use as miles).",
      },
      {
        id: "cooldown_walk",
        name: "Cooldown Walk",
        sets: 1, targetReps: 5, targetWeight: null,
        note: "5 minutes easy",
        description: "Walk for 5 minutes to bring heart rate down. Log reps as minutes.",
      },
    ],
  },
];

export function findDay(id: string | null | undefined): Day {
  if (!id) return PROGRAM[0];
  return PROGRAM.find((d) => d.id === id) ?? PROGRAM[0];
}
