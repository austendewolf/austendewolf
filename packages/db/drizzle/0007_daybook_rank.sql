-- Rank the daybook from facts, and hold drafts on the item.
--
-- `pressure` and `size` join `due` as the three facts rank reads. Both stay
-- null until intake or the backfill sets them, so a labelled item can be told
-- from one nobody has looked at. `prep` holds a draft Claude wrote ahead of
-- time, and `prep_at` says when, so a draft older than the item's last edit
-- reads as stale.
--
-- Hand-written: drizzle-kit cannot diff past 0006, which moved tables between
-- schemas outside its snapshots. Every statement is safe to run twice.

ALTER TABLE "daybook"."items" ADD COLUMN IF NOT EXISTS "pressure" text;
--> statement-breakpoint
ALTER TABLE "daybook"."items" ADD COLUMN IF NOT EXISTS "size" text;
--> statement-breakpoint
ALTER TABLE "daybook"."items" ADD COLUMN IF NOT EXISTS "prep" jsonb;
--> statement-breakpoint
ALTER TABLE "daybook"."items" ADD COLUMN IF NOT EXISTS "prep_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "daybook"."items" DROP CONSTRAINT IF EXISTS "items_pressure_check";
--> statement-breakpoint
ALTER TABLE "daybook"."items" ADD CONSTRAINT "items_pressure_check" CHECK ("daybook"."items"."pressure" in ('waiting', 'meeting', 'deadline', 'none'));
--> statement-breakpoint
ALTER TABLE "daybook"."items" DROP CONSTRAINT IF EXISTS "items_size_check";
--> statement-breakpoint
ALTER TABLE "daybook"."items" ADD CONSTRAINT "items_size_check" CHECK ("daybook"."items"."size" in ('quick', 'session', 'project'));
