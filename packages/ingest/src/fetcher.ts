import { CKAN_BASE, type CalendarSource, type GeoSource, wfsUrl } from "./sources";

/**
 * All network access goes through this interface, so tests can swap in
 * recorded fixtures and the pipeline itself stays pure.
 */
export interface Fetcher {
  getJson(url: string): Promise<unknown>;
}

export class HttpFetcher implements Fetcher {
  constructor(
    private readonly opts: { retries?: number; timeoutMs?: number; userAgent?: string } = {},
  ) {}

  async getJson(url: string): Promise<unknown> {
    const retries = this.opts.retries ?? 2;
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": this.opts.userAgent ?? "furtli-ingest/1.0 (+https://furtli.ch)",
          },
          signal: AbortSignal.timeout(this.opts.timeoutMs ?? 30_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return await res.json();
      } catch (e) {
        lastError = e;
        if (attempt < retries) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
    throw lastError;
  }
}

// ---------------------------------------------------------------------------
// CKAN
// ---------------------------------------------------------------------------

export interface CkanResource {
  id: string;
  name: string;
  url: string;
  datastoreActive: boolean;
  /** Year parsed from the file name, e.g. entsorgungskalender_papier_2026.csv */
  year: number | null;
}

interface CkanEnvelope<T> {
  success: boolean;
  result: T;
  error?: unknown;
}

function unwrap<T>(body: unknown, url: string): T {
  const b = body as CkanEnvelope<T>;
  if (!b || b.success !== true) throw new Error(`CKAN error for ${url}: ${JSON.stringify(b?.error ?? body)}`);
  return b.result;
}

export async function listResources(f: Fetcher, cal: CalendarSource): Promise<CkanResource[]> {
  const url = `${CKAN_BASE}/package_show?id=${encodeURIComponent(cal.dataset)}`;
  const pkg = unwrap<{ resources: { id: string; name: string; url: string; datastore_active?: boolean }[] }>(
    await f.getJson(url),
    url,
  );
  return pkg.resources.map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    datastoreActive: r.datastore_active === true,
    year: Number(/(\d{4})\.csv$/i.exec(r.name)?.[1]) || null,
  }));
}

export interface DatastoreTable {
  fields: string[];
  records: Record<string, unknown>[];
  total: number;
}

/** All rows of a DataStore resource, paginated. */
export async function readDatastore(f: Fetcher, resourceId: string, pageSize = 10_000): Promise<DatastoreTable> {
  const records: Record<string, unknown>[] = [];
  let fields: string[] = [];
  let total = Infinity;
  for (let offset = 0; offset < total; offset += pageSize) {
    const url = `${CKAN_BASE}/datastore_search?resource_id=${resourceId}&limit=${pageSize}&offset=${offset}`;
    const page = unwrap<{ fields: { id: string }[]; records: Record<string, unknown>[]; total: number }>(
      await f.getJson(url),
      url,
    );
    fields = page.fields.map((x) => x.id);
    total = page.total;
    records.push(...page.records);
    if (page.records.length === 0) break;
  }
  return { fields, records, total: records.length };
}

// ---------------------------------------------------------------------------
// WFS
// ---------------------------------------------------------------------------

export async function readLayer(f: Fetcher, g: GeoSource): Promise<unknown> {
  return f.getJson(wfsUrl(g));
}
