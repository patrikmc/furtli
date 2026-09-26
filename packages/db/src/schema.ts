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

export type Station = typeof station.$inferSelect;
export type NewStation = typeof station.$inferInsert;
export type CollectionEvent = typeof collectionEvent.$inferSelect;
export type StationKindValue = (typeof stationKind.enumValues)[number];
export type EventTypeValue = (typeof eventType.enumValues)[number];
