CREATE TABLE "daybook"."triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" text NOT NULL,
	"surface" text NOT NULL,
	"account" text DEFAULT '' NOT NULL,
	"external_id" text NOT NULL,
	"link" text,
	"title" text,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "triggers_external_key" UNIQUE("surface","account","external_id")
);
--> statement-breakpoint
ALTER TABLE "daybook"."triggers" ADD CONSTRAINT "triggers_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "daybook"."items"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "triggers_item_idx" ON "daybook"."triggers" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "triggers_surface_idx" ON "daybook"."triggers" USING btree ("surface","seen_at");