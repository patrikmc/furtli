/** Thrown for problems that must stop the run (schema changes, unmatched stations). */
export class IngestError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "IngestError";
  }
}

/** URL-safe, readable id fragment: "Höngg: Tramschleife Wartau" → "hoengg-tramschleife-wartau". */
export function slugify(s: string, max = 60): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** "8001.0" → "8001"; throws on anything that isn't a 4-digit postcode. */
export function normalizePlz(v: unknown): string {
  const s = String(v ?? "").trim();
  const m = /^(\d{4})(?:\.0+)?$/.exec(s);
  if (!m) throw new IngestError(`Invalid postcode: ${JSON.stringify(v)}`);
  return m[1];
}

export interface StationName {
  /** Postcode of the station itself, e.g. "8004" */
  plz: string;
  /** Quartier, e.g. "Stauffacher" */
  area: string;
  /** Place, e.g. "St. Jakobstrasse 29" */
  place: string;
}

/**
 * The city writes station names as "<PLZ>, <Quartier>: <place>", e.g.
 * "8004, Stauffacher: St. Jakobstrasse 29". One entry uses a comma instead
 * of the colon ("8038, Wollishofen, Schule Hans Asper"). Returns null for
 * anything else.
 */
export function parseStationName(raw: string): StationName | null {
  const s = raw.trim();
  const m = /^(\d{4}),\s*([^:]+?)\s*:\s*(.+)$/.exec(s) ?? /^(\d{4}),\s*([^,]+?)\s*,\s*(.+)$/.exec(s);
  return m ? { plz: m[1], area: m[2].trim(), place: m[3].trim() } : null;
}

/**
 * Normalised form for matching names across the city's calendar and geo
 * data, which differ in spacing and abbreviations:
 *   "Hardau / Letzigrund" = "Hardau/Letzigrund"
 *   "Leimbachstr. 160 / Klebestr." = "Leimbachstrasse 160/Klebestrasse"
 *   "(Zehntenhausplatz )" = "(Zehntenhausplatz)"
 */
export function normalizeName(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/str\./g, "strasse ")
    .replace(/\s*([/,:()])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
