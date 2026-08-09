-- Per-user overlay on top of the global catalog. Every table here is
-- entirely user-owned. None of these rows exist for a fresh user; they
-- get created lazily the first time the user overrides something.
--
-- Read path: SELECT catalog row LEFT JOIN <user_id>'s override row,
-- COALESCE NULL overrides to catalog values, UNION user_custom_exercises.

-- Per-exercise overrides. Nullable columns mean "inherit catalog";
-- non-null means "user value wins".
CREATE TABLE IF NOT EXISTS user_exercise_overrides (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID         NOT NULL,
  catalog_exercise_id   UUID         NOT NULL REFERENCES catalog_exercises(id) ON DELETE CASCADE,
  sets                  INT          NULL,
  target_reps           INT          NULL,
  target_weight         NUMERIC      NULL,
  note                  TEXT         NULL,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, catalog_exercise_id)
);

CREATE INDEX IF NOT EXISTS user_exercise_overrides_user_idx
  ON user_exercise_overrides(user_id);

-- Per-day-type overrides. Lets the user rename a catalog day in their
-- version without forking the whole catalog row.
CREATE TABLE IF NOT EXISTS user_day_overrides (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL,
  catalog_day_id  UUID         NOT NULL REFERENCES catalog_days(id) ON DELETE CASCADE,
  name            TEXT         NULL,
  subtitle        TEXT         NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, catalog_day_id)
);

CREATE INDEX IF NOT EXISTS user_day_overrides_user_idx
  ON user_day_overrides(user_id);

-- Exercises the user added to a catalog day type that aren't in the
-- catalog. Pure user data, no catalog reference for the exercise itself.
CREATE TABLE IF NOT EXISTS user_custom_exercises (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL,
  catalog_day_id  UUID         NOT NULL REFERENCES catalog_days(id) ON DELETE CASCADE,
  slug            TEXT         NOT NULL,
  name            TEXT         NOT NULL,
  sets            INT          NOT NULL DEFAULT 1,
  target_reps     INT          NOT NULL DEFAULT 0,
  target_weight   NUMERIC      NULL,
  note            TEXT         NULL,
  description     TEXT         NOT NULL DEFAULT '',
  sort_order      INT          NOT NULL DEFAULT 1000,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, catalog_day_id, slug)
);

CREATE INDEX IF NOT EXISTS user_custom_exercises_user_day_idx
  ON user_custom_exercises(user_id, catalog_day_id, sort_order);

-- Per-user schedule. One row per scheduled date. Replaces the JSON-blob
-- approach in workouts.id = 'overrides'.
CREATE TABLE IF NOT EXISTS user_schedule_days (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID         NOT NULL,
  scheduled_date      DATE         NOT NULL,
  catalog_day_slug    TEXT         NOT NULL,
  sort_order          INT          NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, scheduled_date)
);

CREATE INDEX IF NOT EXISTS user_schedule_days_user_date_idx
  ON user_schedule_days(user_id, scheduled_date);
