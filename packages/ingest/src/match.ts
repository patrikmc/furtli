import type { StationKindValue } from "db";
import { normalizeName, parseStationName } from "./parse/common";
import type { ParsedStation } from "./parse/stations";

/**
 * Calendar station names that differ from the geo layer beyond spacing and
 * "str."-abbreviations. Key: name in the calendar; value: a name the station
 * has in the geo layer. Add an entry when the ingest reports an unmatched
 * station after checking on the map that it's the same place.
 */
export const STATION_ALIASES: Record<string, string> = {
  // Sonderabfallmobil (verified 26 Sep 2026)
  "8001, Neumarkt: Parkplatz am Hirschengraben 13 (vor kantonalem Obergericht)":
    "8001, Neumarkt: Parkplatz am Hirschengraben 13 (vor kt. Obergericht)",
  "8064, Werdhölzli: Recyclinghof": "8064, Werdhölzli: Recyclinghof (13 bis 19 Uhr)",
  "8044, Fluntern: Kirche Fluntern / Kreuzung Zürichbergstrasse (Wertstoff-Sammelstelle)":
    "8044, Fluntern: Kirche Fluntern/Zürichbergstr. (Wertstoff-Sammelst.)",
  // The calendar says 801, the geo layer 501; same stop behind the Seebach tram stop.
  "8052, Seebach: Schaffhauserstrasse 801 (Parkplatz hinter Tramhaltestelle Seebach)":
    "8052, Seebach: Schaffhauserstr. 501 (Parkplatz hinter Tramhaltestelle)",
};

export type MatchTier = "exact" | "normalized" | "plz+place" | "alias";

export interface StationMatcher {
  match(calendarName: string): { station: ParsedStation; tier: MatchTier } | null;
}

/**
 * Matches calendar station names to geo stations of one kind, in order:
 *  1. exact name (any of name / adresse / zvv_label)
 *  2. normalised name (spacing, "str." → "strasse")
 *  3. station postcode + place, ignoring the Quartier (the city labels
 *     "Schule Hürstholz" as Seebach in one file and Affoltern in the other)
 *  4. the alias table above
 */
export function buildMatcher(kind: StationKindValue, stations: ParsedStation[]): StationMatcher {
  const exact = new Map<string, ParsedStation>();
  const normalized = new Map<string, ParsedStation>();
  const plzPlace = new Map<string, ParsedStation | null>();
  for (const s of stations) {
    if (s.kind !== kind) continue;
    for (const n of s.matchNames) {
      exact.set(n.trim(), s);
      normalized.set(normalizeName(n), s);
      const p = parseStationName(n);
      if (p) {
        const key = `${p.plz}|${normalizeName(p.place)}`;
        // Ambiguous keys (two stations, same postcode + place) are unusable.
        plzPlace.set(key, plzPlace.has(key) && plzPlace.get(key) !== s ? null : s);
      }
    }
  }

  const direct = (name: string): { station: ParsedStation; tier: MatchTier } | null => {
    const e = exact.get(name.trim());
    if (e) return { station: e, tier: "exact" };
    const n = normalized.get(normalizeName(name));
    if (n) return { station: n, tier: "normalized" };
    const p = parseStationName(name);
    const pp = p && plzPlace.get(`${p.plz}|${normalizeName(p.place)}`);
    if (pp) return { station: pp, tier: "plz+place" };
    return null;
  };

  return {
    match(name) {
      const d = direct(name);
      if (d) return d;
      const alias = STATION_ALIASES[name.trim()];
      const a = alias ? direct(alias) : null;
      return a ? { station: a.station, tier: "alias" } : null;
    },
  };
}
