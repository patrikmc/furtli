import type { Anchor, NearbyMode, ResolvedAnchor } from "geo";
import type { Lang } from "@/lib/i18n/lang";
import { ui } from "@/lib/i18n/ui";
import { parseKreisParam } from "./kreis";

export const RADII = [500, 1000, 2000] as const;
export type Radius = (typeof RADII)[number];
export const DEFAULT_RADIUS: Radius = 1000;

export interface SearchState {
  anchor: Anchor | null;
  mode: NearbyMode;
  radius: Radius;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * URL ↔ search state, so any view can be shared or bookmarked:
 *   /?at=47.37350,8.52870        a point (tapped or dragged pin)
 *   /?plz=8004                   a postcode
 *   /?kreis=4                    a Kreis
 *   (&scope=area from older links is ignored: the "only this area" toggle is gone)
 *   &r=500|1000|2000             radius for "nearby" (default 1000 m)
 * GPS positions are never written to the URL (privacy): a shared link only
 * contains a point the user deliberately picked on the map.
 */
export function parseSearchParams(sp: Params, cityPlz: readonly string[]): SearchState {
  const mode: NearbyMode = "nearby";
  const r = Number(one(sp.r));
  const radius = (RADII as readonly number[]).includes(r) ? (r as Radius) : DEFAULT_RADIUS;

  let anchor: Anchor | null = null;
  const at = /^(-?\d{1,2}\.\d{1,7}),(-?\d{1,3}\.\d{1,7})$/.exec(one(sp.at) ?? "");
  const plz = one(sp.plz);
  const kreis = parseKreisParam(sp.kreis);
  if (at) {
    const lat = Number(at[1]);
    const lng = Number(at[2]);
    if (lat > 47.2 && lat < 47.6 && lng > 8.3 && lng < 8.8) anchor = { type: "point", lng, lat, source: "map" };
  } else if (plz && cityPlz.includes(plz)) {
    anchor = { type: "plz", plz };
  } else if (kreis) {
    anchor = { type: "kreis", kreis };
  }
  return { anchor, mode, radius };
}

/** Writes the search state into URLSearchParams (keeps unrelated params). */
export function writeSearchParams(params: URLSearchParams, s: SearchState): URLSearchParams {
  for (const k of ["at", "plz", "kreis", "scope", "r"]) params.delete(k);
  const a = s.anchor;
  if (a?.type === "point" && a.source !== "gps") params.set("at", `${a.lat.toFixed(5)},${a.lng.toFixed(5)}`);
  if (a?.type === "plz") params.set("plz", a.plz);
  if (a?.type === "kreis") params.set("kreis", String(a.kreis));
  if (a && s.mode === "strict") params.set("scope", "area");
  if (a && s.radius !== DEFAULT_RADIUS) params.set("r", String(s.radius));
  return params;
}

/** "Dein Standort", "Gewählter Punkt", "Kreis 4", "PLZ 8004" (English: "Your location", "Postcode 8004", …). */
export function anchorTitle(a: Anchor, lang: Lang = "de"): string {
  const t = ui(lang).anchor;
  if (a.type === "point") return a.source === "gps" ? t.gps : t.map;
  return a.type === "kreis" ? t.kreis(a.kreis) : t.plz(a.plz);
}

/** Where a point lies: "Kreis 4 · 8004"; empty for area anchors. */
export function anchorSubtitle(r: ResolvedAnchor, lang: Lang = "de"): string {
  const t = ui(lang).anchor;
  if (r.anchor.type !== "point") return "";
  if (!r.kreis) return t.outsideCity;
  return [t.kreis(r.kreis), r.plz].filter(Boolean).join(" · ");
}

/** Name of the area "strict" mode filters by: "Kreis 4" or "PLZ 8004". */
export function strictAreaName(r: ResolvedAnchor, lang: Lang = "de"): string | null {
  const t = ui(lang).anchor;
  if (r.anchor.type === "plz") return t.plz(r.anchor.plz);
  return r.kreis ? t.kreis(r.kreis) : null;
}
