import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The workout app's tables.
 *
 * They live in their own Postgres schema rather than in `public`, which is what
 * lets the two apps share one database without sharing anything else: the
 * `workout_app` role owns this schema and cannot see `public`, and `awd_app`
 * owns `public` and cannot see this. Splitting them was the point, so the
 * schema name is load-bearing rather than decorative.
 *
 * `user_id` columns reference `auth.users` in the same project but carry no
 * foreign key. Supabase owns that table, and the app connects as a role with no
 * rights in the `auth` schema, so the constraint cannot be declared here. That
 * is the normal cost of a separate identity plane.
 */
export const workoutSchema = pgSchema("workout");

/**
 * One logged session, keyed `<date>-<dayId>` (e.g. `2026-06-04-upper2`).
 *
 * Deliberately single-tenant: there is no `user_id`. The catalog and overlay
 * tables below are per-user, so this is the last table that would need a column
 * before a second person could use the app.
 */
export const workouts = workoutSchema.table("workouts", {
  id: text("id").primaryKey(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Day templates (Upper Day 1, Easy Run, Pilates), visible to every user. */
export const catalogDays = workoutSchema.table(
  "catalog_days",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    subtitle: text("subtitle").default("").notNull(),
    description: text("description").default("").notNull(),
    authorUserId: uuid("author_user_id").notNull(),
    isPublished: boolean("is_published").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("catalog_days_author_idx").on(t.authorUserId)],
);

/** Exercises within a day template. Order is explicit so inserts don't shuffle. */
export const catalogExercises = workoutSchema.table(
  "catalog_exercises",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dayId: uuid("day_id")
      .notNull()
      .references(() => catalogDays.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    sets: integer("sets").default(1).notNull(),
    targetReps: integer("target_reps").default(0).notNull(),
    targetWeight: numeric("target_weight"),
    note: text("note"),
    description: text("description").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("catalog_exercises_day_id_slug_key").on(t.dayId, t.slug),
    index("catalog_exercises_day_idx").on(t.dayId, t.sortOrder),
  ],
);

/**
 * Per-exercise overrides. A null column means "inherit the catalog value",
 * which is why every overridable column here is nullable even where the
 * catalog's equivalent is not.
 */
export const userExerciseOverrides = workoutSchema.table(
  "user_exercise_overrides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    catalogExerciseId: uuid("catalog_exercise_id")
      .notNull()
      .references(() => catalogExercises.id, { onDelete: "cascade" }),
    sets: integer("sets"),
    targetReps: integer("target_reps"),
    targetWeight: numeric("target_weight"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("user_exercise_overrides_user_id_catalog_exercise_id_key").on(
      t.userId,
      t.catalogExerciseId,
    ),
    index("user_exercise_overrides_user_idx").on(t.userId),
  ],
);

/** Lets a user rename a catalog day without forking the catalog row. */
export const userDayOverrides = workoutSchema.table(
  "user_day_overrides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    catalogDayId: uuid("catalog_day_id")
      .notNull()
      .references(() => catalogDays.id, { onDelete: "cascade" }),
    name: text("name"),
    subtitle: text("subtitle"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("user_day_overrides_user_id_catalog_day_id_key").on(t.userId, t.catalogDayId),
    index("user_day_overrides_user_idx").on(t.userId),
  ],
);

/** Exercises a user added to a day template that aren't in the catalog. */
export const userCustomExercises = workoutSchema.table(
  "user_custom_exercises",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    catalogDayId: uuid("catalog_day_id")
      .notNull()
      .references(() => catalogDays.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    sets: integer("sets").default(1).notNull(),
    targetReps: integer("target_reps").default(0).notNull(),
    targetWeight: numeric("target_weight"),
    note: text("note"),
    description: text("description").default("").notNull(),
    // Defaults high so a user's own exercises sort after the catalog's.
    sortOrder: integer("sort_order").default(1000).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("user_custom_exercises_user_id_catalog_day_id_slug_key").on(
      t.userId,
      t.catalogDayId,
      t.slug,
    ),
    index("user_custom_exercises_user_day_idx").on(t.userId, t.catalogDayId, t.sortOrder),
  ],
);

/** One row per scheduled date. */
export const userScheduleDays = workoutSchema.table(
  "user_schedule_days",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    scheduledDate: date("scheduled_date").notNull(),
    catalogDaySlug: text("catalog_day_slug").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("user_schedule_days_user_id_scheduled_date_key").on(t.userId, t.scheduledDate),
    index("user_schedule_days_user_date_idx").on(t.userId, t.scheduledDate),
  ],
);

export type Workout = typeof workouts.$inferSelect;
export type NewWorkout = typeof workouts.$inferInsert;
export type CatalogDay = typeof catalogDays.$inferSelect;
export type CatalogExercise = typeof catalogExercises.$inferSelect;
export type UserScheduleDay = typeof userScheduleDays.$inferSelect;
