import { getDb, hasDatabase } from "db";
import type { NextRequest } from "next/server";
import { parseSources, resolvePeriod, runWeeklySnapshot } from "@/lib/analytics/weekly/run";
import { umamiConfig } from "@/lib/analytics/weekly/umami-api";

/**
 * Weekly analytics snapshot (Vercel Cron, Sundays 03:00 UTC = 05:00 summer / 04:00 winter in
 * Zurich, see vercel.json; Vercel may start it any time within that hour). It must be done
 * before the Mac's report job (Sundays 07:00, scripts/weekly-local.sh) for the Sunday review:
 * collects last week (Sunday–Saturday, Europe/Zurich) from the Umami API and
 * our database into `weekly_metrics`. Collection only: the report and its
 * Notion export run on the Mac (`pnpm weekly-report --notion`), so this
 * project never holds a Notion token.
 * Requires `Authorization: Bearer $CRON_SECRET`.
 * Sources are collected and stored independently: by default the database
 * always, Umami only when its API is configured (UMAMI_API_URL + UMAMI_USERNAME /
 * UMAMI_PASSWORD, or UMAMI_API_KEY).
 * Every call writes one "[weekly-snapshot]" line to the Vercel logs: who called
 * (Vercel cron or manual), the outcome, and why it was refused if it was. A run only replaces the parts
 * it collected, so Neon data and separately imported Umami data coexist.
 *   ?week=2026-W40  re-run a given week (replaces the collected parts)
 *   ?sources=neon   only these sources (neon, umami, neon,umami or all)
 *   ?dryRun=1       collect and return, save nothing
 * Production backfill: curl -H "Authorization: Bearer $CRON_SECRET" "https://furtli.ch/api/cron/weekly-snapshot?week=2026-W40"
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TAG = "[weekly-snapshot]";

export async function GET(req: NextRequest) {
  const caller = (req.headers.get("user-agent") ?? "").startsWith("vercel-cron") ? "vercel-cron" : "manual";
  const started = Date.now();
  const sp = req.nextUrl.searchParams;
  console.log(`${TAG} start`, { caller, query: Object.fromEntries(sp) });

  const refuse = (status: number, error: string) => {
    console.error(`${TAG} refused`, { caller, status, error });
    return Response.json({ error }, { status });
  };
  const secret = process.env.CRON_SECRET;
  if (!secret) return refuse(503, "CRON_SECRET not configured in this Vercel project (Production environment)");
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return refuse(401, auth ? "Unauthorized: the Bearer token doesn't match CRON_SECRET" : "Unauthorized: no Authorization header");
  }
  if (!hasDatabase()) return refuse(503, "DATABASE_URL not configured");
  const umami = umamiConfig();
  let period, sources;
  try {
    period = resolvePeriod(sp.get("week"));
    sources = parseSources(sp.get("sources"), umami);
  } catch (e) {
    return refuse(400, e instanceof Error ? e.message : String(e));
  }
  try {
    const result = await runWeeklySnapshot({
      db: getDb(),
      period,
      umami,
      sources,
      dryRun: sp.get("dryRun") === "1",
    });
    const status = result.errors.length ? 207 : 200;
    console.log(`${TAG} done`, {
      caller,
      status,
      week: result.week,
      sources: result.sources,
      saved: result.saved,
      umamiConfigured: !!umami,
      gaps: result.errors.map((e) => `${e.source}${e.call ? ` (${e.call})` : ""}: ${e.message}`),
      summary: result.summary,
      ms: Date.now() - started,
    });
    return Response.json(result, { status });
  } catch (e) {
    console.error(`${TAG} failed`, { caller, week: period.week, error: e instanceof Error ? e.message : String(e), cause: (e as { cause?: unknown })?.cause });
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
