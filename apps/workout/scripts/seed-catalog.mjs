#!/usr/bin/env node
/**
 * Seed the global workout-day catalog from the legacy `app/program.ts`
 * constants, and migrate the existing per-user SCHEDULE into the new
 * `user_schedule_days` table. Idempotent: re-runs are no-ops once seeded.
 *
 * Author user_id is read from BOOTSTRAP_USER_ID env var (the Supabase
 * user that "owns" the seed catalog rows). All catalog rows are created
 * with is_published = true so any signed-in user can see them.
 *
 * Wired into Railway's preDeployCommand after `migrate.js`.
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const PROGRAM = JSON.parse(readFileSync(join(__dir, "seed.program.json"), "utf8"));
const SCHEDULE = JSON.parse(readFileSync(join(__dir, "seed.schedule.json"), "utf8"));

const BOOTSTRAP_USER_ID =
  process.env.BOOTSTRAP_USER_ID ?? "52e9343d-fa34-4d2f-802d-9906d8eb6fda";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

try {
  // ── Catalog: days ────────────────────────────────────────────────────
  for (const day of PROGRAM) {
    const existing = await sql`
      SELECT id FROM catalog_days WHERE slug = ${day.id} LIMIT 1
    `;
    let dayId;
    if (existing.length === 0) {
      const inserted = await sql`
        INSERT INTO catalog_days (slug, name, subtitle, description, author_user_id, is_published)
        VALUES (
          ${day.id},
          ${day.name},
          ${day.subtitle ?? ""},
          ${day.weekLabel ?? ""},
          ${BOOTSTRAP_USER_ID},
          true
        )
        RETURNING id
      `;
      dayId = inserted[0].id;
      console.log(`+ catalog_day ${day.id} → ${dayId}`);
    } else {
      dayId = existing[0].id;
    }

    // Catalog: exercises within this day
    for (let i = 0; i < day.exercises.length; i++) {
      const ex = day.exercises[i];
      const present = await sql`
        SELECT 1 FROM catalog_exercises
        WHERE day_id = ${dayId} AND slug = ${ex.id}
        LIMIT 1
      `;
      if (present.length > 0) continue;
      await sql`
        INSERT INTO catalog_exercises (day_id, slug, name, sets, target_reps, target_weight, note, description, sort_order)
        VALUES (
          ${dayId},
          ${ex.id},
          ${ex.name},
          ${ex.sets},
          ${ex.targetReps},
          ${ex.targetWeight ?? null},
          ${ex.note ?? null},
          ${ex.description ?? ""},
          ${i}
        )
      `;
      console.log(`  + ${day.id}/${ex.id}`);
    }
  }

  // ── User schedule: existing SCHEDULE → user_schedule_days ────────────
  // Also pull any rows from the legacy workouts.id='overrides' JSON blob.
  for (const week of SCHEDULE) {
    for (const wd of week.days) {
      const present = await sql`
        SELECT 1 FROM user_schedule_days
        WHERE user_id = ${BOOTSTRAP_USER_ID} AND scheduled_date = ${wd.date}
        LIMIT 1
      `;
      if (present.length > 0) continue;
      await sql`
        INSERT INTO user_schedule_days (user_id, scheduled_date, catalog_day_slug)
        VALUES (${BOOTSTRAP_USER_ID}, ${wd.date}, ${wd.dayId})
      `;
      console.log(`+ schedule ${wd.date} → ${wd.dayId}`);
    }
  }

  // Migrate the legacy JSON overrides row (workouts.id='overrides') into
  // user_schedule_days. After this lands the app reads from the table; the
  // JSON row can be deleted later.
  const legacy = await sql`
    SELECT data FROM workouts WHERE id = 'overrides' LIMIT 1
  `;
  if (legacy.length > 0) {
    const overrides = legacy[0].data ?? {};
    for (const [date, daySlug] of Object.entries(overrides)) {
      if (typeof daySlug !== "string") continue;
      // ON CONFLICT (user, date) UPDATE so manual overrides win over SCHEDULE
      await sql`
        INSERT INTO user_schedule_days (user_id, scheduled_date, catalog_day_slug)
        VALUES (${BOOTSTRAP_USER_ID}, ${date}, ${daySlug})
        ON CONFLICT (user_id, scheduled_date)
        DO UPDATE SET catalog_day_slug = EXCLUDED.catalog_day_slug, updated_at = NOW()
      `;
      console.log(`+ override ${date} → ${daySlug}`);
    }
  }

  console.log("catalog seed done");
} catch (err) {
  console.error(err);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
