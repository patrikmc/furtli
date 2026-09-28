CREATE TABLE "subscription" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscriber_id" integer NOT NULL,
	"plz" text,
	"station_id" text,
	"topics" "event_type"[] DEFAULT '{}'::event_type[] NOT NULL,
	"pending_topics" "event_type"[],
	"source" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_target_key" UNIQUE NULLS NOT DISTINCT("subscriber_id","plz","station_id"),
	CONSTRAINT "subscription_has_target" CHECK ("subscription"."plz" is not null or "subscription"."station_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "subscriber" DROP CONSTRAINT "subscriber_station_id_station_id_fk";
--> statement-breakpoint
DROP INDEX "subscriber_plz_idx";--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_subscriber_id_subscriber_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscriber"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_station_id_station_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."station"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_plz_idx" ON "subscription" USING btree ("plz");--> statement-breakpoint
CREATE INDEX "subscription_station_idx" ON "subscription" USING btree ("station_id");--> statement-breakpoint
-- Data: move what each subscriber follows into one subscription row.
-- Active subscribers keep their confirmed types; pending ones wait for the click;
-- unsubscribed ones keep their last choice for the record (the status stops sending).
INSERT INTO "subscription" ("subscriber_id", "plz", "station_id", "topics", "pending_topics", "source", "confirmed_at", "created_at", "updated_at")
SELECT "id", "plz", "station_id",
       CASE WHEN "status" = 'pending' THEN '{}'::event_type[] ELSE "topics" END,
       CASE WHEN "status" = 'pending' THEN "topics" ELSE NULL END,
       "signup_source",
       CASE WHEN "status" = 'pending' THEN NULL ELSE "confirmed_at" END,
       "created_at", "updated_at"
FROM "subscriber"
WHERE "plz" IS NOT NULL OR "station_id" IS NOT NULL;
--> statement-breakpoint
-- An active subscriber's unconfirmed change becomes a pending change on that target (added, not replacing).
INSERT INTO "subscription" ("subscriber_id", "plz", "station_id", "pending_topics", "created_at", "updated_at")
SELECT "id", "pending_prefs"->>'plz', "pending_prefs"->>'stationId',
       ARRAY(SELECT jsonb_array_elements_text("pending_prefs"->'topics'))::event_type[],
       "updated_at", "updated_at"
FROM "subscriber"
WHERE "pending_prefs" IS NOT NULL
  AND ("pending_prefs"->>'plz' IS NOT NULL OR "pending_prefs"->>'stationId' IS NOT NULL)
ON CONFLICT ("subscriber_id", "plz", "station_id") DO UPDATE SET "pending_topics" = EXCLUDED."pending_topics";
--> statement-breakpoint
-- pending_prefs now only holds account settings.
UPDATE "subscriber"
SET "pending_prefs" = jsonb_build_object('lang', "pending_prefs"->'lang', 'reminders', "pending_prefs"->'reminders', 'digest', "pending_prefs"->'digest')
WHERE "pending_prefs" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "subscriber" DROP COLUMN "plz";--> statement-breakpoint
ALTER TABLE "subscriber" DROP COLUMN "station_id";--> statement-breakpoint
ALTER TABLE "subscriber" DROP COLUMN "topics";