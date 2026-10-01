import { describe, expect, it } from "vitest";
import { fixtureSnapshot } from "./fixtures";
import { bar, buildModel, sparkline } from "./model";
import { markdownToBlocks, reviewProperties, rt } from "./notion";
import { renderReport, renderReportTerminal, summarize } from "./report";

const now = fixtureSnapshot("2026-W40");
const last = fixtureSnapshot("2026-W39", 0.5);
const ANSI = /\u001b\[[0-9;]*m/g;

describe("report model", () => {
  it("compares with last week and knows which direction is good", () => {
    const m = buildModel(now, [last]);
    const rows = m.sections[0].blocks[0];
    if (rows.kind !== "scorecard") throw new Error("scorecard first");
    expect(rows.rows.find((r) => r.label === "Visitors")).toMatchObject({ now: "200", last: "100", change: { text: "+100", dir: "up", good: true } });
    expect(rows.rows.find((r) => r.label === "Unsubscribed")?.change).toMatchObject({ dir: "flat", good: null });
    expect(m.kpis.map((k) => k.label)).toEqual(["Visitors", "Used the map", "New subscribers", "Active subscribers"]);
  });

  it("draws sparklines and bars", () => {
    expect(sparkline([1, 2, 3, 8])).toBe("▁▂▃█");
    expect(sparkline([5, null, 5])).toBe("▄ ▄");
    expect(sparkline([])).toBe("");
    expect(bar(50, 10)).toBe("█████");
    expect(bar(1, 10)).toBe("█"); // never invisible when > 0
    expect(bar(0, 10, "█", "░")).toBe("░░░░░░░░░░");
  });
});

describe("Markdown style", () => {
  it("has a title, an at-a-glance row and a scorecard with arrows and trends", () => {
    const md = renderReport(now, [last]);
    expect(md).toMatch(/^# Furtli weekly · 2026-W40 · 27 Sep – 3 Oct 2026/);
    expect(md).toContain("| **200** | **60%** | **8** | **47** |");
    expect(md).toContain("| Visitors | **200** | 100 | ▲ +100 | 100 | ▁█ |");
    expect(md).toContain("| social | 120 | 60% | ███████ |");
  });

  it("shows data gaps as a callout and copes with a missing source", () => {
    const md = renderReport({ ...now, umami: null, derived: { ...now.derived, funnel: [] }, errors: [{ source: "neon", call: "emails", message: "timeout" }] });
    expect(md).toContain("> **Data gaps**\n> neon (emails): timeout");
    expect(md).toContain("Umami – not collected");
    expect(md).toContain("No traffic data this week.");
    expect(md).toContain("No earlier weeks stored yet");
  });
});

describe("terminal style", () => {
  it("is plain text without colour and stays within the width", () => {
    const text = renderReportTerminal(now, [last], { color: false, width: 90 });
    expect(text).not.toMatch(ANSI);
    expect(text).toContain("FURTLI WEEKLY");
    expect(text).toContain("── SCORECARD");
    for (const line of text.split("\n")) expect(line.length).toBeLessThanOrEqual(90);
  });

  it("colours good news green and bad news red", () => {
    const worse = { ...now, neon: { ...now.neon!, subscribers: { ...now.neon!.subscribers, unsubscribed: 9 } } };
    const text = renderReportTerminal(worse, [last], { color: true });
    expect(text).toContain("\u001b[32m▲ +100\u001b[0m"); // visitors up: green
    expect(text).toContain("\u001b[31m▲ +8\u001b[0m"); // unsubscribes up: red
  });
});

describe("Notion export", () => {
  it("turns the styled Markdown into blocks, without the title line", () => {
    const blocks = markdownToBlocks(renderReport(fixtureSnapshot()) + "\n> **Data gaps**\n> x\n");
    expect(blocks[0].type).toBe("paragraph");
    expect(blocks.some((b) => b.type === "divider")).toBe(true);
    expect(blocks.at(-1)?.type).toBe("callout");
    const tables = blocks.filter((b) => b.type === "table") as unknown as { table: { table_width: number; children: unknown[] } }[];
    expect(tables[0].table.table_width).toBe(4); // at a glance
    expect(tables[1].table.table_width).toBe(6); // scorecard
    expect(tables[1].table.children.length).toBe(14); // header + 13 metrics, separator dropped
  });

  it("keeps **bold** as bold text", () => {
    expect(rt("a **200** b")).toEqual([
      { type: "text", text: { content: "a " } },
      { type: "text", text: { content: "200" }, annotations: { bold: true } },
      { type: "text", text: { content: " b" } },
    ]);
  });

  it("fills the Reviews database columns", () => {
    const props = reviewProperties(summarize(fixtureSnapshot())) as Record<string, Record<string, unknown>>;
    expect(props.Date).toEqual({ date: { start: "2026-09-27", end: "2026-10-03" } });
    expect(props.Visitors).toEqual({ number: 200 });
    expect(props["First actions"]).toEqual({ number: 120 });
    expect(props.Confirmed).toEqual({ number: 8 });
    expect(props.Subscribers).toEqual({ number: 47 });
  });
});
