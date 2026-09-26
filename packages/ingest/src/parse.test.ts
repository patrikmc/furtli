import { describe, expect, it } from "vitest";
import { buildMatcher } from "./match";
import { parseCalendar } from "./parse/calendar";
import { IngestError, normalizeName, normalizePlz, parseStationName, slugify } from "./parse/common";
import { parseStations } from "./parse/stations";
import { CALENDARS } from "./sources";
import { loadFixtures } from "./test/fixture-fetcher";

const fx = loadFixtures();
const cal = (dataset: string) => CALENDARS.find((c) => c.dataset === `entsorgungskalender_${dataset}`)!;

describe("helpers", () => {
  it("normalizes postcodes, including the Sammelstellen CSV's float format", () => {
    expect(normalizePlz("8004")).toBe("8004");
    expect(normalizePlz("8001.0")).toBe("8001");
    expect(normalizePlz(8050)).toBe("8050");
    expect(() => normalizePlz("80O4")).toThrow(IngestError);
  });

  it("parses the city's station names, including the comma variant", () => {
    expect(parseStationName("8004, Stauffacher: St. Jakobstrasse 29")).toEqual({
      plz: "8004",
      area: "Stauffacher",
      place: "St. Jakobstrasse 29",
    });
    expect(parseStationName("8038, Wollishofen, Schule Hans Asper")).toEqual({
      plz: "8038",
      area: "Wollishofen",
      place: "Schule Hans Asper",
    });
    expect(parseStationName("Schwamendingerplatz")).toBeNull();
  });

  it("normalizes names across spacing and abbreviations", () => {
    expect(normalizeName("8004, Hardau / Letzigrund: Bullingerstrasse 58")).toBe(
      normalizeName("8004, Hardau/Letzigrund: Bullingerstrasse 58"),
    );
    expect(normalizeName("Leimbachstr. 160 / Klebestr.")).toBe(normalizeName("Leimbachstrasse 160/Klebestrasse"));
    expect(normalizeName("(Zehntenhausplatz )")).toBe("(zehntenhausplatz)");
  });

  it("slugifies German names", () => {
    expect(slugify("Höngg Tramschleife Wartau")).toBe("hoengg-tramschleife-wartau");
    expect(slugify("Looächer")).toBe("looaecher");
  });
});

