import type { ReportSummary } from "./report";

/**
 * Exports a rendered report (Markdown from report.ts) as a page in the Notion
 * Reviews database (Furtli HQ → Company databases → Reviews). No Claude in
 * between: the Markdown subset report.ts writes (headings, paragraphs, bullet
 * lists, pipe tables) is converted to Notion blocks one to one.
 *
 * Env: NOTION_TOKEN (an internal integration with access to the Reviews
 * database: Notion → ••• → Connections → add the integration) and
 * NOTION_REVIEWS_DATA_SOURCE_ID (default: Furtli HQ's Reviews data source).
 */

export const NOTION_VERSION = "2025-09-03";
export const DEFAULT_REVIEWS_DATA_SOURCE = "3e79e862-c7a4-813e-8778-000bd7b9ed0a";
const API = "https://api.notion.com/v1";
const MAX_TEXT = 2000; // Notion's limit per rich-text item
const BATCH = 100; // Notion's limit of blocks per request

export interface NotionConfig {
  token: string;
  dataSourceId: string;
}

export function notionConfig(env: Record<string, string | undefined> = process.env): NotionConfig | null {
  if (!env.NOTION_TOKEN) return null;
  return { token: env.NOTION_TOKEN, dataSourceId: env.NOTION_REVIEWS_DATA_SOURCE_ID || DEFAULT_REVIEWS_DATA_SOURCE };
}

type RichText = { type: "text"; text: { content: string }; annotations?: { bold: boolean } }[];
export type Block = Record<string, unknown> & { type: string };

/** Plain text with **bold** runs → Notion rich text (split at Notion's 2000-character limit). */
export function rt(text: string): RichText {
  const out: RichText = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/).filter((p) => p !== "");
  for (const part of parts) {
    const bold = part.startsWith("**") && part.endsWith("**") && part.length > 4;
    const content = bold ? part.slice(2, -2) : part;
    for (let i = 0; i < content.length; i += MAX_TEXT)
      out.push({ type: "text", text: { content: content.slice(i, i + MAX_TEXT) }, ...(bold ? { annotations: { bold: true } } : {}) });
  }
  return out.length ? out : [{ type: "text", text: { content: "" } }];
}

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/** Markdown (the subset report.ts writes) → Notion blocks. The "# " title line is skipped: it becomes the page title. */
export function markdownToBlocks(md: string): Block[] {
  const lines = md.split("\n");
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.startsWith("# ")) continue;
    const h = /^(#{2,3}) (.*)$/.exec(line);
    if (h) {
      const type = h[1].length === 2 ? "heading_2" : "heading_3";
      blocks.push({ object: "block", type, [type]: { rich_text: rt(h[2]) } });
      continue;
    }
    if (line.trim() === "---") {
      blocks.push({ object: "block", type: "divider", divider: {} });
      continue;
    }
    if (line.startsWith("> ")) {
      const quoted: string[] = [];
      for (; i < lines.length && lines[i].startsWith("> "); i++) quoted.push(lines[i].slice(2));
      i--;
      blocks.push({ object: "block", type: "callout", callout: { rich_text: rt(quoted.join("\n")), icon: { type: "emoji", emoji: "⚠️" }, color: "yellow_background" } });
      continue;
    }
    if (line.startsWith("- ")) {
      blocks.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rt(line.slice(2)) } });
      continue;
    }
    if (line.trimStart().startsWith("|")) {
      const rows: string[][] = [];
      for (; i < lines.length && lines[i].trimStart().startsWith("|"); i++) {
        const cells = splitRow(lines[i]);
        if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue; // separator row
        rows.push(cells);
      }
      i--;
      const width = Math.max(...rows.map((r) => r.length));
      blocks.push({
        object: "block",
        type: "table",
        table: {
          table_width: width,
          has_column_header: true,
          has_row_header: false,
          children: rows.map((r) => ({
            object: "block",
            type: "table_row",
            table_row: { cells: Array.from({ length: width }, (_, c) => rt(r[c] ?? "")) },
          })),
        },
      });
      continue;
    }
    blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: rt(line) } });
  }
  return blocks;
}

/** The page title in Reviews; also how an earlier export of the same week is found. */
export const reviewTitle = (week: string) => `Weekly – ${week}`;

/** Reviews database properties (number columns stay empty when a source had no data). */
export function reviewProperties(s: ReportSummary): Record<string, unknown> {
  const num = (v: number | null) => ({ number: v });
  return {
    Review: { title: rt(reviewTitle(s.week)) },
    Type: { select: { name: "Weekly" } },
    Date: { date: { start: s.firstDay, end: s.lastDay } },
    Visitors: num(s.visitors),
    "First actions": num(s.activatedVisitors),
    "Sign-ups": num(s.signUps),
    Confirmed: num(s.newConfirmed),
    Subscribers: num(s.activeSubscribers),
  };
}

type Fetch = typeof fetch;

async function call(cfg: NotionConfig, method: string, path: string, body: unknown, fetchImpl: Fetch): Promise<Record<string, unknown>> {
  const res = await fetchImpl(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Notion ${method} ${path}: HTTP ${res.status} ${String(json.message ?? "")}`.trim());
  return json;
}

/** Pages in Reviews whose title is exactly `title` (earlier exports of the same week). */
export async function findPagesByTitle(cfg: NotionConfig, title: string, fetchImpl: Fetch = fetch): Promise<string[]> {
  const res = await call(
    cfg,
    "POST",
    `/data_sources/${cfg.dataSourceId}/query`,
    { filter: { property: "Review", title: { equals: title } }, page_size: 10 },
    fetchImpl,
  );
  const results = Array.isArray(res.results) ? (res.results as { id?: unknown }[]) : [];
  return results.map((r) => String(r.id)).filter((id) => id && id !== "undefined");
}

/**
 * Creates the week's page in Reviews. An earlier export of the same week is
 * found by its title ("Weekly – 2026-W40") and moved to Notion's trash first,
 * so re-exporting never duplicates a week and nothing is written back to our
 * database. Pages you renamed by hand are left alone.
 */
export async function exportToNotion(
  markdown: string,
  summary: ReportSummary,
  cfg: NotionConfig,
  opts: { fetchImpl?: Fetch } = {},
): Promise<{ pageId: string; url: string | null; replaced: number }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const earlier = await findPagesByTitle(cfg, reviewTitle(summary.week), fetchImpl);
  for (const id of earlier) await call(cfg, "PATCH", `/pages/${id}`, { in_trash: true }, fetchImpl);
  const blocks = markdownToBlocks(markdown);
  const page = await call(
    cfg,
    "POST",
    "/pages",
    {
      parent: { type: "data_source_id", data_source_id: cfg.dataSourceId },
      properties: reviewProperties(summary),
      children: blocks.slice(0, BATCH),
    },
    fetchImpl,
  );
  const pageId = String(page.id);
  for (let i = BATCH; i < blocks.length; i += BATCH) {
    await call(cfg, "PATCH", `/blocks/${pageId}/children`, { children: blocks.slice(i, i + BATCH) }, fetchImpl);
  }
  return { pageId, url: typeof page.url === "string" ? page.url : null, replaced: earlier.length };
}
