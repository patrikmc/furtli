export { MAP_BOUNDS, ZH_BOUNDS, ZH_CENTER, inMapBounds, kreisForPoint, plzForPoint } from "geo";

/** Parses the ?kreis= search param; anything but an integer 1–12 is ignored. */
export function parseKreisParam(value: string | string[] | undefined): number | null {
  if (typeof value !== "string") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}
