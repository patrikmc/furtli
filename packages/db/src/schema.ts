import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Recycling map schema. Filled by packages/ingest from Open Data Zürich.
 *
 *   source_file       every raw file we fetched, deduplicated by SHA-256
 *   ingest_run        one row per ingest (cron or manual), with a summary
 *   station           places: Mobile Recyclinghof stops, Sonderabfallmobil
 *                     stops, Wertstoff-Sammelstellen, Recyclinghöfe
 *   collection_event  dated collections: kerbside (paper, cardboard,
 *                     organic, waste) per postcode, and station dates
 *                     (mrh, hazmat) per postcode the station serves
 *
 * Email subscriptions (apps/web/lib/subscriptions):
 *
 *   subscriber        one row per email address: what to be reminded of,
 *                     consent (double opt-in) and first-touch attribution
 *   email_log         every email we sent or tried to send; the unique key
 *                     makes each reminder/digest go out at most once
 */

export const stationKind = pgEnum("station_kind", ["mrh", "hazmat", "sammelstelle", "recyclinghof"]);
export const eventType = pgEnum("event_type", ["paper", "cardboard", "organic", "waste", "mrh", "hazmat"]);
export const ingestStatus = pgEnum("ingest_status", ["running", "ok", "failed"]);

export const sourceFile = pgTable(
  "source_file",
  {
    id: serial("id").primaryKey(),
    /** e.g. "entsorgungskalender_papier" or "wfs:Sammelstelle" */
    dataset: text("dataset").notNull(),
    /** Calendar year for yearly calendar files, null for geo layers. */
    year: integer("year"),
    url: text("url").notNull(),
    sha256: text("sha256").notNull(),
    bytes: integer("bytes").notNull(),
    rowCount: integer("row_count").notNull(),
    /** The raw payload as fetched, canonical JSON. Tiny (< 1 MB/year in total). */
    content: text("content").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("source_file_dataset_sha").on(t.dataset, t.sha256)],
);

export const ingestRun = pgTable("ingest_run", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  /** "cron" | "manual" | "test" */
  trigger: text("trigger").notNull(),
  status: ingestStatus("status").notNull().default("running"),
  /** Per-dataset counts (fetched, new file?, added, removed), warnings. */
  summary: jsonb("summary"),
  error: text("error"),
});

