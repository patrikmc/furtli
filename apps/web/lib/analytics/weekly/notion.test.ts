import { describe, expect, it } from "vitest";
import { exportToNotion, reviewTitle } from "./notion";
import type { ReportSummary } from "./report";

const cfg = { token: "secret", dataSourceId: "ds-1" };
const summary: ReportSummary = {
  week: "2026-W40",
  firstDay: "2026-09-27",
  lastDay: "2026-10-03",
  visitors: 200,
  activatedVisitors: 120,
  signUps: 10,
  newConfirmed: 8,
  activeSubscribers: 47,
};

function fakeNotion(existing: string[]) {
  const calls: { method: string; path: string; body: Record<string, unknown> }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace("/v1", "");
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ method: String(init?.method), path, body });
    if (path === "/data_sources/ds-1/query") return new Response(JSON.stringify({ results: existing.map((id) => ({ id })) }));
    if (path === "/pages" && init?.method === "POST") return new Response(JSON.stringify({ id: "new-page", url: "https://notion.so/new-page" }));
    return new Response("{}");
  }) as typeof fetch;
  return { impl, calls };
}

describe("exportToNotion", () => {
  it("finds an earlier export of the week by its title and trashes it before creating the new page", async () => {
    const { impl, calls } = fakeNotion(["old-page"]);
    const r = await exportToNotion("# Title\n\nHello", summary, cfg, { fetchImpl: impl });
    expect(r).toEqual({ pageId: "new-page", url: "https://notion.so/new-page", replaced: 1 });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /data_sources/ds-1/query", "PATCH /pages/old-page", "POST /pages"]);
    expect(calls[0].body).toMatchObject({ filter: { property: "Review", title: { equals: "Weekly – 2026-W40" } } });
    expect(calls[1].body).toEqual({ in_trash: true });
    expect(calls[2].body).toMatchObject({ parent: { type: "data_source_id", data_source_id: "ds-1" } });
  });

  it("just creates the page the first time", async () => {
    const { impl, calls } = fakeNotion([]);
    const r = await exportToNotion("Hello", summary, cfg, { fetchImpl: impl });
    expect(r.replaced).toBe(0);
    expect(calls.map((c) => c.method)).toEqual(["POST", "POST"]);
  });

  it("uses one title format for creating and finding", () => {
    expect(reviewTitle("2026-W40")).toBe("Weekly – 2026-W40");
  });
});
