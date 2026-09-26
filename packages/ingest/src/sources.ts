import type { EventTypeValue, StationKindValue } from "db";

/**
 * Every external source the ingest reads. All are Open Data Zürich, CC0.
 * Audit of formats and quirks: project doc 06_ingestion_plan.md.
 */

export const CKAN_BASE = "https://data.stadt-zuerich.ch/api/3/action";
export const WFS_BASE = "https://www.ogd.stadt-zuerich.ch/wfs/geoportal";

/** Yearly calendar CSVs, read through CKAN's DataStore API (JSON). */
export interface CalendarSource {
  /** CKAN dataset id */
  dataset: string;
  type: EventTypeValue;
  /** Columns the DataStore must expose (besides _id); anything else fails the run. */
  fields: readonly string[];
  /** Station-based calendars list a "Station" column that must match a station. */
  stationKind?: StationKindValue;
}

export const CALENDARS: readonly CalendarSource[] = [
  { dataset: "entsorgungskalender_papier", type: "paper", fields: ["PLZ", "Abholdatum"] },
  { dataset: "entsorgungskalender_karton", type: "cardboard", fields: ["PLZ", "Abholdatum"] },
  { dataset: "entsorgungskalender_bioabfall", type: "organic", fields: ["PLZ", "Abholdatum"] },
  { dataset: "entsorgungskalender_kehricht", type: "waste", fields: ["PLZ", "Abholdatum"] },
  {
    dataset: "entsorgungskalender_mobiler_recyclinghof",
    type: "mrh",
    fields: ["PLZ", "Station", "Abholdatum"],
    stationKind: "mrh",
  },
  {
    dataset: "entsorgungskalender_sonderabfall",
    type: "hazmat",
    fields: ["PLZ", "Station", "Abholdatum"],
    stationKind: "hazmat",
  },
];

/** Station locations, from the city's WFS as GeoJSON in WGS84. */
export interface GeoSource {
  kind: StationKindValue;
  service: string;
  typename: string;
}

export const GEO_LAYERS: readonly GeoSource[] = [
  // Despite its name, this layer is the Mobile Recyclinghof stop list
  // (kategorie "Mobile Recyclinghöfe"): coordinates for the calendar stops.
  { kind: "mrh", service: "Cargo__und_E_Tram", typename: "poi_cargoetram_view" },
  { kind: "hazmat", service: "Sonderabfallsammlung", typename: "poi_sonderabfall_view" },
  { kind: "sammelstelle", service: "Sammelstelle", typename: "poi_sammelstelle_view" },
  { kind: "recyclinghof", service: "Recyclinghof", typename: "poi_recyclinghof_view" },
];

export function wfsUrl(g: GeoSource): string {
  return `${WFS_BASE}/${g.service}?service=WFS&version=1.1.0&request=GetFeature&outputFormat=GeoJSON&typename=${g.typename}&srsName=EPSG:4326`;
}

export function geoDatasetId(g: GeoSource): string {
  return `wfs:${g.service}`;
}
