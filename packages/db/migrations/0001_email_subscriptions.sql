CREATE TYPE "public"."email_kind" AS ENUM('confirm', 'welcome', 'reminder', 'digest');--> statement-breakpoint
CREATE TYPE "public"."subscriber_status" AS ENUM('pending', 'active', 'unsubscribed');--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscriber_id" integer NOT NULL,
	"kind" "email_kind" NOT NULL,
	"key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "email_log_once" UNIQUE("subscriber_id","kind","key")
);
--> statement-breakpoint
CREATE TABLE "subscriber" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"status" "subscriber_status" DEFAULT 'pending' NOT NULL,
	"lang" text DEFAULT 'de' NOT NULL,
	"plz" text,
	"station_id" text,
	"topics" "event_type"[] DEFAULT '{}'::event_type[] NOT NULL,
	"reminders" boolean DEFAULT true NOT NULL,
	"digest" boolean DEFAULT false NOT NULL,
	"pending_prefs" jsonb,
	"confirm_token" text,
	"confirm_sent_at" timestamp with time zone,
	"unsubscribe_token" text NOT NULL,
	"consent_text" text,
	"consent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"signup_source" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"utm_term" text,
	"referrer" text,
	"landing_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriber_email_key" UNIQUE("email"),
	CONSTRAINT "subscriber_confirm_token_key" UNIQUE("confirm_token"),
	CONSTRAINT "subscriber_unsubscribe_token_key" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_subscriber_id_subscriber_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscriber"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber" ADD CONSTRAINT "subscriber_station_id_station_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."station"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriber_status_idx" ON "subscriber" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriber_plz_idx" ON "subscriber" USING btree ("plz");