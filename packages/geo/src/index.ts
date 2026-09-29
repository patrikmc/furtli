import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";

/**
 * Areas (Stadtkreise, postcodes) and proximity maths for the recycling map.
 * Pure functions, no I/O: used by the ingest (to assign a Kreis to each
 * station) and by the web app (to answer "what's near this point / Kreis /
 * postcode?" instantly in the browser).
 *
 * Distances use a local equirectangular projection around Zürich. Over
 * city-scale distances (< 15 km) the error is far below a metre, which is
 * plenty for "300 m vs 600 m away".
 */

export interface KreisProps {
  kreis: number;
  name: string;
}
export interface PlzProps {
  plz: string;
  name: string;
}
export type AreaGeometry = Polygon | MultiPolygon;
export type KreisFeature = Feature<AreaGeometry, KreisProps>;
export type PlzFeature = Feature<AreaGeometry, PlzProps>;
export type KreisCollection = FeatureCollection<AreaGeometry, KreisProps>;
export type PlzCollection = FeatureCollection<AreaGeometry, PlzProps>;

export type LngLat = { lng: number; lat: number };

/** Rough bounding box of the city, [west, south, east, north]. */
export const ZH_BOUNDS: [number, number, number, number] = [8.44, 47.315, 8.63, 47.44];
export const ZH_CENTER = { longitude: 8.5417, latitude: 47.3769 };

/**
 * How far the map can be panned, [west, south, east, north]: the city plus
 * the surrounding towns with curated recycling sites (Spreitenbach in the
 * west, Wädenswil in the south, Wallisellen in the east, Dällikon in the
 * north), with some margin. The swisstopo base map covers all of
 * Switzerland, so this is a product choice, not a technical limit; widen it
 * when adding sites further out (a test checks every station lies inside).
 */
export const MAP_BOUNDS: [number, number, number, number] = [8.3, 47.18, 8.72, 47.6];

/** True if the point lies within MAP_BOUNDS. */
export function inMapBounds(lng: number, lat: number): boolean {
  const [w, s, e, n] = MAP_BOUNDS;
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

// ---------------------------------------------------------------------------
// Point-in-area
// ---------------------------------------------------------------------------

/** Returns the Stadtkreis (1–12) containing the point, or null outside the city. */
export function kreisForPoint(lng: number, lat: number, kreise: KreisCollection): number | null {
  const pt: [number, number] = [lng, lat];
  for (const f of kreise.features) if (booleanPointInPolygon(pt, f)) return f.properties.kreis;
  return null;
}

/** Returns the city postcode containing the point, or null. */
export function plzForPoint(lng: number, lat: number, plz: PlzCollection): string | null {
  const pt: [number, number] = [lng, lat];
  for (const f of plz.features) if (booleanPointInPolygon(pt, f)) return f.properties.plz;
  return null;
}

// ---------------------------------------------------------------------------
// Distances (metres)
// ---------------------------------------------------------------------------

const R = 6_371_008.8;
const LAT0 = (47.3769 * Math.PI) / 180;
const KX = (Math.PI / 180) * R * Math.cos(LAT0);
const KY = (Math.PI / 180) * R;

function toXY([lng, lat]: Position): [number, number] {
  return [lng * KX, lat * KY];
}

/** Straight-line distance between two points, in metres. */
export function distanceMeters(a: LngLat, b: LngLat): number {
  return Math.hypot((a.lng - b.lng) * KX, (a.lat - b.lat) * KY);
}

function pointSegmentDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function rings(g: AreaGeometry): Position[][] {
  return g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
}

/** Distance from a point to an area in metres: 0 inside, else to the nearest edge. */
export function distanceToArea(p: LngLat, area: Feature<AreaGeometry>): number {
  if (booleanPointInPolygon([p.lng, p.lat], area)) return 0;
  const xy = toXY([p.lng, p.lat]);
  let best = Infinity;
  for (const ring of rings(area.geometry)) {
    for (let i = 1; i < ring.length; i++) {
      const d = pointSegmentDistance(xy, toXY(ring[i - 1]), toXY(ring[i]));
      if (d < best) best = d;
    }
  }
  return best;
}

/** Bounding box [w, s, e, n] of an area, for framing it on the map. */
export function areaBounds(area: Feature<AreaGeometry>): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const ring of rings(area.geometry))
    for (const [x, y] of ring) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  return [w, s, e, n];
}

