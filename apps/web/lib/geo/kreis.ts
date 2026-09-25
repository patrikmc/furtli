import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { KreisCollection } from "./types";

/** Rough bounding box of the city of Zürich, [west, south, east, north]. */
export const ZH_BOUNDS: [number, number, number, number] = [8.44, 47.315, 8.63, 47.44];
export const ZH_CENTER = { longitude: 8.5417, latitude: 47.3769 };

/** Returns the Stadtkreis (1–12) containing the point, or null outside the city. */
export function kreisForPoint(lng: number, lat: number, kreise: KreisCollection): number | null {
  const pt: [number, number] = [lng, lat];
  for (const f of kreise.features) {
    if (booleanPointInPolygon(pt, f)) return f.properties.kreis;
  }
  return null;
}

/** Parses the ?kreis= search param; anything but an integer 1–12 is ignored. */
export function parseKreisParam(value: string | string[] | undefined): number | null {
  if (typeof value !== "string") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}
