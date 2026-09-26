import { STATION_KINDS, type StationCollection, type StationFeature, type StationProps } from "./types";

/**
 * Where station data comes from: /api/stations, which reads the database
 * filled by packages/ingest (or serves the seed file when no database is
 * configured). Nothing else in the UI knows where the data lives.
 */
export const STATIONS_URL = "/api/stations";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isStationProps(p: unknown): p is StationProps {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    o.id.length > 0 &&
    typeof o.name === "string" &&
    (STATION_KINDS as readonly string[]).includes(o.kind as string) &&
    typeof o.kreis === "number" &&
    Number.isInteger(o.kreis) &&
    o.kreis >= 0 &&
    o.kreis <= 12 &&
    typeof o.plz === "string" &&
    /^\d{4}$/.test(o.plz) &&
    (o.materials === undefined ||
      (Array.isArray(o.materials) && o.materials.every((m) => typeof m === "string"))) &&
    (o.servesPlz === undefined || (Array.isArray(o.servesPlz) && o.servesPlz.every((p) => typeof p === "string"))) &&
    (o.nextDates === undefined ||
      (Array.isArray(o.nextDates) &&
        o.nextDates.length <= 3 &&
        o.nextDates.every((d) => typeof d === "string" && ISO_DATE.test(d))))
  );
}

function isStationFeature(f: unknown): f is StationFeature {
  if (!f || typeof f !== "object") return false;
  const o = f as Record<string, unknown>;
  const g = o.geometry as { type?: unknown; coordinates?: unknown } | undefined;
  return (
    o.type === "Feature" &&
    g?.type === "Point" &&
    Array.isArray(g.coordinates) &&
    g.coordinates.length === 2 &&
    g.coordinates.every((c) => typeof c === "number" && Number.isFinite(c)) &&
    isStationProps(o.properties)
  );
}

/**
 * Validates untrusted JSON (the API response, or the seed file) and
 * returns a typed collection. Invalid features are dropped with a warning
 * rather than breaking the whole map; duplicate ids throw, since the URL
 * state (?station=) depends on ids being unique.
 */
export function parseStations(json: unknown): StationCollection {
  const fc = json as { type?: unknown; features?: unknown };
  if (fc?.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
    throw new Error("Station data is not a GeoJSON FeatureCollection");
  }
  const features: StationFeature[] = [];
  const seen = new Set<string>();
  for (const f of fc.features) {
    if (!isStationFeature(f)) {
      console.warn("Dropping invalid station feature", f);
      continue;
    }
    if (seen.has(f.properties.id)) {
      throw new Error(`Duplicate station id: ${f.properties.id}`);
    }
    seen.add(f.properties.id);
    features.push(f);
  }
  return { type: "FeatureCollection", features };
}

/** The single entry point the UI uses to load stations. */
export async function getStations(signal?: AbortSignal): Promise<StationCollection> {
  const res = await fetch(STATIONS_URL, { signal });
  if (!res.ok) throw new Error(`Failed to load stations (${res.status})`);
  return parseStations(await res.json());
}

/** Soonest date that is today or later, as an ISO string. */
export function nextUpcomingDate(dates: string[] | undefined, today: Date = new Date()): string | undefined {
  if (!dates?.length) return undefined;
  const t = today.toISOString().slice(0, 10);
  return [...dates].sort().find((d) => d >= t);
}
