import { zurichDate } from "./period";
import type { Snapshot } from "./snapshot";
import type { Item } from "./umami-api";

/**
 * The weekly report as data: what goes in each section, with no styling.
 * Rendered as styled Markdown (render-markdown.ts: files, endpoint, Notion)
 * or for the terminal (render-terminal.ts: `pnpm weekly-report`). Numbers
 * and comparisons only, no interpretation.
 */

export type Direction = "up" | "down" | "flat";

export interface Change {
  /** "+100", "−2.5 pp", "0" */
  text: string;
  dir: Direction;
  /** true = good news, false = bad news, null = neutral or unknown. */
  good: boolean | null;
}

export interface Kpi {
  label: string;
  value: string;
  change: Change | null;
}

export interface ScoreRow {
  label: string;
  now: string;
  last: string;
  change: Change | null;
  avg: string;
  /** Oldest → this week (up to 5 values; null = no data that week). */
  trend: (number | null)[];
}

export interface Bar {
  label: string;
  value: number;
  /** 0–100: share of the list, or of visitors for the funnel. */
  pct: number;
}

export type Block =
  | { kind: "scorecard"; rows: ScoreRow[] }
  | { kind: "bars"; title: string; head: string; valueHead: string; pctHead: string; bars: Bar[]; more: number; empty: string }
  | { kind: "table"; title: string; head: string[]; rows: string[][]; numeric: boolean[]; empty: string }
  | { kind: "text"; text: string; muted?: boolean };

export interface Section {
  title: string;
  blocks: Block[];
}

export interface ReportModel {
  week: string;
  /** "27 Sep – 3 Oct 2026" */
  range: string;
  meta: string[];
  /** Set when the numbers were collected before the week ended (Saturday 24:00). */
  draft: string | null;
  gaps: string[];
  kpis: Kpi[];
  sections: Section[];
}

export interface ReportSummary {
  week: string;
  firstDay: string;
  lastDay: string;
  visitors: number | null;
  activatedVisitors: number | null;
  signUps: number | null;
  newConfirmed: number | null;
  activeSubscribers: number | null;
}

type Num = number | null | undefined;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dayLabel = (d: string) => `${Number(d.slice(8))} ${MONTHS.at(Number(d.slice(5, 7)) - 1)}`;
const fmt = (n: Num, unit = "") => (n === null || n === undefined ? "–" : `${Number.isInteger(n) ? n : n.toFixed(1)}${unit}`);
const utc = (iso: string) => `${dayLabel(iso.slice(0, 10))} ${iso.slice(11, 16)} UTC`;

export function daysOf(s: Pick<Snapshot, "startsAt" | "endsAt">): { firstDay: string; lastDay: string } {
  return { firstDay: zurichDate(new Date(s.startsAt)), lastDay: zurichDate(new Date(new Date(s.endsAt).getTime() - 1)) };
}

export function summarize(s: Snapshot): ReportSummary {
  return {
    week: s.week,
    ...daysOf(s),
    visitors: s.umami?.stats.visitors ?? null,
    activatedVisitors: s.umami?.visitorsWith.first_action ?? null,
    signUps: s.neon?.subscribers.signedUp ?? null,
    newConfirmed: s.neon?.subscribers.newConfirmed ?? null,
    activeSubscribers: s.neon?.subscribers.activeAtEnd ?? null,
  };
}

interface Metric {
  label: string;
  pick: (s: Snapshot) => Num;
  /** Percent value: change in percentage points. */
  pct?: boolean;
  /** Which direction is good news. */
  better: "up" | "down";
}

const METRICS: Metric[] = [
  { label: "Visitors", pick: (s) => s.umami?.stats.visitors, better: "up" },
  { label: "Visits", pick: (s) => s.umami?.stats.visits, better: "up" },
  { label: "Activation (used the map)", pick: (s) => s.derived.activationPct, pct: true, better: "up" },
  { label: "Searches with a result", pick: (s) => s.derived.searchSuccessPct, pct: true, better: "up" },
  { label: "Sign-ups", pick: (s) => s.neon?.subscribers.signedUp, better: "up" },
  { label: "New confirmed subscribers", pick: (s) => s.neon?.subscribers.newConfirmed, better: "up" },
  { label: "Unsubscribed", pick: (s) => s.neon?.subscribers.unsubscribed, better: "down" },
  { label: "Net subscribers", pick: (s) => s.neon?.subscribers.net, better: "up" },
  { label: "Active subscribers (end)", pick: (s) => s.neon?.subscribers.activeAtEnd, better: "up" },
  { label: "Churn", pick: (s) => s.neon?.subscribers.churnPct, pct: true, better: "down" },
  { label: "Sign-ups confirmed", pick: (s) => s.derived.confirmPct, pct: true, better: "up" },
  { label: "Median hours to confirm", pick: (s) => s.neon?.subscribers.medianHoursToConfirm, better: "down" },
  { label: "Unconfirmed after 48 h", pick: (s) => s.neon?.subscribers.unconfirmed48h, better: "down" },
];

