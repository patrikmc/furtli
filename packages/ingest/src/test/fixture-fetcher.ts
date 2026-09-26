import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Fetcher } from "../fetcher";

/**
 * Recorded Open Data Zürich responses (26 Sep 2026), trimmed:
 * calendars for PLZ 8004 (+ 8046 for the MRH), all Sonderabfallmobil
 * dates, all MRH / hazmat / Recyclinghof stations, Sammelstellen in
 * 8004/8005. Captured via the CKAN DataStore API and the city's WFS.
 */
export interface Fixtures {
  calendars: Record<string, { fields: string[]; records: Record<string, unknown>[] }>;
  geo: Record<"mrh" | "sonderabfall" | "sammelstelle" | "recyclinghof", { type: string; features: unknown[] }>;
}

export function loadFixtures(): Fixtures {
  const path = fileURLToPath(new URL("../../fixtures/opendata-sample.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Fixtures;
}

const GEO_BY_SERVICE: Record<string, keyof Fixtures["geo"]> = {
  Cargo__und_E_Tram: "mrh",
  Sonderabfallsammlung: "sonderabfall",
  Sammelstelle: "sammelstelle",
  Recyclinghof: "recyclinghof",
};

/**
 * Serves fixtures in the shape of the real APIs: CKAN package_show and
 * datastore_search (with offset paging), and WFS GetFeature. `years` lists
 * which calendar years "exist" (the 2026 records are reused for other years
 * with the dates shifted, to test year handling).
 */
export class FixtureFetcher implements Fetcher {
  readonly requests: string[] = [];
  constructor(
    public fx: Fixtures = loadFixtures(),
    private readonly years: number[] = [2026],
  ) {}

  async getJson(url: string): Promise<unknown> {
    this.requests.push(url);
    const u = new URL(url);

    if (u.pathname.endsWith("/package_show")) {
      const dataset = u.searchParams.get("id")!;
      const key = dataset.replace("entsorgungskalender_", "");
      if (!this.fx.calendars[key]) return { success: false, error: { message: "Not found" } };
      return {
        success: true,
        result: {
          resources: this.years.map((y) => ({
            id: `fx-${key}-${y}`,
            name: `${dataset}_${y}.csv`,
            url: `https://data.stadt-zuerich.ch/dataset/${dataset}/download/${dataset}_${y}.csv`,
            datastore_active: true,
          })),
        },
      };
    }

    if (u.pathname.endsWith("/datastore_search")) {
      const [, key, y] = /^fx-(.+)-(\d{4})$/.exec(u.searchParams.get("resource_id")!)!;
      const table = this.fx.calendars[key];
      const records = table.records.map((r) => ({ ...r, Abholdatum: String(r.Abholdatum).replace(/^2026/, y) }));
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const limit = Number(u.searchParams.get("limit") ?? 100);
      return {
        success: true,
        result: {
          fields: table.fields.map((id) => ({ id })),
          records: records.slice(offset, offset + limit),
          total: records.length,
        },
      };
    }

    const wfs = /\/wfs\/geoportal\/([^?]+)/.exec(url);
    if (wfs) return this.fx.geo[GEO_BY_SERVICE[wfs[1]]];

    throw new Error(`FixtureFetcher: no fixture for ${url}`);
  }
}
