CREATE TYPE "public"."event_type" AS ENUM('paper', 'cardboard', 'organic', 'waste', 'mrh', 'hazmat');--> statement-breakpoint
CREATE TYPE "public"."ingest_status" AS ENUM('running', 'ok', 'failed');--> statement-breakpoint
CREATE TYPE "public"."station_kind" AS ENUM('mrh', 'hazmat', 'sammelstelle', 'recyclinghof');--> statement-breakpoint
CREATE TABLE "collection_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "event_type" NOT NULL,
	"plz" text NOT NULL,
	"date" date NOT NULL,
	"station_id" text,
	"source_file_id" integer NOT NULL,
	CONSTRAINT "collection_event_key" UNIQUE NULLS NOT DISTINCT("type","plz","date","station_id")
);
--> statement-breakpoint
CREATE TABLE "ingest_run" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"trigger" text NOT NULL,
	"status" "ingest_status" DEFAULT 'running' NOT NULL,
	"summary" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "source_file" (
	"id" serial PRIMARY KEY NOT NULL,
	"dataset" text NOT NULL,
	"year" integer,
	"url" text NOT NULL,
	"sha256" text NOT NULL,
	"bytes" integer NOT NULL,
	"row_count" integer NOT NULL,
	"content" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_file_dataset_sha" UNIQUE("dataset","sha256")
);
--> statement-breakpoint
CREATE TABLE "station" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "station_kind" NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"plz" text NOT NULL,
	"kreis" integer,
	"lng" double precision NOT NULL,
	"lat" double precision NOT NULL,
	"materials" text[],
	"hours" jsonb,
	"source_poi_id" text NOT NULL,
	"source_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source_file_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collection_event" ADD CONSTRAINT "collection_event_station_id_station_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."station"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_event" ADD CONSTRAINT "collection_event_source_file_id_source_file_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."source_file"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station" ADD CONSTRAINT "station_source_file_id_source_file_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."source_file"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_event_plz_date" ON "collection_event" USING btree ("plz","date");--> statement-breakpoint
CREATE INDEX "collection_event_station_date" ON "collection_event" USING btree ("station_id","date");--> statement-breakpoint
CREATE INDEX "station_kind_idx" ON "station" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "station_source_poi_idx" ON "station" USING btree ("kind","source_poi_id");