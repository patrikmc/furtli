import { afterEach, describe, expect, it, vi } from "vitest";
import { KREISE, PLZ, CITY_PLZ } from "geo/data";
import { kreisForPoint, nearby, resolveAnchor } from "geo";
import seed from "./data/stations.seed.json";
import { anchorSubtitle, anchorTitle, parseSearchParams, writeSearchParams } from "./anchor";
import { groupDates, groupPlaces, toPoints } from "./group";
import { timeWindow } from "./kinds";
import { getStations, nextUpcomingDate, parseStations } from "./stations";

describe("stations seed (used without a database)", () => {
  const stations = parseStations(seed);

  it("parses all 10 placeholder stations", () => {
    expect(stations.features).toHaveLength(10);
    expect(stations.features.every((f) => f.properties.placeholder)).toBe(true);
  });

  it("every station's kreis matches the polygon it sits in", () => {
    for (const f of stations.features) {
      const [lng, lat] = f.geometry.coordinates;
      expect(kreisForPoint(lng, lat, KREISE), f.properties.id).toBe(f.properties.kreis);
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

  it("accepts the Recyclinghof kind and API extras", () => {
    const rh = { ...valid, properties: { ...valid.properties, id: "rh-x", kind: "recyclinghof", hours: { mo: "13:00–19:00" } } };
    expect(parseStations({ type: "FeatureCollection", features: [rh] }).features).toHaveLength(1);
  });

  it("rejects duplicate ids and non-collections", () => {
    expect(() => parseStations({ type: "FeatureCollection", features: [valid, valid] })).toThrow(/Duplicate/);
    expect(() => parseStations({ foo: 1 })).toThrow();
  });
});

describe("getStations", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches /api/stations and validates the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(seed)));
    vi.stubGlobal("fetch", fetchMock);
    const res = await getStations();
    expect(fetchMock).toHaveBeenCalledWith("/api/stations", expect.anything());
    expect(res.features[0].properties.id).toBe("mrh-stauffacher");
  });
});

describe("URL search state", () => {
  it("parses a picked point, radius and scope", () => {
    expect(parseSearchParams({ at: "47.37350,8.52870", r: "500", scope: "area" }, CITY_PLZ)).toEqual({
      anchor: { type: "point", lat: 47.3735, lng: 8.5287, source: "map" },
      mode: "strict",
      radius: 500,
    });
  });

  it("parses postcode and Kreis anchors; nearby and 1 km by default", () => {
    expect(parseSearchParams({ plz: "8004" }, CITY_PLZ)).toEqual({
      anchor: { type: "plz", plz: "8004" },
      mode: "nearby",
      radius: 1000,
    });
    expect(parseSearchParams({ kreis: "4" }, CITY_PLZ).anchor).toEqual({ type: "kreis", kreis: 4 });
  });

  it("ignores junk: unknown postcodes, points outside Zürich, odd radii", () => {
    expect(parseSearchParams({ plz: "3000" }, CITY_PLZ).anchor).toBeNull();
    expect(parseSearchParams({ at: "46.2,6.1" }, CITY_PLZ).anchor).toBeNull();
    expect(parseSearchParams({ at: "47.37,8.52", r: "123" }, CITY_PLZ).radius).toBe(1000);
  });

  it("writes state back, and never writes a GPS position into the URL", () => {
    const p = writeSearchParams(new URLSearchParams("station=x"), {
      anchor: { type: "point", lat: 47.373501234, lng: 8.52871, source: "map" },
      mode: "nearby",
      radius: 2000,
    });
    expect(p.toString()).toBe("station=x&at=47.37350%2C8.52871&r=2000");
    const gps = writeSearchParams(new URLSearchParams(), {
      anchor: { type: "point", lat: 47.37, lng: 8.52, source: "gps" },
      mode: "nearby",
      radius: 1000,
    });
    expect(gps.toString()).toBe("");
  });

  it("titles anchors", () => {
    expect(anchorTitle({ type: "point", lat: 47.37, lng: 8.52, source: "gps" })).toBe("Dein Standort");
    expect(anchorTitle({ type: "point", lat: 47.37, lng: 8.52, source: "map" })).toBe("Gewählter Punkt");
    expect(anchorTitle({ type: "plz", plz: "8004" })).toBe("PLZ 8004");
    const r = resolveAnchor({ type: "point", lat: 47.3735, lng: 8.5287 }, KREISE, PLZ)!;
    expect(anchorSubtitle(r)).toBe("Kreis 4 · 8004");
  });
});

describe("grouping by distance", () => {
  const stations = parseStations(seed);
  const r = resolveAnchor({ type: "point", lat: 47.3735, lng: 8.5287 }, KREISE, PLZ)!; // Stauffacher
  const results = nearby(toPoints(stations.features), r, { mode: "nearby", radius: 2000 });

  it("groups places by band, nearest first", () => {
    const groups = groupPlaces(results);
    expect(groups[0].band).toBe(0);
    expect(groups[0].items[0].item.f.properties.id).toBe("mrh-stauffacher");
    const bands = groups.map((g) => g.band);
    expect(bands).toEqual([...bands].sort((a, b) => a - b));
  });

  it("groups upcoming dates by band, soonest first, skipping past dates", () => {
    const groups = groupDates(results, "2026-10-03");
    const all = groups.flatMap((g) => g.items);
    expect(all.every((d) => d.date >= "2026-10-03")).toBe(true);
    expect(all.find((d) => d.date === "2026-10-02")).toBeUndefined(); // Stauffacher's first date has passed
    for (const g of groups) {
      const dates = g.items.map((i) => i.date);
      expect(dates).toEqual([...dates].sort());
    }
  });
});

describe("helpers", () => {
  it("nextUpcomingDate skips past dates", () => {
    expect(nextUpcomingDate(["2026-10-06", "2026-10-02"], new Date("2026-10-03T08:00:00Z"))).toBe("2026-10-06");
    expect(nextUpcomingDate(["2026-01-01"], new Date("2026-10-03"))).toBeUndefined();
  });

  it("time windows: MRH city-wide hours by weekday, hazmat from the station", () => {
    expect(timeWindow("mrh", null, "2026-10-02")).toBe("15–19 Uhr"); // Friday
    expect(timeWindow("mrh", null, "2026-10-03")).toBe("10–14 Uhr"); // Saturday
    expect(timeWindow("hazmat", { note: "8 bis 11.30 Uhr" }, "2026-10-10")).toBe("8 bis 11.30 Uhr");
    expect(timeWindow("sammelstelle", null, "2026-10-10")).toBeNull();
  });
});