describe("parseCalendar", () => {
  it("parses a kerbside calendar", () => {
    const rows = parseCalendar(cal("papier"), 2026, fx.calendars.papier);
    expect(rows).toHaveLength(26);
    expect(rows[0]).toEqual({ plz: "8004", date: expect.stringMatching(/^2026-\d\d-\d\d$/) });
  });

  it("keeps the station for station calendars", () => {
    const rows = parseCalendar(cal("mobiler_recyclinghof"), 2026, fx.calendars.mobiler_recyclinghof);
    expect(rows).toHaveLength(36);
    expect(rows.every((r) => r.station && r.station.length > 5)).toBe(true);
  });

  it("fails loudly on a changed header", () => {
    const t = { fields: ["_id", "PLZ", "Datum"], records: [] };
    expect(() => parseCalendar(cal("papier"), 2026, t)).toThrow(/columns changed.*missing: Abholdatum.*new: Datum/);
  });

  it("rejects dates outside the file's year and impossible dates", () => {
    const bad = (d: string) => ({ fields: ["_id", "PLZ", "Abholdatum"], records: [{ PLZ: "8004", Abholdatum: d }] });
    expect(() => parseCalendar(cal("papier"), 2026, bad("2025-12-31"))).toThrow(/outside the file's year/);
    expect(() => parseCalendar(cal("papier"), 2026, bad("2026-02-30"))).toThrow(/Invalid date/);
    expect(() => parseCalendar(cal("papier"), 2026, bad("30.01.2026"))).toThrow(/Invalid date/);
  });

  it("drops exact duplicate rows", () => {
    const r = { PLZ: "8004", Abholdatum: "2026-01-07" };
    expect(parseCalendar(cal("papier"), 2026, { fields: ["PLZ", "Abholdatum"], records: [r, r] })).toHaveLength(1);
  });
});

describe("parseStations", () => {
  const mrh = parseStations("mrh", fx.geo.mrh);
  const hazmat = parseStations("hazmat", fx.geo.sonderabfall);
  const sst = parseStations("sammelstelle", fx.geo.sammelstelle);
  const rh = parseStations("recyclinghof", fx.geo.recyclinghof);

  it("parses every layer with unique ids", () => {
    expect([mrh.length, hazmat.length, sst.length, rh.length]).toEqual([37, 23, 20, 2]);
    const ids = [...mrh, ...hazmat, ...sst, ...rh].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds readable MRH stations with Kreis", () => {
    const s = mrh.find((x) => x.sourceName.includes("Stauffacher"))!;
    expect(s).toMatchObject({
      id: "mrh-stauffacher-st-jakobstrasse-29",
      name: "Stauffacher",
      address: "St. Jakobstrasse 29",
      plz: "8004",
      kreis: 4,
    });
  });

  it("keeps hazmat acceptance times and Sammelstelle materials", () => {
    expect(hazmat.find((x) => x.name === "Schwamendingen")!.hours).toEqual({ note: "8 bis 11.30 Uhr" });
    const erismann = sst.find((x) => x.name === "Erismannstrasse 31")!;
    expect(erismann.materials).toEqual(["glass", "metal", "oil", "textiles"]);
    expect(erismann.id).toBe("sst-74421");
  });

  it("parses Recyclinghof weekly hours", () => {
    const w = rh.find((x) => x.id === "rh-werdhoelzli")!;
    expect(w.hours).toMatchObject({ mo: "13:00–19:00", sa: "07:30–14:00" });
    expect(w.hours).not.toHaveProperty("so");
    expect(rh.map((x) => x.id).sort()).toEqual(["rh-looaecher", "rh-werdhoelzli"]);
  });

  it("rejects a layer that isn't GeoJSON or has bad coordinates", () => {
    expect(() => parseStations("mrh", { foo: 1 })).toThrow(IngestError);
    const f = structuredClone(fx.geo.recyclinghof) as { features: { geometry: { coordinates: number[] } }[] };
    f.features[0].geometry.coordinates = [2.35, 48.85]; // Paris
    expect(() => parseStations("recyclinghof", f)).toThrow(/outside Zürich/);
  });
});

describe("station matching (real 2026 names)", () => {
  const stations = [...parseStations("mrh", fx.geo.mrh), ...parseStations("hazmat", fx.geo.sonderabfall)];

  it("matches every MRH and Sonderabfallmobil calendar stop", () => {
    for (const [dataset, kind] of [
      ["mobiler_recyclinghof", "mrh"],
      ["sonderabfall", "hazmat"],
    ] as const) {
      const m = buildMatcher(kind, stations);
      const names = [...new Set(fx.calendars[dataset].records.map((r) => String(r.Station)))];
      const misses = names.filter((n) => !m.match(n));
      expect(misses, `${dataset} unmatched`).toEqual([]);
    }
  });

  it("uses each tier where the data needs it", () => {
    const mrh = buildMatcher("mrh", stations);
    expect(mrh.match("8004, Stauffacher: St. Jakobstrasse 29")?.tier).toBe("exact");
    expect(mrh.match("8004, Hardau/Letzigrund: Bullingerstrasse 58")?.tier).toBe("normalized");
    expect(mrh.match("8046, Seebach: Schule Hürstholz")?.tier).toBe("plz+place");
    const hz = buildMatcher("hazmat", stations);
    expect(hz.match("8064, Werdhölzli: Recyclinghof")?.tier).toBe("alias");
    expect(hz.match("8052, Seebach: Schaffhauserstrasse 801 (Parkplatz hinter Tramhaltestelle Seebach)")?.station.name).toBe(
      "Seebach",
    );
    expect(mrh.match("8099, Nirgendwo: Hauptstrasse 1")).toBeNull();
  });
});
