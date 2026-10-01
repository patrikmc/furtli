import { describe, expect, it } from "vitest";
import { periodForWeek } from "./period";
import { type SnapshotError, collectUmami, toItems, toNum, umamiConfig } from "./umami-api";

const cfg = { apiKey: "k", websiteId: "site", baseUrl: "https://api.umami.is/v1" };
const p = periodForWeek("2026-W40");

function fakeFetch(handler: (url: URL) => { status?: number; body?: unknown }) {
  const calls: URL[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url);
    const { status = 200, body = [] } = handler(url);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { impl, calls };
}

describe("Umami response shapes", () => {
  it("reads numbers from v2 ({value}) and v3 (plain) shapes", () => {
    expect(toNum(5)).toBe(5);
    expect(toNum({ value: 7, prev: 3 })).toBe(7);
    expect(toNum("12")).toBe(12);
    expect(toNum(undefined)).toBe(0);
  });
  it("reads lists from {x,y} and {value,total}, sorted, without zeros", () => {
    expect(toItems([{ x: "a", y: 1 }, { value: "b", total: 3 }, { x: "c", y: 0 }])).toEqual([
      { value: "b", total: 3 },
      { value: "a", total: 1 },
    ]);
    expect(toItems(null)).toEqual([]);
  });
  it("needs both the API key and a website id", () => {
    expect(umamiConfig({ UMAMI_API_KEY: "k" })).toBeNull();
    expect(umamiConfig({ UMAMI_API_KEY: "k", NEXT_PUBLIC_UMAMI_WEBSITE_ID: "w" })).toMatchObject({ websiteId: "w", baseUrl: "https://api.umami.is/v1" });
  });
});

describe("collectUmami", () => {
  it("collects stats, funnel visitors and event properties for the Zurich week", async () => {
    const { impl, calls } = fakeFetch((url) => {
      if (url.pathname.endsWith("/stats")) return { body: { visitors: url.searchParams.get("event") ? 40 : 200, visits: 250, pageviews: 300, bounces: 90, totaltime: 1 } };
      if (url.pathname.endsWith("/event-data/values")) return { body: [{ value: "search_plz", total: 9 }] };
      if (url.pathname.endsWith("/metrics")) return { body: [{ x: "first_action", y: 50 }] };
      return { body: null };
    });
    const errors: SnapshotError[] = [];
    const u = await collectUmami(p, cfg, errors, impl);
    expect(errors).toEqual([]);
    expect(u?.stats.visitors).toBe(200);
    expect(u?.visitorsWith.first_action).toBe(40);
    expect(u?.props["first_action.action"]).toEqual([{ value: "search_plz", total: 9 }]);
    expect(u?.events.first_action).toBe(50);
    const first = calls[0];
    expect(first.pathname).toBe("/v1/websites/site/stats");
    expect(first.searchParams.get("startAt")).toBe(String(p.start.getTime()));
    expect(first.searchParams.get("endAt")).toBe(String(p.end.getTime() - 1));
  });

  it("stops early and records a gap when the key or plan is refused", async () => {
    const { impl, calls } = fakeFetch(() => ({ status: 403 }));
    const errors: SnapshotError[] = [];
    expect(await collectUmami(p, cfg, errors, impl)).toBeNull();
    expect(calls).toHaveLength(1);
    expect(errors).toEqual([{ source: "umami", call: "stats", message: "HTTP 403" }]);
  });

  it("keeps what worked when single calls fail", async () => {
    const { impl } = fakeFetch((url) =>
      url.pathname.endsWith("/stats") ? { body: { visitors: 10 } } : url.searchParams.get("propertyName") === "plz" ? { status: 500 } : { body: [] },
    );
    const errors: SnapshotError[] = [];
    const u = await collectUmami(p, cfg, errors, impl);
    expect(u?.stats.visitors).toBe(10);
    expect(errors.map((e) => e.call).sort()).toEqual(["values:place_search.plz", "values:search_no_result.plz"]);
  });
});
