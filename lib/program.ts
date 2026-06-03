import { getSql } from "./db";
import type { Day, Exercise } from "@/app/program";
import type { Week, WeekDay } from "@/app/week-schedule";

/**
 * Single-tenant short-cut. Until we wire cookie-based Supabase SSR auth,
 * the page always loads the bootstrap user's program/schedule. Multi-user
 * support is a separate piece; gating reads on the actual signed-in user
 * is the right next step once SSR auth lands.
 */
const BOOTSTRAP_USER_ID = "52e9343d-fa34-4d2f-802d-9906d8eb6fda";

/**
 * Builds the user's effective program by joining the global catalog with
 * their per-user overrides + custom exercises. Returns the existing
 * `Day[]` shape the client already consumes, so the React layer doesn't
 * change.
 */
export async function loadProgram(userId: string = BOOTSTRAP_USER_ID): Promise<Day[]> {
  const sql = getSql();

  type DayRow = {
    id: string;
    slug: string;
    name: string;
    subtitle: string;
    description: string;
  };
  const days = await sql<DayRow[]>`
    SELECT
      d.id,
      d.slug,
      COALESCE(udo.name, d.name) AS name,
      COALESCE(udo.subtitle, d.subtitle) AS subtitle,
      d.description
    FROM catalog_days d
    LEFT JOIN user_day_overrides udo
      ON udo.catalog_day_id = d.id AND udo.user_id = ${userId}
    WHERE d.is_published = true
    ORDER BY d.created_at
  `;

  const dayIds = days.map((d) => d.id);

  type ExRow = {
    day_id: string;
    slug: string;
    name: string;
    sets: number;
    target_reps: number;
    target_weight: number | null;
    note: string | null;
    description: string;
    sort_order: number;
    source: "catalog" | "custom";
  };

  const exercises: ExRow[] = dayIds.length === 0 ? [] : await sql<ExRow[]>`
    SELECT
      e.day_id,
      e.slug,
      e.name,
      COALESCE(ueo.sets, e.sets)::int AS sets,
      COALESCE(ueo.target_reps, e.target_reps)::int AS target_reps,
      COALESCE(ueo.target_weight, e.target_weight) AS target_weight,
      COALESCE(ueo.note, e.note) AS note,
      e.description,
      e.sort_order,
      'catalog'::text AS source
    FROM catalog_exercises e
    LEFT JOIN user_exercise_overrides ueo
      ON ueo.catalog_exercise_id = e.id AND ueo.user_id = ${userId}
    WHERE e.day_id = ANY(${dayIds})

    UNION ALL

    SELECT
      uce.catalog_day_id AS day_id,
      uce.slug,
      uce.name,
      uce.sets::int,
      uce.target_reps::int,
      uce.target_weight,
      uce.note,
      uce.description,
      uce.sort_order,
      'custom'::text AS source
    FROM user_custom_exercises uce
    WHERE uce.user_id = ${userId} AND uce.catalog_day_id = ANY(${dayIds})

    ORDER BY day_id, sort_order
  `;

  return days.map((d) => ({
    id: d.slug,
    name: d.name,
    subtitle: d.subtitle,
    weekLabel: d.description,
    exercises: exercises
      .filter((e) => e.day_id === d.id)
      .map<Exercise>((e) => ({
        id: e.slug,
        name: e.name,
        sets: e.sets,
        targetReps: e.target_reps,
        targetWeight: e.target_weight,
        note: e.note ?? undefined,
        description: e.description,
      })),
  }));
}

/**
 * Loads the user's date → day-template schedule and groups by Monday-start
 * weeks so the existing `Week[]` consumers don't change.
 */
export async function loadSchedule(userId: string = BOOTSTRAP_USER_ID): Promise<Week[]> {
  const sql = getSql();
  const rows = await sql<{ scheduled_date: string; catalog_day_slug: string }[]>`
    SELECT
      to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
      catalog_day_slug
    FROM user_schedule_days
    WHERE user_id = ${userId}
    ORDER BY scheduled_date
  `;

  // Group by Monday-start week
  const byWeek = new Map<string, WeekDay[]>();
  for (const r of rows) {
    const weekStart = mondayOf(r.scheduled_date);
    if (!byWeek.has(weekStart)) byWeek.set(weekStart, []);
    byWeek.get(weekStart)!.push({ date: r.scheduled_date, dayId: r.catalog_day_slug });
  }

  const weeks: Week[] = [];
  let i = 0;
  for (const [startDate, days] of Array.from(byWeek.entries()).sort()) {
    weeks.push({
      startDate,
      label: formatWeekLabel(startDate),
      programWeek: i,
      days,
    });
    i += 1;
  }
  return weeks;
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const delta = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `Week of ${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}
