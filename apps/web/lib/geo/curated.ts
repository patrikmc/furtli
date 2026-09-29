import curated from "./data/stations.curated.json";
import type { StationCollection } from "./types";

/**
 * Recycling sites we list by hand: private operators (Spross, Remondis,
 * Recycling-Paradies, …) and neighbouring towns' Entsorgungsparks. They
 * aren't in the city's open data, so the ingest never sees them; the API
 * adds them to whatever it serves (database or seed).
 *
 * To add or update one: edit data/stations.curated.json (coordinates from
 * the swisstopo address search, `verified` = the day you checked), then run
 * `pnpm test` — lib/geo/curated.test.ts checks every entry.
 */
export const CURATED_STATIONS = curated as unknown as StationCollection;

/** The collection plus the curated sites (curated ids start with "site-"). */
export function withCurated(fc: StationCollection, extra: StationCollection = CURATED_STATIONS): StationCollection {
  return { type: "FeatureCollection", features: [...fc.features, ...extra.features] };
}
