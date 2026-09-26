import { z } from "zod";
import { kreisForPoint } from "geo";
import { KREISE } from "geo/data";
import type { StationKindValue } from "db";
import { IngestError, normalizePlz, parseStationName, slugify } from "./common";

export interface ParsedStation {
  id: string;
  kind: StationKindValue;
  name: string;
  address: string | null;
  plz: string;
  kreis: number | null;
  lng: number;
  lat: number;
  materials: string[] | null;
  hours: Record<string, string> | null;
  sourcePoiId: string;
  sourceName: string;
  /** Every name variant the city uses for this station (for calendar matching). */
  matchNames: string[];
}

const featureSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([z.number(), z.number()]).rest(z.number()),
  }),
  properties: z
    .object({
      poi_id: z.string().min(1),
      name: z.string().min(1),
      adresse: z.string().nullish(),
      zvv_label: z.string().nullish(),
      plz: z.union([z.string(), z.number()]).nullish(),
    })
    .passthrough(),
});

const layerSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.unknown()),
});

type Props = z.infer<typeof featureSchema>["properties"];

const DAYS = ["mo", "di", "mi", "do", "fr", "sa", "so"] as const;

/** "15.00;;;19.00" → "15:00–19:00"; "closed" / "n.a." / empty → undefined */
function timeRange(v: unknown): string | undefined {
  const m = /^(\d{1,2})[.:](\d{2});;;(\d{1,2})[.:](\d{2})$/.exec(String(v ?? "").trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}–${m[3].padStart(2, "0")}:${m[4]}` : undefined;
}

function weeklyHours(p: Props): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const d of DAYS) {
    const t = timeRange(p[`oeffnungszeiten_schalter_${d}`]);
    if (t) out[d] = t;
  }
  return Object.keys(out).length ? out : null;
}

const flag = (v: unknown) => String(v ?? "").trim().toLowerCase() === "x";

function stationFromFeature(kind: StationKindValue, f: z.infer<typeof featureSchema>): ParsedStation {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  if (!(lng > 8.3 && lng < 8.8 && lat > 47.2 && lat < 47.6)) {
    throw new IngestError(`${kind} ${p.poi_id}: coordinates outside Zürich (${lng}, ${lat})`);
  }
  const matchNames = [...new Set([p.name, p.adresse, p.zvv_label].filter((x): x is string => !!x?.trim()))];
  const base = {
    kind,
    plz: normalizePlz(p.plz),
    kreis: kreisForPoint(lng, lat, KREISE),
    lng: +lng.toFixed(6),
    lat: +lat.toFixed(6),
    sourcePoiId: p.poi_id,
    sourceName: p.name,
    matchNames,
    materials: null,
    hours: null,
  };

  switch (kind) {
    case "mrh":
    case "hazmat": {
      // MRH: "adresse" carries the same "<PLZ>, <Quartier>: <place>" string as the
      // calendar (the "name" is sometimes an older variant). Hazmat: "adresse" is
      // sometimes shortened, so use "name".
      const display = kind === "mrh" ? (p.adresse ?? p.name) : p.name;
      const n = parseStationName(display) ?? parseStationName(p.name);
      const area = n?.area ?? display;
      const place = n?.place ?? null;
      const placeShort = place?.replace(/\s*\(.*$/, "") ?? "";
      const note = kind === "hazmat" ? String(p.annahmezeit ?? "").trim() : "";
      return {
        ...base,
        id: `${kind}-${slugify(`${area} ${placeShort}`)}`,
        name: area,
        address: place,
        // MRH weekday hours in this layer are left over from the Cargo-Tram
        // and mostly "n.a."; the app shows the city-wide MRH hours instead.
        hours: note ? { note } : null,
      };
    }
    case "sammelstelle": {
      const materials = [
        flag(p.glas) && "glass",
        flag(p.metall) && "metal",
        flag(p.oel) && "oil",
        flag(p.textilien) && "textiles",
      ].filter((x): x is string => !!x);
      const sid = String(p.standort_id ?? p.poi_id);
      return {
        ...base,
        id: `sst-${slugify(sid)}`,
        name: (p.adresse ?? p.name).trim(),
        address: null,
        materials,
      };
    }
    case "recyclinghof": {
      const short = p.name.replace(/^Recyclinghof\s+/i, "").split(/\s+/)[0];
      return {
        ...base,
        id: `rh-${slugify(short)}`,
        name: p.name.trim(),
        address: p.adresse?.trim() || null,
        hours: weeklyHours(p),
      };
    }
  }
}

/** Parses one WFS layer. Invalid features fail the run: a missing stop is a user-visible bug. */
export function parseStations(kind: StationKindValue, body: unknown): ParsedStation[] {
  const layer = layerSchema.safeParse(body);
  if (!layer.success) throw new IngestError(`${kind}: layer is not a GeoJSON FeatureCollection`);
  const out: ParsedStation[] = [];
  const ids = new Map<string, number>();
  layer.data.features.forEach((raw, i) => {
    const f = featureSchema.safeParse(raw);
    if (!f.success) throw new IngestError(`${kind}: feature ${i + 1} is malformed`, f.error.issues.slice(0, 3));
    const s = stationFromFeature(kind, f.data);
    // Keep ids unique and deterministic if two stops share Quartier + place.
    const n = ids.get(s.id) ?? 0;
    ids.set(s.id, n + 1);
    if (n > 0) s.id = `${s.id}-${slugify(s.sourcePoiId)}`;
    out.push(s);
  });
  if (out.length === 0) throw new IngestError(`${kind}: layer is empty`);
  return out;
}
