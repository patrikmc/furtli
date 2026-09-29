import { describe, expect, it, vi } from "vitest";
import { KREISE, PLZ } from "geo/data";
import { MAP_BOUNDS, inMapBounds, kreisForPoint, nearby, plzForPoint, resolveAnchor } from "geo";
import seed from "./data/stations.seed.json";
import raw from "./data/stations.curated.json";
import { CURATED_STATIONS, withCurated } from "./curated";
import { toPoints } from "./group";
import { parseStations } from "./stations";
import { MATERIALS, type StationCollection } from "./types";
import { UI_TEXT } from "@/lib/i18n/ui";

const DAYS = ["mo", "di", "mi", "do", "fr", "sa", "so"];

describe("curated sites (private operators, neighbouring towns)", () => {
  const parsed = parseStations(raw);

  it("every entry passes validation (none silently dropped)", () => {
    expect(parsed.features).toHaveLength(raw.features.length);
    expect(parsed.features.length).toBeGreaterThanOrEqual(9);
  });

  it("ids are prefixed and don't clash with the seed", () => {
    const seedIds = new Set(seed.features.map((f) => f.properties.id));
    for (const f of parsed.features) {
      expect(f.properties.id).toMatch(/^site-[a-z0-9-]+$/);
      expect(seedIds.has(f.properties.id)).toBe(false);
    }
  });

  it("every site lies inside the pannable map area", () => {
    for (const f of parsed.features) {
      const [lng, lat] = f.geometry.coordinates;
      expect(inMapBounds(lng, lat), `${f.properties.id} outside MAP_BOUNDS ${MAP_BOUNDS}`).toBe(true);
    }
  });

  it("kreis matches the polygon (0 outside the city); city sites have the matching postcode", () => {
    for (const f of parsed.features) {
      const [lng, lat] = f.geometry.coordinates;
      const p = f.properties;
      expect(kreisForPoint(lng, lat, KREISE) ?? 0, p.id).toBe(p.kreis);
      if (p.kreis) expect(plzForPoint(lng, lat, PLZ), p.id).toBe(p.plz);
      else expect(p.place, `${p.id} needs a town name`).toBeTruthy();
    }
  });

  it("each site has hours, a website, a check date and known material keys", () => {
    for (const f of parsed.features) {
      const p = f.properties;
      expect(p.website, p.id).toMatch(/^https:\/\//);
      expect(p.verified, p.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Object.keys(p.hours ?? {}).length, p.id).toBeGreaterThan(0);
      for (const d of Object.keys(p.hours ?? {})) expect(DAYS, `${p.id} day ${d}`).toContain(d);
      for (const m of p.materials ?? []) {
        expect(UI_TEXT.de.materials[m], `${p.id}: no German label for ${m}`).toBeTruthy();
        expect(UI_TEXT.en.materials[m], `${p.id}: no English label for ${m}`).toBeTruthy();
      }
    }
  });

  it("the filterable materials all have labels", () => {
    for (const m of MATERIALS) expect(UI_TEXT.en.materials[m]).toBeTruthy();
  });

  it("withCurated appends the sites and the result still parses (no duplicate ids)", () => {
    const merged = withCurated(seed as unknown as StationCollection);
    expect(merged.features).toHaveLength(seed.features.length + CURATED_STATIONS.features.length);
    expect(() => parseStations(merged)).not.toThrow();
  });

  it("rejects a non-https website", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = structuredClone(raw.features[0]) as unknown as { properties: { website: string } };
    bad.properties.website = "javascript:alert(1)";
    expect(parseStations({ type: "FeatureCollection", features: [bad] }).features).toHaveLength(0);
  });

  it("border postcodes find neighbouring towns' sites: 8041 Leimbach reaches Adliswil within 2 km", () => {
    const r = resolveAnchor({ type: "plz", plz: "8041" }, KREISE, PLZ)!;
    const hits = nearby(toPoints(parsed.features), r, { mode: "nearby", radius: 2000 });
    expect(hits.map((h) => h.item.f.properties.id)).toContain("site-entsorgungspark-adliswil");
  });
});
