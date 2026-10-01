import { buildModel } from "./model";
import { renderMarkdown } from "./render-markdown";
import { renderTerminal, type TerminalOptions } from "./render-terminal";
import type { Snapshot } from "./snapshot";

/**
 * The weekly report from stored snapshots, in two styles built from one
 * model (model.ts): styled Markdown (files, endpoint, Notion) and terminal.
 */
export { daysOf, summarize, type ReportSummary } from "./model";

/** Styled Markdown. `history`: earlier stored weeks, newest first. */
export function renderReport(s: Snapshot, history: Snapshot[] = []): string {
  return renderMarkdown(buildModel(s, history));
}

/** Terminal text (ANSI colour optional). */
export function renderReportTerminal(s: Snapshot, history: Snapshot[] = [], opts: TerminalOptions = {}): string {
  return renderTerminal(buildModel(s, history), opts);
}
