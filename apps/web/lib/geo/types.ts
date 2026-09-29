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
 * Materials the material filter offers (Open Data Zürich flags glas / metall /
 * oel / textilien on Sammelstellen). The city's Recyclinghöfe and the MRH
 * carry no per-site list; curated sites use a longer vocabulary (see
 * `materials` in lib/i18n/ui.ts), of which these four are a subset.
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
  /** What the site takes: Sammelstellen glass/metal/oil/textiles; curated sites more (keys in ui.ts `materials`). */
  materials?: string[];
  /** Upcoming dates (ISO, soonest first, max 3). MRH and hazmat only. */
  nextDates?: string[];
  /** Postcodes the city assigns to this stop in its calendar ("official stop for 8004"). */
  servesPlz?: string[];
  /** Weekly hours ({ mo: "13:00–19:00", … }) or a note ({ note: "8 bis 11.30 Uhr" }). */
  hours?: Record<string, string> | null;
  /** True for hand-written seed data; the UI shows a "Beispieldaten" badge. */
  placeholder?: boolean;

  // ---- Hand-curated sites (lib/geo/data/stations.curated.json) -------------
  // Private recycling centres and neighbouring towns' sites, which aren't in
  // the city's open data. `kreis` is 0 for sites outside the city.
  /** Town, shown instead of the Kreis for sites outside the city ("Adliswil"). */
  place?: string;
  /** Who runs it, when that isn't obvious from the name ("Remondis"). */
  operator?: string;
  /** Fees, per language. Absent = none published. */
  fee?: LocalizedText;
  /** Who may use it, if that's restricted or unclear, per language. */
  access?: LocalizedText;
  /** Operator's page (hours, prices). Always https. */
  website?: string;
  /** ISO date we last checked the details by hand. */
  verified?: string;
}

export interface LocalizedText {
  de: string;
  en: string;
}

export type StationFeature = Feature<Point, StationProps>;
export type StationCollection = FeatureCollection<Point, StationProps>;

/** Next kerbside collections for one postcode (/api/calendar?plz=). */
export interface PlzCalendar {
  plz: string;
  next: Partial<Record<"paper" | "cardboard" | "organic" | "waste", string[]>>;
}
