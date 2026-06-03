-- Global catalog of workout day types and their exercises.
--
-- Day types (Upper Day 1, Easy Run, Pilates, etc.) live in the catalog and
-- are visible to every signed-in user. Users layer their own overrides on
-- top via separate tables (see 004_user_overlay.sql). Catalog rows are
-- created and edited only by their author until is_published flips true,
-- after which they're treated as stable references everyone else depends on.

CREATE TABLE IF NOT EXISTS catalog_days (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT         NOT NULL UNIQUE,
  name            TEXT         NOT NULL,
  subtitle        TEXT         NOT NULL DEFAULT '',
  description     TEXT         NOT NULL DEFAULT '',
  author_user_id  UUID         NOT NULL,
  is_published    BOOLEAN      NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS catalog_days_author_idx
  ON catalog_days(author_user_id);
CREATE INDEX IF NOT EXISTS catalog_days_published_idx
  ON catalog_days(is_published) WHERE is_published;

-- Exercises within a catalog day. Order is explicit via sort_order so
-- adding new exercises doesn't require shuffling existing ones.
CREATE TABLE IF NOT EXISTS catalog_exercises (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id          UUID         NOT NULL REFERENCES catalog_days(id) ON DELETE CASCADE,
  slug            TEXT         NOT NULL,
  name            TEXT         NOT NULL,
  sets            INT          NOT NULL DEFAULT 1,
  target_reps     INT          NOT NULL DEFAULT 0,
  target_weight   NUMERIC      NULL,
  note            TEXT         NULL,
  description     TEXT         NOT NULL DEFAULT '',
  sort_order      INT          NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (day_id, slug)
);

CREATE INDEX IF NOT EXISTS catalog_exercises_day_idx
  ON catalog_exercises(day_id, sort_order);
