-- Remember what he pushed off today.
--
-- When today drops below three, the day list pulls the top of later up to fill
-- it. `deferred` holds the items he moved from today to later on that date, so
-- the fill never hands back the item he just pushed away.
--
-- Hand-written: drizzle-kit cannot diff past 0006, which moved tables between
-- schemas outside its snapshots. Safe to run twice.

ALTER TABLE "daybook"."days" ADD COLUMN IF NOT EXISTS "deferred" text[] DEFAULT '{}'::text[] NOT NULL;
