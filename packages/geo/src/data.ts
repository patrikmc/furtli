import kreiseJson from "../data/stadtkreise.json";
import plzJson from "../data/plz.json";
import type { KreisCollection, PlzCollection } from "./index";

/**
 * The area outlines, bundled. Server code and tests import this directly;
 * the browser loads it lazily (`import("geo/data")`) so the ~110 KB of
 * outlines stay out of the main bundle.
 *
 * Sources: Stadtkreise from Open Data Zürich (CC0); postcodes from swisstopo's
 * official postcode directory (Amtliches Ortschaftenverzeichnis, open data),
 * city part only. Both simplified to ~4 m.
 */
export const KREISE = kreiseJson as unknown as KreisCollection;
export const PLZ = plzJson as unknown as PlzCollection;
export const CITY_PLZ: readonly string[] = PLZ.features.map((f) => f.properties.plz).sort();
