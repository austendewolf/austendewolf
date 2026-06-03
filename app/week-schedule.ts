/**
 * Calendar of which day-template runs on which date. Add weeks here and
 * the UI picks them up. Date format is YYYY-MM-DD; workout DB id is
 * `<date>-<dayId>` so each session is its own row.
 */

export type WeekDay = {
  date: string;   // YYYY-MM-DD
  dayId: string;  // matches PROGRAM[].id
};

export type Week = {
  startDate: string;     // Monday of the week, YYYY-MM-DD
  label: string;         // human-readable, e.g. "Week of 6/1"
  programWeek: number;   // 1..6
  days: WeekDay[];
};

export const SCHEDULE: Week[] = [
  {
    startDate: "2026-05-25",
    label: "Week of 5/25",
    programWeek: 0,
    days: [
      { date: "2026-05-30", dayId: "upper2" },
    ],
  },
  {
    startDate: "2026-06-01",
    label: "Week of 6/1",
    programWeek: 1,
    days: [
      { date: "2026-06-01", dayId: "upper1" },
      { date: "2026-06-02", dayId: "lower1" },
      { date: "2026-06-03", dayId: "run1" },
      { date: "2026-06-04", dayId: "upper2" },
      { date: "2026-06-05", dayId: "lower2" },
    ],
  },
  {
    startDate: "2026-06-08",
    label: "Week of 6/8",
    programWeek: 2,
    days: [
      { date: "2026-06-08", dayId: "upper1" },
      { date: "2026-06-09", dayId: "lower1" },
      { date: "2026-06-10", dayId: "run1" },
      { date: "2026-06-11", dayId: "upper2" },
      { date: "2026-06-12", dayId: "lower2" },
    ],
  },
];

export function workoutId(date: string, dayId: string): string {
  return `${date}-${dayId}`;
}

export function parseWorkoutId(id: string): { date: string; dayId: string } | null {
  const m = id.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (!m) return null;
  return { date: m[1], dayId: m[2] };
}

export function findWeek(startDate: string): Week | undefined {
  return SCHEDULE.find((w) => w.startDate === startDate);
}

export function todayWeek(): Week {
  // Naive: return the first scheduled week. Could be smarter (find the
  // week containing today's date) but this is fine for v1.
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = SCHEDULE.filter((w) => w.days.some((d) => d.date >= today));
  return upcoming[0] ?? SCHEDULE[0];
}

export function formatShortDate(iso: string): string {
  // 2026-06-01 → Mon 6/1
  const d = new Date(`${iso}T12:00:00Z`);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${days[d.getUTCDay()]} ${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS_LONG = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function todayIso(): string {
  const now = new Date();
  // Use local date, not UTC, so "today" matches the user's clock.
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function parseIso(iso: string): Date {
  // Treat ISO date as a UTC noon timestamp so day-of-week math is stable.
  return new Date(`${iso}T12:00:00Z`);
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function startOfWeek(iso: string): string {
  // Monday-start, matching SCHEDULE.startDate convention.
  const d = parseIso(iso);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const delta = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function startOfYear(iso: string): string {
  return `${iso.slice(0, 4)}-01-01`;
}

export function formatLongDate(iso: string): string {
  // 2026-06-01 → Mon, Jun 1, 2026
  const d = parseIso(iso);
  return `${WEEKDAYS_LONG[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function formatWeekLabel(weekStartIso: string): string {
  // Week starting 2026-05-25 → "May 25 – 31"
  const start = parseIso(weekStartIso);
  const end = parseIso(addDays(weekStartIso, 6));
  const sM = MONTHS[start.getUTCMonth()];
  const eM = MONTHS[end.getUTCMonth()];
  if (sM === eM) return `${sM} ${start.getUTCDate()} – ${end.getUTCDate()}`;
  return `${sM} ${start.getUTCDate()} – ${eM} ${end.getUTCDate()}`;
}

export function formatMonth(iso: string): string {
  // 2026-06-01 → June 2026
  const d = parseIso(iso);
  const full = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${full[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatYear(iso: string): string {
  return iso.slice(0, 4);
}

export function weekStartContaining(iso: string): string {
  return startOfWeek(iso);
}

/**
 * Build a flat lookup of scheduled dayId by date from the SCHEDULE array.
 */
export function buildScheduleMap(weeks: Week[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const w of weeks) {
    for (const d of w.days) {
      map[d.date] = d.dayId;
    }
  }
  return map;
}
