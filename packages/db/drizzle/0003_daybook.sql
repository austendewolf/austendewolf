CREATE SCHEMA "daybook";
--> statement-breakpoint
CREATE TABLE "daybook"."captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drive_file_id" text NOT NULL,
	"page_date" date,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "captures_drive_file_id_unique" UNIQUE("drive_file_id")
);
--> statement-breakpoint
CREATE TABLE "daybook"."days" (
	"date" date PRIMARY KEY NOT NULL,
	"focus" text[] DEFAULT '{}'::text[] NOT NULL,
	"added" text[] DEFAULT '{}'::text[] NOT NULL,
	"closed" text[] DEFAULT '{}'::text[] NOT NULL,
	"load" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daybook"."items" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'task' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"horizon" text DEFAULT 'later' NOT NULL,
	"priority" integer,
	"ranked_by_hand" date,
	"person" text,
	"link" text,
	"source" text,
	"first_seen" date NOT NULL,
	"closed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_status_check" CHECK ("daybook"."items"."status" in ('open', 'closed', 'dropped')),
	CONSTRAINT "items_horizon_check" CHECK ("daybook"."items"."horizon" in ('today', 'later'))
);
--> statement-breakpoint
CREATE INDEX "captures_page_date_idx" ON "daybook"."captures" USING btree ("page_date");--> statement-breakpoint
CREATE INDEX "items_open_idx" ON "daybook"."items" USING btree ("status","horizon","priority");--> statement-breakpoint
CREATE INDEX "items_closed_on_idx" ON "daybook"."items" USING btree ("closed_on");