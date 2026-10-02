import { getDb, hasDatabase } from "db";
import type { NextRequest } from "next/server";
import { parseSources, resolvePeriod, runWeeklySnapshot } from "@/lib/analytics/weekly/run";
import { umamiConfig } from "@/lib/analytics/weekly/umami-api";

/**
 * Weekly analytics snapshot (Vercel Cron, Sunday morning, see vercel.json):
 * collects last week (Sunday–Saturday, Europe/Zurich) from the Umami API and
 * our database into `weekly_metrics`. Collection only: the report and its
 * Notion export run on the Mac (`pnpm weekly-report --notion`), so this
 * project never holds a Notion token.
 * Requires `Authorization: Bearer $CRON_SECRET`.
 * Sources are collected and stored independently: by default the database
 * always, Umami only when UMAMI_API_KEY is set. A run only replaces the parts
 * it collected, so Neon data and separately imported Umami data coexist.
 *   ?week=2026-W40  re-run a given week (replaces the collected parts)
 *   ?sources=neon   only these sources (neon, umami, neon,umami or all)
 *   ?dryRun=1       collect and return, save nothing
 * Production backfill: curl -H "Authorization: Bearer $CRON_SECRET" "https://furtli.ch/api/cron/weekly-snapshot?week=2026-W40"
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasDatabase()) return Response.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  const sp = req.nextUrl.searchParams;
  const umami = umamiConfig();
  let period, sources;
  try {
    period = resolvePeriod(sp.get("week"));
    sources = parseSources(sp.get("sources"), umami);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  try {
    const result = await runWeeklySnapshot({
      db: getDb(),
      period,
      umami,
      sources,
      dryRun: sp.get("dryRun") === "1",
    });
    if (result.errors.length) console.warn("Weekly snapshot has data gaps", result.week, result.errors);
    return Response.json(result, { status: result.errors.length ? 207 : 200 });
  } catch (e) {
    console.error("Weekly snapshot failed", e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
