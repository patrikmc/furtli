import type { ReportPeriod } from "./period";

/**
 * Weekly aggregates from the Umami Cloud API (https://api.umami.is/v1).
 * Paths follow @umami/api-client (API 3.3.x). Every call is optional: a
 * failure is recorded in `errors` and the rest of the snapshot still saves.
 *
 * Env: UMAMI_API_KEY (Umami Cloud → Settings → API keys), the website id from
 * UMAMI_WEBSITE_ID or NEXT_PUBLIC_UMAMI_WEBSITE_ID, optional UMAMI_API_URL.
 */

export interface Item {
  value: string;
  total: number;
}

export interface UmamiWeek {
  /** When this part of the snapshot was collected (ISO). */
  collectedAt?: string;
  stats: { visitors: number; visits: number; pageviews: number; bounces: number; totaltime: number };
  /** Unique visitors who sent at least one of these events. */
  visitorsWith: Record<string, number>;
  /** Event name → number of events. */
  events: Record<string, number>;
  /** "event.property" → values with counts, e.g. "first_action.action". */
  props: Record<string, Item[]>;
  /** Top lists: referrer, path, device, country, city. */
  top: Record<string, Item[]>;
  /** /performance/stats as returned (Core Web Vitals); shape varies by Umami version. */
  performance: unknown;
}

export interface SnapshotError {
  source: "umami" | "neon" | "notion";
  call?: string;
  message: string;
}

/** Events whose unique visitors make the funnel (visitors → activated → sign-up). */
export const FUNNEL_EVENTS = ["first_action", "place_search", "station_open", "subscribe_open", "subscribe_submit"] as const;

/** Event properties the report breaks down. Keep in sync with the events in the README. */
export const PROPERTIES: readonly (readonly [string, string])[] = [
  ["visit_source", "channel"],
  ["visit_source", "post"],
  ["first_action", "action"],
  ["first_action", "within"],
  ["first_action", "channel"],
  ["place_search", "by"],
  ["place_search", "results"],
  ["place_search", "nearest"],
  ["place_search", "plz"],
  ["search_no_result", "reason"],
  ["search_no_result", "plz"],
  ["station_open", "kind"],
  ["station_open", "kreis"],
  ["station_open", "via"],
  ["panel_change", "control"],
  ["subscribe_submit", "channel"],
  ["subscribe_submit", "post"],
  ["map_ready", "within"],
  ["client_error", "where"],
  ["locate", "outcome"],
];

const TOP_TYPES = ["referrer", "path", "device", "country", "city"] as const;

export interface UmamiConfig {
  apiKey: string;
  websiteId: string;
  baseUrl: string;
}

export function umamiConfig(env: Record<string, string | undefined> = process.env): UmamiConfig | null {
  const apiKey = env.UMAMI_API_KEY;
  const websiteId = env.UMAMI_WEBSITE_ID || env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  if (!apiKey || !websiteId) return null;
  return { apiKey, websiteId, baseUrl: (env.UMAMI_API_URL || "https://api.umami.is/v1").replace(/\/$/, "") };
}

/** A number from `5`, `"5"` or `{ value: 5 }` (Umami v2 and v3 shapes differ). */
export function toNum(x: unknown): number {
  if (typeof x === "number") return x;
  if (typeof x === "string" && x.trim() !== "" && !Number.isNaN(Number(x))) return Number(x);
  if (x && typeof x === "object" && "value" in x) return toNum((x as { value: unknown }).value);
  return 0;
}

/** Rows from `[{x, y}]`, `[{value, total}]` or `[{propertyValue, total}]`, sorted by count. */
export function toItems(rows: unknown): Item[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const value = o.x ?? o.value ?? o.propertyValue ?? o.name ?? "";
      const total = o.y ?? o.total ?? o.count ?? o.visitors ?? 0;
      return { value: value === null ? "(none)" : String(value), total: toNum(total) };
    })
    .filter((i) => i.total > 0)
    .sort((a, b) => b.total - a.total);
}

type Fetch = typeof fetch;

/** Runs `tasks` with at most `limit` in flight (the API allows 50 calls per 15 s). */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      out[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return out;
}

export async function collectUmami(
  period: ReportPeriod,
  cfg: UmamiConfig,
  errors: SnapshotError[],
  fetchImpl: Fetch = fetch,
): Promise<UmamiWeek | null> {
  const base = { startAt: String(period.start.getTime()), endAt: String(period.end.getTime() - 1), timezone: "Europe/Zurich" };

  async function get(call: string, path: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = `${cfg.baseUrl}/websites/${cfg.websiteId}${path}?${new URLSearchParams({ ...base, ...params })}`;
    try {
      const res = await fetchImpl(url, {
        headers: {
          Accept: "application/json",
          // Umami Cloud documents the Bearer scheme; older accounts used x-umami-api-key.
          Authorization: `Bearer ${cfg.apiKey}`,
          "x-umami-api-key": cfg.apiKey,
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        errors.push({ source: "umami", call, message: `HTTP ${res.status}` });
        return undefined;
      }
      return await res.json();
    } catch (e) {
      errors.push({ source: "umami", call, message: e instanceof Error ? e.message : String(e) });
      return undefined;
    }
  }

  const failedBefore = errors.length;
  const stats = (await get("stats", "/stats")) as Record<string, unknown> | undefined;
  // Wrong key or website id: every other call would fail the same way.
  if (stats === undefined) return null;

  const week: UmamiWeek = {
    collectedAt: new Date().toISOString(),
    stats: {
      visitors: toNum(stats.visitors),
      visits: toNum(stats.visits),
      pageviews: toNum(stats.pageviews),
      bounces: toNum(stats.bounces),
      totaltime: toNum(stats.totaltime),
    },
    visitorsWith: {},
    events: {},
    props: {},
    top: {},
    performance: null,
  };

  const tasks: (() => Promise<void>)[] = [
    async () => {
      for (const i of toItems(await get("metrics:event", "/metrics", { type: "event", limit: "100" }))) week.events[i.value] = i.total;
    },
    async () => {
      week.performance = (await get("performance", "/performance/stats")) ?? null;
    },
    ...FUNNEL_EVENTS.map((event) => async () => {
      const s = (await get(`stats:${event}`, "/stats", { event })) as Record<string, unknown> | undefined;
      if (s) week.visitorsWith[event] = toNum(s.visitors);
    }),
    ...PROPERTIES.map(([eventName, propertyName]) => async () => {
      const rows = await get(`values:${eventName}.${propertyName}`, "/event-data/values", { eventName, propertyName });
      if (rows !== undefined) week.props[`${eventName}.${propertyName}`] = toItems(rows);
    }),
    ...TOP_TYPES.map((type) => async () => {
      const rows = await get(`metrics:${type}`, "/metrics", { type, limit: "15" });
      if (rows !== undefined) week.top[type] = toItems(rows);
    }),
  ];
  await pool(tasks, 4);
  if (errors.length - failedBefore > tasks.length / 2) {
    errors.push({ source: "umami", message: "More than half of the Umami calls failed; check the API plan limits (backlog A9)." });
  }
  return week;
}
