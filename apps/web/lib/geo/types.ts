import type { Feature, FeatureCollection, Point, Polygon, MultiPolygon } from "geojson";

/**
 * Shared data contract for the map. The ingestion pipeline (step 2) must
 * produce exactly this shape from /api/stations, so the UI never changes
 * when the data source does.
 */
export const STATION_KINDS = ["mrh", "hazmat", "sammelstelle"] as const;
export type StationKind = (typeof STATION_KINDS)[number];

export interface StationProps {
  /** Stable slug, e.g. "mrh-stauffacher". Used in the URL (?station=). */
  id: string;
  kind: StationKind;
  name: string;
  /** Stadtkreis 1–12. */
  kreis: number;
  /** Swiss postcode, e.g. "8004". */
  plz: string;
  /** Sammelstellen only: accepted materials. */
  materials?: string[];
  /** ISO dates (YYYY-MM-DD), soonest first, max 3. */
  nextDates?: string[];
  /** True for hand-written seed data; the UI shows a "Beispieldaten" badge. */
  placeholder?: boolean;
}

export type StationFeature = Feature<Point, StationProps>;
export type StationCollection = FeatureCollection<Point, StationProps>;

export interface KreisProps {
  kreis: number;
  name: string;
}

export type KreisFeature = Feature<Polygon | MultiPolygon, KreisProps>;
export type KreisCollection = FeatureCollection<Polygon | MultiPolygon, KreisProps>;
