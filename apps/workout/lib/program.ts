import { asc, eq, sql } from "drizzle-orm";
import { userScheduleDays } from "@awd/db";
import { getDb } from "./db";
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
  /*
   * Raw SQL rather than the query builder, deliberately.
   *
   * Everything else in this app moved to Drizzle's builder because those are
   * single-table reads where the builder is plainly clearer. These two are not:
   * the first is a LEFT JOIN whose whole purpose is COALESCE precedence, and
   * the second is a UNION ALL across two differently-shaped tables with a
   * literal discriminator column and an ordering that spans the union. Writing
   * that through the builder produces something longer and harder to check
   * against the behaviour it must preserve, which is the opposite of the reason
   * to adopt an ORM. Drizzle's `sql` tag parameterises identically, so this is
   * a supported way to use it rather than a hole in the abstraction.
   *
   * One difference from the postgres-js tag this replaced: interpolating an
   * array expands it into a parameter *list*, `($2, $3, …)`, which Postgres
   * reads as a record and refuses to cast to `uuid[]`. `sql.param()` binds it
   * as a single array parameter, which is what `= ANY(...)` needs.
   */
  const db = getDb();

  type DayRow = {
    id: string;
    slug: string;
    name: string;
    subtitle: string;
    description: string;
  };
  // postgres-js returns the rows directly rather than wrapping them in `{ rows }`.
  const days = await db.execute<DayRow>(sql`
    SELECT
      d.id,
      d.slug,
      COALESCE(udo.name, d.name) AS name,
      COALESCE(udo.subtitle, d.subtitle) AS subtitle,
      d.description
    FROM workout.catalog_days d
    LEFT JOIN workout.user_day_overrides udo
      ON udo.catalog_day_id = d.id AND udo.user_id = ${userId}::uuid
    WHERE d.is_published = true
    ORDER BY d.created_at
  `);

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

  const exercises: ExRow[] =
    dayIds.length === 0
      ? []
      : Array.from(
          await db.execute<ExRow>(sql`
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
            FROM workout.catalog_exercises e
            LEFT JOIN workout.user_exercise_overrides ueo
              ON ueo.catalog_exercise_id = e.id AND ueo.user_id = ${userId}::uuid
            WHERE e.day_id = ANY(${sql.param(dayIds)}::uuid[])

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
            FROM workout.user_custom_exercises uce
            WHERE uce.user_id = ${userId}::uuid
              AND uce.catalog_day_id = ANY(${sql.param(dayIds)}::uuid[])

            ORDER BY day_id, sort_order
          `),
        );

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
  // `date` columns come back as 'YYYY-MM-DD' strings already, so the to_char
  // the raw version used was doing nothing the driver wasn't.
  const rows = await getDb()
    .select({
      scheduled_date: userScheduleDays.scheduledDate,
      catalog_day_slug: userScheduleDays.catalogDaySlug,
    })
    .from(userScheduleDays)
    .where(eq(userScheduleDays.userId, userId))
    .orderBy(asc(userScheduleDays.scheduledDate));

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
