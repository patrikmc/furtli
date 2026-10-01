import {
  boolean,
  check,
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
 *   subscriber        one row per email address: account-wide settings
 *                     (language, evening reminders, weekly overview), consent
 *                     (double opt-in) and first-touch attribution
 *   subscription      what an address follows: one row per postcode or
 *                     station, each with its own collection types. Signing up
 *                     again adds a row (or changes that row's types); it
 *                     never replaces the others.
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
    /** Email the evening before a collection (all subscriptions). */
    reminders: boolean("reminders").notNull().default(true),
    /** Weekly overview on Sunday evening, covering all subscriptions. */
    digest: boolean("digest").notNull().default(false),
    /**
     * Account settings requested by an already active subscriber
     * ({ lang, reminders, digest }); applied on confirmation. What they follow
     * waits in subscription.pending_topics.
     */
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
  (t) => [index("subscriber_status_idx").on(t.status)],
);

export const subscription = pgTable(
  "subscription",
  {
    id: serial("id").primaryKey(),
    subscriberId: integer("subscriber_id")
      .notNull()
      .references(() => subscriber.id, { onDelete: "cascade" }),
    /** Postcode: kerbside dates and the MRH/hazmat stops the city assigns to it. */
    plz: text("plz"),
    /** A single MRH/hazmat stop (when subscribing from a station). */
    stationId: text("station_id").references(() => station.id),
    /** Confirmed collection types. Empty = not (yet) active. */
    topics: eventType("topics")
      .array()
      .notNull()
      .default(sql`'{}'::event_type[]`),
    /** Requested types waiting for the confirmation click; replace `topics` on confirm. */
    pendingTopics: eventType("pending_topics").array(),
    /** Where in the app this was requested: "nearby" | "station" | … */
    source: text("source"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("subscription_target_key").on(t.subscriberId, t.plz, t.stationId).nullsNotDistinct(),
    check("subscription_has_target", sql`${t.plz} is not null or ${t.stationId} is not null`),
    index("subscription_plz_idx").on(t.plz),
    index("subscription_station_idx").on(t.stationId),
  ],
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
export type Subscription = typeof subscription.$inferSelect;
export type EmailLog = typeof emailLog.$inferSelect;

/**
 * Weekly analytics snapshot (apps/web/lib/analytics/weekly): one row per
 * reporting week (Sunday 00:00 to Saturday 24:00, Europe/Zurich), written by
 * the Sunday cron. Aggregates only, never a row per person or an email.
 * Keeps the trend after Umami's 6-month retention and gives the report one
 * place to read from.
 */
export const weeklyMetrics = pgTable("weekly_metrics", {
  /** ISO week of the period's Saturday, e.g. "2026-W40". */
  week: text("week").primaryKey(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  /** Snapshot format; bump when the JSON shape changes. */
  version: integer("version").notNull().default(1),
  /** Umami Cloud API aggregates (null when the API wasn't configured or reachable). */
  umami: jsonb("umami"),
  /** Neon aggregates: subscribers, subscriptions, emails, ingest runs. */
  neon: jsonb("neon"),
  /** Rates computed from the two (activation, funnel steps, churn). */
  derived: jsonb("derived"),
  /** Sources or calls that failed: shown as data gaps in the report. */
  errors: jsonb("errors").notNull().default(sql`'[]'::jsonb`),
  /** Page in the Notion Reviews database, once exported. */
  notionPageId: text("notion_page_id"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WeeklyMetrics = typeof weeklyMetrics.$inferSelect;
