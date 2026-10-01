CREATE TABLE "weekly_metrics" (
	"week" text PRIMARY KEY NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"umami" jsonb,
	"neon" jsonb,
	"derived" jsonb,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notion_page_id" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
