import { arrow, bar, type Block, type ReportModel, sparkline } from "./model";

/**
 * Styled Markdown for files, the /api/internal/weekly-report endpoint and the
 * Notion export. Uses only what notion.ts converts: headings, paragraphs,
 * **bold**, "> " callouts, "---" dividers and pipe tables (with alignment).
 */

const cell = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ");
const row = (cells: string[]) => `| ${cells.map(cell).join(" | ")} |`;
const align = (numeric: boolean[]) => row(numeric.map((n) => (n ? "---:" : "---")));
const BAR_WIDTH = 12;

function block(b: Block): string[] {
  switch (b.kind) {
    case "text":
      return [b.text, ""];
    case "scorecard":
      return [
        row(["Metric", "This week", "Last week", "Change", "4-wk avg", "Trend"]),
        align([false, true, true, true, true, false]),
        ...b.rows.map((r) => row([r.label, `**${r.now}**`, r.last, r.change ? `${arrow(r.change)} ${r.change.text}` : "–", r.avg, sparkline(r.trend) || "–"])),
        "",
      ];
    case "bars": {
      const out = [`### ${b.title}`, ""];
      if (!b.bars.length) return [...out, b.empty, ""];
      out.push(row([b.head, b.valueHead, b.pctHead, ""]), align([false, true, true, false]));
      for (const x of b.bars) out.push(row([x.label, String(x.value), `${x.pct}%`, bar(x.pct, BAR_WIDTH)]));
      out.push("");
      if (b.more) out.push(`${b.more} more not shown.`, "");
      return out;
    }
    case "table": {
      const out = [`### ${b.title}`, ""];
      if (!b.rows.length) return [...out, b.empty, ""];
      return [...out, row(b.head), align(b.numeric), ...b.rows.map(row), ""];
    }
  }
}

export function renderMarkdown(m: ReportModel): string {
  const out: string[] = [`# Furtli weekly · ${m.week} · ${m.range}`, ""];
  for (const line of m.meta) out.push(line, "");
  if (m.draft) out.push(`> **${m.draft}**`, "");
  if (m.gaps.length) {
    out.push("> **Data gaps**");
    for (const g of m.gaps) out.push(`> ${g}`);
    out.push("");
  }
  out.push("## At a glance", "");
  out.push(
    row(m.kpis.map((k) => k.label)),
    row(m.kpis.map(() => ":---:")),
    row(m.kpis.map((k) => `**${k.value}**`)),
    row(m.kpis.map((k) => (k.change ? `${arrow(k.change)} ${k.change.text} vs last week` : "first week"))),
    "",
  );
  for (const s of m.sections) {
    out.push("---", "", `## ${s.title}`, "");
    for (const b of s.blocks) out.push(...block(b));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
