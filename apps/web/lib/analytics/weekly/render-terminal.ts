import { arrow, bar, type Block, type Change, type ReportModel, sparkline } from "./model";

/**
 * The weekly report for the terminal (`pnpm weekly-report`): a boxed header,
 * KPI tiles, a scorecard with coloured changes and sparklines, and bar charts
 * for the breakdowns. Colour is optional (off with --no-color, NO_COLOR or
 * when the output isn't a terminal), so the same text also works in a file.
 */

export interface TerminalOptions {
  color?: boolean;
  /** Total width in columns (clamped to 72–120). */
  width?: number;
}

const ESC = "\u001b[";
const ANSI = /\u001b\[[0-9;]*m/g;
const visible = (s: string) => s.replace(ANSI, "").length;

function painter(on: boolean) {
  const wrap = (code: string) => (s: string) => (on && s ? `${ESC}${code}m${s}${ESC}0m` : s);
  return { bold: wrap("1"), dim: wrap("2"), green: wrap("32"), red: wrap("31"), yellow: wrap("33"), cyan: wrap("36"), accent: wrap("1;36") };
}

function pad(s: string, width: number, right = false): string {
  const gap = Math.max(0, width - visible(s));
  return right ? " ".repeat(gap) + s : s + " ".repeat(gap);
}

function cut(s: string, width: number): string {
  return s.length <= width ? s : `${s.slice(0, Math.max(0, width - 1))}…`;
}

function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

export function renderTerminal(m: ReportModel, opts: TerminalOptions = {}): string {
  const c = painter(opts.color ?? false);
  const W = Math.min(120, Math.max(72, opts.width ?? 100));
  const inner = W - 4;
  const out: string[] = [];

  const tone = (ch: Change | null, text: string) =>
    !ch ? c.dim(text) : ch.good === true ? c.green(text) : ch.good === false ? c.red(text) : c.dim(text);
  const changeText = (ch: Change | null) => (ch ? `${arrow(ch)} ${ch.text}` : "–");

  // ── header box
  out.push(c.dim(`╭${"─".repeat(W - 2)}╮`));
  const headerLines = [
    `${c.accent("FURTLI WEEKLY")}   ${c.bold(m.week)}  ${c.dim("·")}  ${m.range}`,
    "",
    ...m.meta.flatMap((l) => wrapText(l, inner).map((x) => c.dim(x))),
  ];
  for (const l of headerLines) out.push(`${c.dim("│")} ${pad(l, inner)} ${c.dim("│")}`);
  out.push(c.dim(`╰${"─".repeat(W - 2)}╯`), "");

  // ── data gaps
  if (m.gaps.length) {
    out.push(`  ${c.yellow(c.bold("▲ DATA GAPS"))}`);
    for (const g of m.gaps) for (const [i, l] of wrapText(g, W - 6).entries()) out.push(`    ${i ? " " : c.yellow("•")} ${l}`);
    out.push("");
  }

  // ── KPI tiles
  const n = m.kpis.length;
  const tile = Math.floor((W - 2 - (n - 1)) / n);
  const tw = tile - 2;
  const tops = m.kpis.map((k) => c.dim(`┌ ${k.label} ${"─".repeat(Math.max(0, tw - k.label.length - 2))}┐`));
  const values = m.kpis.map((k) => `${c.dim("│")}${pad(` ${c.bold(k.value)}`, tw)}${c.dim("│")}`);
  const changes = m.kpis.map((k) => `${c.dim("│")}${pad(` ${tone(k.change, k.change ? `${changeText(k.change)} vs last week` : "first week")}`, tw)}${c.dim("│")}`);
  const bottoms = m.kpis.map(() => c.dim(`└${"─".repeat(tw)}┘`));
  for (const line of [tops, values, changes, bottoms]) out.push(` ${line.join(" ")}`);
  out.push("");

  // ── sections
  const heading = (t: string) => {
    const label = ` ${t.toUpperCase()} `;
    out.push(`${c.dim("──")}${c.bold(label)}${c.dim("─".repeat(Math.max(0, W - 2 - label.length)))}`, "");
  };
  const subheading = (t: string) => out.push(`  ${c.bold(t)}`);

  const table = (head: string[], rows: string[][], numeric: boolean[]) => {
    const widths = head.map((h, i) => Math.max(visible(h), ...rows.map((r) => visible(r[i] ?? ""))));
    out.push(`    ${head.map((h, i) => c.dim(pad(h, widths[i], numeric[i]))).join("   ")}`);
    for (const r of rows) out.push(`    ${r.map((x, i) => pad(x, widths[i], numeric[i])).join("   ")}`);
  };

  const block = (b: Block) => {
    switch (b.kind) {
      case "text":
        for (const l of wrapText(b.text, W - 4)) out.push(`  ${b.muted ? c.dim(l) : l}`);
        out.push("");
        return;
      case "scorecard": {
        const labelW = Math.max(...b.rows.map((r) => r.label.length));
        const head = [pad("", labelW), pad("This wk", 9, true), pad("Last wk", 9, true), pad("Change", 12, true), pad("4-wk avg", 9, true), "  Trend"];
        out.push(`  ${c.dim(head.join(" "))}`);
        for (const r of b.rows) {
          out.push(
            `  ${pad(r.label, labelW)} ${pad(c.bold(r.now), 9, true)} ${pad(r.last, 9, true)} ${pad(tone(r.change, changeText(r.change)), 12, true)} ${pad(r.avg, 9, true)}   ${c.cyan(sparkline(r.trend))}`,
          );
        }
        out.push("");
        return;
      }
      case "bars": {
        subheading(b.title);
        if (!b.bars.length) {
          out.push(`    ${c.dim(b.empty)}`, "");
          return;
        }
        // Fixed columns, so bars line up from one section to the next.
        const labelW = 28;
        const valueW = Math.max(6, ...b.bars.map((x) => String(x.value).length));
        const barW = Math.max(10, Math.min(40, W - 4 - labelW - valueW - 12));
        for (const x of b.bars) {
          out.push(`    ${pad(cut(x.label, labelW), labelW)}  ${c.cyan(bar(x.pct, barW, "█"))}${c.dim("░".repeat(barW - bar(x.pct, barW).length))}  ${pad(String(x.value), valueW, true)}  ${c.dim(pad(`${x.pct}%`, 4, true))}`);
        }
        if (b.more) out.push(`    ${c.dim(`${b.more} more not shown`)}`);
        out.push("");
        return;
      }
      case "table":
        subheading(b.title);
        if (!b.rows.length) out.push(`    ${c.dim(b.empty)}`);
        else table(b.head, b.rows, b.numeric);
        out.push("");
        return;
    }
  };

  for (const s of m.sections) {
    heading(s.title);
    for (const b of s.blocks) block(b);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
