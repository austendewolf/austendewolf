CREATE TABLE "mcp_accounts" (
	"name" text PRIMARY KEY NOT NULL,
	"email" text,
	"client_id" text NOT NULL,
	"client_secret" text NOT NULL,
	"refresh_token" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