export const station = pgTable(
  "station",
  {
    /** Stable slug, e.g. "mrh-stauffacher-st-jakobstrasse-29", "sst-74421". */
    id: text("id").primaryKey(),
    kind: stationKind("kind").notNull(),
    /** Short display name: the Quartier for MRH/hazmat stops, the address for Sammelstellen. */
    name: text("name").notNull(),
    address: text("address"),
    /** Postcode where the station is located (not the postcodes it serves). */
    plz: text("plz").notNull(),
    kreis: integer("kreis"),
    lng: doublePrecision("lng").notNull(),
    lat: doublePrecision("lat").notNull(),
    /** Sammelstellen: glass, metal, oil, textiles. */
    materials: text("materials").array(),
    /** Opening hours / acceptance times as published, e.g. { note: "8 bis 11.30 Uhr" }. */
    hours: jsonb("hours"),
    /** The city's POI id, to follow a station across renames. */
    sourcePoiId: text("source_poi_id").notNull(),
    /** The exact name string in the city's data (for matching and debugging). */
    sourceName: text("source_name").notNull(),
    /** False once a station disappears from the city's layer (kept for history). */
    active: boolean("active").notNull().default(true),
    sourceFileId: integer("source_file_id").references(() => sourceFile.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("station_kind_idx").on(t.kind), index("station_source_poi_idx").on(t.kind, t.sourcePoiId)],
);

export const collectionEvent = pgTable(
  "collection_event",
  {
    id: serial("id").primaryKey(),
    type: eventType("type").notNull(),
    /** The residents' postcode this date applies to. */
    plz: text("plz").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    /** Set for mrh/hazmat: where the collection happens. */
    stationId: text("station_id").references(() => station.id),
    sourceFileId: integer("source_file_id")
      .notNull()
      .references(() => sourceFile.id),
  },
  (t) => [
    unique("collection_event_key").on(t.type, t.plz, t.date, t.stationId).nullsNotDistinct(),
    index("collection_event_plz_date").on(t.plz, t.date),
    index("collection_event_station_date").on(t.stationId, t.date),
  ],
);

export const subscriberStatus = pgEnum("subscriber_status", ["pending", "active", "unsubscribed"]);
export const emailKind = pgEnum("email_kind", ["confirm", "welcome", "reminder", "digest"]);

export const subscriber = pgTable(
  "subscriber",
  {
    id: serial("id").primaryKey(),
    /** Lower-cased, trimmed. One row per address. */
    email: text("email").notNull().unique("subscriber_email_key"),
    status: subscriberStatus("status").notNull().default("pending"),
    /** "de" | "en" – language of the emails. */
    lang: text("lang").notNull().default("de"),
    /** Postcode for kerbside dates and the MRH/hazmat stops the city assigns to it. */
    plz: text("plz"),
    /** A single MRH/hazmat stop to follow (set when subscribing from a station). */
    stationId: text("station_id").references(() => station.id),
    /** Which collections to be reminded of. */
    topics: eventType("topics")
      .array()
      .notNull()
      .default(sql`'{}'::event_type[]`),
    /** Email the evening before a collection. */
    reminders: boolean("reminders").notNull().default(true),
    /** Weekly overview on Sunday evening. */
    digest: boolean("digest").notNull().default(false),
    /** Changes requested by an already active subscriber; applied on confirmation. */
    pendingPrefs: jsonb("pending_prefs"),
    /** One-time token in the confirmation link; cleared once used. */
    confirmToken: text("confirm_token").unique("subscriber_confirm_token_key"),
    confirmSentAt: timestamp("confirm_sent_at", { withTimezone: true }),
    /** Stable token for the unsubscribe link in every email. */
    unsubscribeToken: text("unsubscribe_token").notNull().unique("subscriber_unsubscribe_token_key"),
    /** The consent sentence shown next to the checkbox, stored as proof. */
    consentText: text("consent_text"),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    /** Where in the app the form was: "nearby" | "station" | … */
    signupSource: text("signup_source"),
    /** First-touch attribution of the visit that led to the sign-up. */
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    utmTerm: text("utm_term"),
    /** Referring host, e.g. "www.reddit.com" (no path or query). */
    referrer: text("referrer"),
    /** First page of the visit, without query string. */
    landingPath: text("landing_path"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("subscriber_status_idx").on(t.status), index("subscriber_plz_idx").on(t.plz)],
);

export const emailLog = pgTable(
  "email_log",
  {
    id: serial("id").primaryKey(),
    subscriberId: integer("subscriber_id")
      .notNull()
      .references(() => subscriber.id, { onDelete: "cascade" }),
    kind: emailKind("kind").notNull(),
    /** What this email is about, e.g. "2026-10-27" (reminder date) or a confirm token. */
    key: text("key").notNull(),
    /** "queued" (claimed, not yet sent) | "sent" | "failed" | "dev" (logged, no API key) */
    status: text("status").notNull().default("queued"),
    /** Resend's email id. */
    providerId: text("provider_id"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [unique("email_log_once").on(t.subscriberId, t.kind, t.key)],
);

export type Station = typeof station.$inferSelect;
export type NewStation = typeof station.$inferInsert;
export type CollectionEvent = typeof collectionEvent.$inferSelect;
export type StationKindValue = (typeof stationKind.enumValues)[number];
export type EventTypeValue = (typeof eventType.enumValues)[number];
export type Subscriber = typeof subscriber.$inferSelect;
export type NewSubscriber = typeof subscriber.$inferInsert;
export type EmailLog = typeof emailLog.$inferSelect;