/** A circle as a polygon (for drawing the search radius on the map). */
export function circlePolygon(center: LngLat, radiusM: number, steps = 64): Polygon {
  const ring: Position[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([center.lng + (radiusM * Math.cos(a)) / KX, center.lat + (radiusM * Math.sin(a)) / KY]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

// ---------------------------------------------------------------------------
// Anchors and "nearby"
// ---------------------------------------------------------------------------

/** Where the user is looking from: a point (tap, pin or GPS), a Kreis or a postcode. */
export type Anchor =
  | { type: "point"; lng: number; lat: number; source?: "map" | "gps" }
  | { type: "kreis"; kreis: number }
  | { type: "plz"; plz: string };

/** "nearby": everything within the radius (default). "strict": only inside the Kreis/postcode. */
export type NearbyMode = "nearby" | "strict";

export interface ResolvedAnchor {
  anchor: Anchor;
  /** Kreis of the anchor (for a point: the Kreis it lies in). */
  kreis: number | null;
  /** Postcode of the anchor (for a point: the postcode it lies in). */
  plz: string | null;
  /** The area distances are measured from (null for a point anchor). */
  area: Feature<AreaGeometry> | null;
  /** The area "strict" mode filters by: the Kreis for points and Kreise, the postcode for postcodes. */
  strictArea: Feature<AreaGeometry> | null;
}

export function resolveAnchor(anchor: Anchor, kreise: KreisCollection, plz: PlzCollection): ResolvedAnchor | null {
  if (anchor.type === "point") {
    const k = kreisForPoint(anchor.lng, anchor.lat, kreise);
    return {
      anchor,
      kreis: k,
      plz: plzForPoint(anchor.lng, anchor.lat, plz),
      area: null,
      strictArea: kreise.features.find((f) => f.properties.kreis === k) ?? null,
    };
  }
  if (anchor.type === "kreis") {
    const f = kreise.features.find((x) => x.properties.kreis === anchor.kreis);
    return f ? { anchor, kreis: anchor.kreis, plz: null, area: f, strictArea: f } : null;
  }
  const f = plz.features.find((x) => x.properties.plz === anchor.plz);
  return f ? { anchor, kreis: null, plz: anchor.plz, area: f, strictArea: f } : null;
}

/** Distance bands for grouping results (upper bounds in metres). */
export const DISTANCE_BANDS = [300, 600, 1000, 2000, 5000] as const;

export interface NearbyItem<T> {
  item: T;
  /** Metres from the point, or from the area's edge (0 = inside the area). */
  distance: number;
  /** Inside the anchor's Kreis (point/Kreis anchors) or postcode (postcode anchors). */
  inArea: boolean;
  /** Index into DISTANCE_BANDS; -1 = "inside the area" (area anchors only). */
  band: number;
}

export interface NearbyOptions {
  mode: NearbyMode;
  radius: number;
}

/**
 * Stations (or anything with lng/lat) near an anchor, sorted by distance.
 * Nearby mode: within `radius` of the point, or of the area's edge.
 * Strict mode: only inside the anchor's Kreis (or postcode), any distance.
 */
export function nearby<T extends LngLat>(
  items: readonly T[],
  resolved: ResolvedAnchor,
  { mode, radius }: NearbyOptions,
): NearbyItem<T>[] {
  const { anchor, area, strictArea } = resolved;
  const out: NearbyItem<T>[] = [];
  for (const item of items) {
    const inArea = strictArea ? booleanPointInPolygon([item.lng, item.lat], strictArea) : false;
    const distance = anchor.type === "point" ? distanceMeters(anchor, item) : distanceToArea(item, area!);
    if (mode === "strict" ? !inArea : distance > radius) continue;
    out.push({ item, distance, inArea, band: bandFor(distance, anchor.type !== "point") });
  }
  return out.sort((a, b) => a.distance - b.distance);
}

export function bandFor(distance: number, isArea: boolean): number {
  if (isArea && distance === 0) return -1;
  const i = DISTANCE_BANDS.findIndex((b) => distance <= b);
  return i === -1 ? DISTANCE_BANDS.length : i;
}

/** Band words per language (the web app passes its site language). */
const BAND_WORDS = {
  de: { in: "In", thisArea: "diesem Gebiet", outside: " ausserhalb", upTo: "bis", over: "über" },
  en: { in: "In", thisArea: "this area", outside: " outside", upTo: "up to", over: "over" },
} as const;

/** "bis 300 m", "300–600 m", "1–2 km", or for area anchors "bis 300 m ausserhalb" (English: "up to 300 m", …). */
export function bandLabel(band: number, areaName: string | null, lang: "de" | "en" = "de"): string {
  const w = BAND_WORDS[lang];
  if (band === -1) return `${w.in} ${areaName ?? w.thisArea}`;
  const fmt = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);
  const hi = DISTANCE_BANDS[band];
  const lo = band === 0 ? 0 : DISTANCE_BANDS[band - 1];
  const suffix = areaName ? w.outside : "";
  if (hi === undefined) return `${w.over} ${fmt(lo)}${suffix}`;
  if (lo === 0) return `${w.upTo} ${fmt(hi)}${suffix}`;
  const unit = hi >= 1000 && lo >= 1000 ? " km" : hi >= 1000 ? "" : " m";
  return unit === ""
    ? `${fmt(lo)} – ${fmt(hi)}${suffix}`
    : `${lo >= 1000 ? lo / 1000 : lo}–${hi >= 1000 ? hi / 1000 : hi}${unit}${suffix}`;
}

/** "180 m", "1,2 km" (German decimal comma) / "1.2 km". */
export function formatDistance(m: number, lang: "de" | "en" = "de"): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  const km = (m / 1000).toFixed(1);
  return `${lang === "de" ? km.replace(".", ",") : km} km`;
}
