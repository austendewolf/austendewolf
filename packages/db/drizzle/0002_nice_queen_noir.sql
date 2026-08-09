CREATE SCHEMA "workout";
--> statement-breakpoint
CREATE TABLE "mcp_upstreams" (
	"name" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"allow" text[],
	"deny" text[],
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout"."catalog_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"author_user_id" uuid NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_days_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "workout"."catalog_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sets" integer DEFAULT 1 NOT NULL,
	"target_reps" integer DEFAULT 0 NOT NULL,
	"target_weight" numeric,
	"note" text,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_exercises_day_id_slug_key" UNIQUE("day_id","slug")
);
--> statement-breakpoint
CREATE TABLE "workout"."user_custom_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"catalog_day_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sets" integer DEFAULT 1 NOT NULL,
	"target_reps" integer DEFAULT 0 NOT NULL,
	"target_weight" numeric,
	"note" text,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 1000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_custom_exercises_user_id_catalog_day_id_slug_key" UNIQUE("user_id","catalog_day_id","slug")
);
--> statement-breakpoint
CREATE TABLE "workout"."user_day_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"catalog_day_id" uuid NOT NULL,
	"name" text,
	"subtitle" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_day_overrides_user_id_catalog_day_id_key" UNIQUE("user_id","catalog_day_id")
);
--> statement-breakpoint
CREATE TABLE "workout"."user_exercise_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"catalog_exercise_id" uuid NOT NULL,
	"sets" integer,
	"target_reps" integer,
	"target_weight" numeric,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_exercise_overrides_user_id_catalog_exercise_id_key" UNIQUE("user_id","catalog_exercise_id")
);
--> statement-breakpoint
CREATE TABLE "workout"."user_schedule_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scheduled_date" date NOT NULL,
	"catalog_day_slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_schedule_days_user_id_scheduled_date_key" UNIQUE("user_id","scheduled_date")
);
--> statement-breakpoint
CREATE TABLE "workout"."workouts" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workout"."catalog_exercises" ADD CONSTRAINT "catalog_exercises_day_id_catalog_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "workout"."catalog_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout"."user_custom_exercises" ADD CONSTRAINT "user_custom_exercises_catalog_day_id_catalog_days_id_fk" FOREIGN KEY ("catalog_day_id") REFERENCES "workout"."catalog_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout"."user_day_overrides" ADD CONSTRAINT "user_day_overrides_catalog_day_id_catalog_days_id_fk" FOREIGN KEY ("catalog_day_id") REFERENCES "workout"."catalog_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout"."user_exercise_overrides" ADD CONSTRAINT "user_exercise_overrides_catalog_exercise_id_catalog_exercises_id_fk" FOREIGN KEY ("catalog_exercise_id") REFERENCES "workout"."catalog_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_days_author_idx" ON "workout"."catalog_days" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "catalog_exercises_day_idx" ON "workout"."catalog_exercises" USING btree ("day_id","sort_order");--> statement-breakpoint
CREATE INDEX "user_custom_exercises_user_day_idx" ON "workout"."user_custom_exercises" USING btree ("user_id","catalog_day_id","sort_order");--> statement-breakpoint
CREATE INDEX "user_day_overrides_user_idx" ON "workout"."user_day_overrides" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_exercise_overrides_user_idx" ON "workout"."user_exercise_overrides" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_schedule_days_user_date_idx" ON "workout"."user_schedule_days" USING btree ("user_id","scheduled_date");