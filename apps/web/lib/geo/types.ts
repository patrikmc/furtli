import type { Feature, FeatureCollection, Point } from "geojson";
export type { KreisCollection, KreisFeature, PlzCollection, PlzFeature } from "geo";

/**
 * The data contract between /api/stations and the map. The API builds it
 * from the database (packages/ingest fills it); without a database it
 * serves lib/geo/data/stations.seed.json in the same shape.
 */
export const STATION_KINDS = ["mrh", "hazmat", "sammelstelle", "recyclinghof"] as const;
export type StationKind = (typeof STATION_KINDS)[number];

/**
 * What a Sammelstelle takes (Open Data Zürich flags glas / metall / oel / textilien).
 * Only Sammelstellen carry per-site materials; the city sends glass, small
 * metal, oil and textiles there rather than to the Recyclinghöfe.
 */
export const MATERIALS = ["glass", "metal", "oil", "textiles"] as const;
export type Material = (typeof MATERIALS)[number];

export interface StationProps {
  /** Stable slug, e.g. "mrh-stauffacher-st-jakobstrasse-29". Used in the URL (?station=). */
  id: string;
  kind: StationKind;
  /** Short name: the Quartier for MRH/hazmat stops, the address for Sammelstellen. */
  name: string;
  /** Place/address detail, e.g. "St. Jakobstrasse 29". */
  address?: string | null;
  /** Stadtkreis 1–12 where the station is. */
  kreis: number;
  /** Postcode where the station is. */
  plz: string;
  /** Sammelstellen: glass, metal, oil, textiles. */
  materials?: string[];
  /** Upcoming dates (ISO, soonest first, max 3). MRH and hazmat only. */
  nextDates?: string[];
  /** Postcodes the city assigns to this stop in its calendar ("official stop for 8004"). */
  servesPlz?: string[];
  /** Weekly hours ({ mo: "13:00–19:00", … }) or a note ({ note: "8 bis 11.30 Uhr" }). */
  hours?: Record<string, string> | null;
  /** True for hand-written seed data; the UI shows a "Beispieldaten" badge. */
  placeholder?: boolean;
}

export type StationFeature = Feature<Point, StationProps>;
export type StationCollection = FeatureCollection<Point, StationProps>;

/** Next kerbside collections for one postcode (/api/calendar?plz=). */
export interface PlzCalendar {
  plz: string;
  next: Partial<Record<"paper" | "cardboard" | "organic" | "waste", string[]>>;
}
