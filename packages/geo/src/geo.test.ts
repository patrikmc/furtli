import { describe, expect, it } from "vitest";
import { CITY_PLZ, KREISE, PLZ } from "./data";
import {
  bandFor,
  bandLabel,
  circlePolygon,
  distanceMeters,
  distanceToArea,
  formatDistance,
  kreisForPoint,
  nearby,
  plzForPoint,
  resolveAnchor,
} from "./index";

const STAUFFACHER = { lng: 8.5287, lat: 47.3735 }; // Kreis 4, 8004
const HELVETIAPLATZ = { lng: 8.5256, lat: 47.3764 }; // Kreis 4, 8004
const IDAPLATZ = { lng: 8.522, lat: 47.3708 }; // Kreis 3, 8003
const OERLIKON = { lng: 8.5445, lat: 47.4105 }; // Kreis 11, 8050

describe("area data", () => {
  it("has 12 Kreise and the 24 city postcodes", () => {
    expect(KREISE.features).toHaveLength(12);
    expect(CITY_PLZ).toHaveLength(24);
    expect(CITY_PLZ).toContain("8004");
    expect(CITY_PLZ).toContain("8064");
  });
});

describe("point in area", () => {
  it("finds Kreis and postcode", () => {
    expect(kreisForPoint(STAUFFACHER.lng, STAUFFACHER.lat, KREISE)).toBe(4);
    expect(plzForPoint(STAUFFACHER.lng, STAUFFACHER.lat, PLZ)).toBe("8004");
    expect(kreisForPoint(OERLIKON.lng, OERLIKON.lat, KREISE)).toBe(11);
    expect(plzForPoint(OERLIKON.lng, OERLIKON.lat, PLZ)).toBe("8050");
  });
  it("returns null outside the city (Winterthur)", () => {
    expect(kreisForPoint(8.7241, 47.4988, KREISE)).toBeNull();
    expect(plzForPoint(8.7241, 47.4988, PLZ)).toBeNull();
  });
});

describe("distances", () => {
  it("measures point to point within a few metres of the geodesic value", () => {
    // Stauffacher → Helvetiaplatz ≈ 392 m (geodesic)
    expect(distanceMeters(STAUFFACHER, HELVETIAPLATZ)).toBeGreaterThan(385);
    expect(distanceMeters(STAUFFACHER, HELVETIAPLATZ)).toBeLessThan(400);
  });
  it("is 0 inside an area and positive outside", () => {
    const k4 = KREISE.features.find((f) => f.properties.kreis === 4)!;
    expect(distanceToArea(STAUFFACHER, k4)).toBe(0);
    const d = distanceToArea(IDAPLATZ, k4);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(600); // Idaplatz is close to the Kreis 3/4 border
    expect(distanceToArea(OERLIKON, k4)).toBeGreaterThan(2000);
  });
  it("draws a closed circle", () => {
    const c = circlePolygon(STAUFFACHER, 500, 16).coordinates[0];
    expect(c).toHaveLength(17);
    expect(c[0]).toEqual(c[16]);
    expect(distanceMeters(STAUFFACHER, { lng: c[4][0], lat: c[4][1] })).toBeCloseTo(500, 0);
  });
});

describe("nearby", () => {
  const stations = [
    { id: "stauffacher", ...STAUFFACHER },
    { id: "helvetiaplatz", ...HELVETIAPLATZ },
    { id: "idaplatz", ...IDAPLATZ },
    { id: "oerlikon", ...OERLIKON },
  ];

  it("point anchor, nearby mode: within the radius across Kreis borders, sorted", () => {
    const r = resolveAnchor({ type: "point", ...STAUFFACHER }, KREISE, PLZ)!;
    expect(r.kreis).toBe(4);
    expect(r.plz).toBe("8004");
    const res = nearby(stations, r, { mode: "nearby", radius: 1000 });
    expect(res.map((x) => x.item.id)).toEqual(["stauffacher", "helvetiaplatz", "idaplatz"]);
    expect(res.find((x) => x.item.id === "idaplatz")!.inArea).toBe(false); // Kreis 3
    expect(res[0].band).toBe(0);
  });

  it("point anchor, strict mode: only the point's Kreis", () => {
    const r = resolveAnchor({ type: "point", ...STAUFFACHER }, KREISE, PLZ)!;
    const res = nearby(stations, r, { mode: "strict", radius: 1000 });
    expect(res.map((x) => x.item.id)).toEqual(["stauffacher", "helvetiaplatz"]);
  });

  it("Kreis anchor: inside first (distance 0), neighbours by distance to the border", () => {
    const r = resolveAnchor({ type: "kreis", kreis: 4 }, KREISE, PLZ)!;
    const res = nearby(stations, r, { mode: "nearby", radius: 1000 });
    expect(res.map((x) => x.item.id)).toEqual(["stauffacher", "helvetiaplatz", "idaplatz"]);
    expect(res[0].band).toBe(-1);
    expect(res[2].distance).toBeGreaterThan(0);
    expect(nearby(stations, r, { mode: "strict", radius: 1000 })).toHaveLength(2);
  });

  it("postcode anchor filters by the postcode outline", () => {
    const r = resolveAnchor({ type: "plz", plz: "8050" }, KREISE, PLZ)!;
    expect(nearby(stations, r, { mode: "strict", radius: 0 }).map((x) => x.item.id)).toEqual(["oerlikon"]);
    expect(resolveAnchor({ type: "plz", plz: "9999" }, KREISE, PLZ)).toBeNull();
  });
});

describe("labels", () => {
  it("bands and formatting", () => {
    expect(bandFor(0, true)).toBe(-1);
    expect(bandFor(0, false)).toBe(0);
    expect(bandFor(450, false)).toBe(1);
    expect(bandFor(9000, false)).toBe(5);
    expect(bandLabel(-1, "Kreis 4")).toBe("In Kreis 4");
    expect(bandLabel(0, null)).toBe("bis 300 m");
    expect(bandLabel(1, null)).toBe("300–600 m");
    expect(bandLabel(2, null)).toBe("600 m – 1 km");
    expect(bandLabel(3, null)).toBe("1–2 km");
    expect(bandLabel(1, "Kreis 4")).toBe("300–600 m ausserhalb");
    expect(bandLabel(5, null)).toBe("über 5 km");
    expect(formatDistance(183)).toBe("180 m");
    expect(formatDistance(1234)).toBe("1,2 km");
  });
});
