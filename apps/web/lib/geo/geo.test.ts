import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { kreisForPoint, parseKreisParam } from "./kreis";
import { getStations, nextUpcomingDate, parseStations } from "./stations";
import type { KreisCollection } from "./types";

const publicGeo = (f: string) => JSON.parse(readFileSync(join(__dirname, "../../public/geo", f), "utf8"));
const kreise = publicGeo("stadtkreise.geojson") as KreisCollection;
const seed = publicGeo("stations.seed.geojson");

describe("stadtkreise.geojson", () => {
  it("has all 12 Kreise, numbered 1–12, and stays small", () => {
    expect(kreise.features.map((f) => f.properties.kreis).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    const bytes = readFileSync(join(__dirname, "../../public/geo/stadtkreise.geojson")).length;
    expect(bytes).toBeLessThan(60_000);
  });
});

describe("kreisForPoint", () => {
  it("puts Stauffacher in Kreis 4", () => {
    expect(kreisForPoint(8.5287, 47.3735, kreise)).toBe(4);
  });
  it("puts Paradeplatz in Kreis 1 and Oerlikon in Kreis 11", () => {
    expect(kreisForPoint(8.5392, 47.3697, kreise)).toBe(1);
    expect(kreisForPoint(8.5445, 47.4105, kreise)).toBe(11);
  });
  it("returns null outside the city (Winterthur)", () => {
    expect(kreisForPoint(8.7241, 47.4988, kreise)).toBeNull();
  });
});

describe("stations seed", () => {
  const stations = parseStations(seed);

  it("parses all 10 placeholder stations", () => {
    expect(stations.features).toHaveLength(10);
    expect(stations.features.every((f) => f.properties.placeholder)).toBe(true);
  });

  it("every station's kreis matches the polygon it sits in", () => {
    for (const f of stations.features) {
      const [lng, lat] = f.geometry.coordinates;
      expect(kreisForPoint(lng, lat, kreise), f.properties.id).toBe(f.properties.kreis);
    }
  });
});

describe("parseStations", () => {
  const valid = seed.features[0];

  it("drops invalid features instead of failing the map", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = { ...valid, properties: { ...valid.properties, id: "x", kind: "nope" } };
    expect(parseStations({ type: "FeatureCollection", features: [valid, bad] }).features).toHaveLength(1);
  });

  it("rejects duplicate ids", () => {
    expect(() => parseStations({ type: "FeatureCollection", features: [valid, valid] })).toThrow(/Duplicate/);
  });

  it("rejects non-collections", () => {
    expect(() => parseStations({ foo: 1 })).toThrow();
  });
});

describe("getStations", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches and validates the seed file", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(seed)));
    vi.stubGlobal("fetch", fetchMock);
    const res = await getStations();
    expect(fetchMock).toHaveBeenCalledWith("/geo/stations.seed.geojson", expect.anything());
    expect(res.features[0].properties.id).toBe("mrh-stauffacher");
  });
});

describe("helpers", () => {
  it("parseKreisParam accepts 1–12 only", () => {
    expect(parseKreisParam("4")).toBe(4);
    expect(parseKreisParam("13")).toBeNull();
    expect(parseKreisParam("4.5")).toBeNull();
    expect(parseKreisParam(undefined)).toBeNull();
    expect(parseKreisParam(["4"])).toBeNull();
  });

  it("nextUpcomingDate skips past dates", () => {
    expect(nextUpcomingDate(["2026-10-06", "2026-10-02"], new Date("2026-10-03T08:00:00Z"))).toBe("2026-10-06");
    expect(nextUpcomingDate(["2026-01-01"], new Date("2026-10-03"))).toBeUndefined();
  });
});