const KPIS = ["Visitors", "Activation (used the map)", "New confirmed subscribers", "Active subscribers (end)"];
const KPI_LABELS: Record<string, string> = {
  Visitors: "Visitors",
  "Activation (used the map)": "Used the map",
  "New confirmed subscribers": "New subscribers",
  "Active subscribers (end)": "Active subscribers",
};

function change(now: Num, before: Num, m: Metric): Change | null {
  if (now === null || now === undefined || before === null || before === undefined) return null;
  const d = Math.round((now - before) * 10) / 10;
  const dir: Direction = d > 0 ? "up" : d < 0 ? "down" : "flat";
  const text = `${d > 0 ? "+" : d < 0 ? "−" : ""}${fmt(Math.abs(d))}${m.pct ? " pp" : ""}`;
  return { text, dir, good: dir === "flat" ? null : dir === m.better };
}

function average(xs: Num[]): number | null {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

function bars(title: string, list: Item[] | undefined, head: string, limit = 8): Block {
  const items = list ?? [];
  const total = items.reduce((s, i) => s + i.total, 0);
  return {
    kind: "bars",
    title,
    head,
    valueHead: "Count",
    pctHead: "Share",
    bars: items.slice(0, limit).map((i) => ({ label: i.value || "(empty)", value: i.total, pct: total ? Math.round((i.total / total) * 100) : 0 })),
    more: Math.max(0, items.length - limit),
    empty: "No data this week.",
  };
}

function counts(title: string, list: { key: string; count: number }[] | undefined, head: string): Block {
  return { kind: "table", title, head: [head, "Count"], rows: (list ?? []).map((c) => [c.key, String(c.count)]), numeric: [false, true], empty: "None." };
}

/** `history`: earlier stored weeks, newest first (last week, 4-week average, trend). */
export function buildModel(s: Snapshot, history: Snapshot[] = []): ReportModel {
  const { firstDay, lastDay } = daysOf(s);
  const last = history[0];
  const four = history.slice(0, 4);
  const series = [...four].reverse(); // oldest → newest, before this week
  const u = s.umami;
  const n = s.neon;

  const rows: ScoreRow[] = METRICS.map((m) => {
    const unit = m.pct ? "%" : "";
    return {
      label: m.label,
      now: fmt(m.pick(s), unit),
      last: last ? fmt(m.pick(last), unit) : "–",
      change: last ? change(m.pick(s), m.pick(last), m) : null,
      avg: four.length ? fmt(average(four.map(m.pick)), unit) : "–",
      trend: [...series.map((h) => m.pick(h) ?? null), m.pick(s) ?? null],
    };
  });
  const kpis: Kpi[] = KPIS.map((label) => {
    const r = rows.find((x) => x.label === label)!;
    return { label: KPI_LABELS[label], value: r.now, change: r.change };
  });

  const sources = `Sources: database ${n ? `✓ ${n.collectedAt ? utc(n.collectedAt) : ""}`.trim() : "– not collected"} · Umami ${
    u ? `✓ ${u.collectedAt ? utc(u.collectedAt) : ""}`.trim() : "– not collected (no traffic numbers this week)"
  }`;

  const funnel: Block = {
    kind: "bars",
    title: "Unique visitors per step",
    head: "Step",
    valueHead: "Visitors",
    pctHead: "% of visitors",
    bars: s.derived.funnel.map((f) => ({ label: f.step, value: f.visitors, pct: Math.round(f.pctOfVisitors ?? 0) })),
    more: 0,
    empty: "No traffic data this week.",
  };

  const sections: Section[] = [
    { title: "Scorecard", blocks: [{ kind: "scorecard", rows }, ...(history.length ? [] : [{ kind: "text" as const, text: "No earlier weeks stored yet: comparisons start next week.", muted: true }])] },
    {
      title: "Funnel",
      blocks: [
        funnel,
        ...(n
          ? [{ kind: "text" as const, text: `Database: ${n.subscribers.signedUp} signed up this week, ${n.subscribers.signedUpAndConfirmed} of them confirmed.` }]
          : []),
      ],
    },
    {
      title: "Acquisition",
      blocks: [
        bars("Visits by channel", u?.props["visit_source.channel"], "Channel"),
        bars("Visits by post", u?.props["visit_source.post"], "Post ID"),
        bars("Top referrers", u?.top.referrer, "Referrer"),
        {
          kind: "table",
          title: "Sign-ups by channel (database)",
          head: ["Channel", "Signed up", "Confirmed"],
          rows: (n?.attribution.byChannelGroup ?? []).map((c) => [c.channel, String(c.signedUp), String(c.confirmed)]),
          numeric: [false, true, true],
          empty: "No sign-ups.",
        },
        {
          kind: "table",
          title: "Sign-ups by post (database)",
          head: ["Post ID", "Source", "Campaign", "Signed up", "Confirmed"],
          rows: (n?.attribution.byPost ?? []).slice(0, 10).map((p) => [p.postId, p.source, p.campaign, String(p.signedUp), String(p.confirmed)]),
          numeric: [false, false, false, true, true],
          empty: "No sign-ups.",
        },
      ],
    },
    {
      title: "Activation",
      blocks: [
        bars("First action", u?.props["first_action.action"], "Action"),
        bars("Time to first action", u?.props["first_action.within"], "Within"),
        bars("First action by channel", u?.props["first_action.channel"], "Channel"),
      ],
    },
    {
      title: "What people look for",
      blocks: [
        bars("Searches by type", u?.props["place_search.by"], "Search by"),
        bars("Results per search", u?.props["place_search.results"], "Results"),
        bars("Nearest result", u?.props["place_search.nearest"], "Distance"),
        bars("Postcodes searched", u?.props["place_search.plz"], "PLZ", 10),
        bars("No result: reason", u?.props["search_no_result.reason"], "Reason"),
        bars("No result: postcode", u?.props["search_no_result.plz"], "PLZ"),
        bars("Stations opened by type", u?.props["station_open.kind"], "Type"),
        bars("Stations opened by Kreis", u?.props["station_open.kreis"], "Kreis", 12),
        bars("How stations were opened", u?.props["station_open.via"], "Via"),
      ],
    },
    {
      title: "Subscribers",
      blocks: n
        ? [
            { kind: "text", text: `${n.subscriptions.active} active subscriptions · weekly overview chosen by ${fmt(n.subscribers.digestPct, "%")} of active subscribers.` },
            counts("By collection type (now)", n.subscriptions.byTopic, "Type"),
            counts("By postcode (now, top 15)", n.subscriptions.byPlz, "PLZ"),
            counts("By station (now, top 10)", n.subscriptions.byStation, "Station"),
            counts("Active subscribers by language", n.subscribers.byLang, "Language"),
          ]
        : [{ kind: "text", text: "No subscriber data this week.", muted: true }],
    },
    {
      title: "Health",
      blocks: [
        bars("Map ready", u?.props["map_ready.within"], "Within"),
        bars("Load failures (client_error)", u?.props["client_error.where"], "Where"),
        bars("Use my location", u?.props["locate.outcome"], "Outcome"),
        bars("Devices", u?.top.device, "Device"),
        {
          kind: "table",
          title: "Emails",
          head: ["Kind", "Status", "Count"],
          rows: (n?.emails ?? []).map((e) => [e.kind, e.status, String(e.count)]),
          numeric: [false, false, true],
          empty: "No emails this week.",
        },
        ...(n
          ? [
              {
                kind: "text" as const,
                text: `Data import: ${n.ingest.runs} run(s) this week, ${n.ingest.failed} failed. Last run: ${n.ingest.lastStatus ?? "none"}${n.ingest.lastFinishedAt ? `, ${utc(n.ingest.lastFinishedAt)}` : ""}.`,
              },
            ]
          : []),
      ],
    },
  ];

  return {
    week: s.week,
    range: `${dayLabel(firstDay)} – ${dayLabel(lastDay)} ${lastDay.slice(0, 4)}`,
    meta: [
      `Sun ${dayLabel(firstDay)} 00:00 → Sat ${dayLabel(lastDay)} 24:00, Europe/Zurich · generated ${utc(s.generatedAt)}`,
      sources,
      "Visitor counts from Umami are approximate (cookieless); subscriber numbers from the database are exact.",
    ],
    draft:
      new Date(s.generatedAt).getTime() < new Date(s.endsAt).getTime()
        ? `Draft: collected ${utc(s.generatedAt)}, before the week ended. Numbers are partial; Sunday's collection replaces them.`
        : null,
    gaps: s.errors.map((e) => `${e.source}${e.call ? ` (${e.call})` : ""}: ${e.message}`),
    kpis,
    sections,
  };
}

const SPARKS = "▁▂▃▄▅▆▇█";

/** Unicode sparkline, oldest → newest; a gap for weeks without data. */
export function sparkline(values: (number | null)[]): string {
  const v = values.filter((x): x is number => x !== null);
  if (!v.length) return "";
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  return values.map((x) => (x === null ? " " : hi === lo ? SPARKS.at(3) : SPARKS.at(Math.round(((x - lo) / (hi - lo)) * 7)))).join("");
}

/** A bar of `width` cells for a 0–100 share (at least one cell when > 0). */
export function bar(pct: number, width: number, full = "█", empty = ""): string {
  const n = pct > 0 ? Math.max(1, Math.round((pct / 100) * width)) : 0;
  return full.repeat(n) + empty.repeat(Math.max(0, width - n));
}

export const arrow = (c: Change | null) => (!c ? "" : c.dir === "up" ? "▲" : c.dir === "down" ? "▼" : "=");
