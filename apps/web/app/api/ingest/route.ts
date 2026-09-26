import { getDb, hasDatabase } from "db";
import { HttpFetcher, IngestError, runIngest } from "ingest";
import type { NextRequest } from "next/server";

/**
 * Manual trigger for the ingest (fetch Open Data Zürich, validate, load).
 * The weekly Vercel Cron is switched off for now; this endpoint will be
 * reworked with the fetch/load split. Callers must send
 * `Authorization: Bearer $CRON_SECRET`; without the secret
 * configured this endpoint refuses to run at all.
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

  try {
    const summary = await runIngest({
      db: getDb(),
      fetcher: new HttpFetcher(),
      trigger: "cron",
      dryRun: req.nextUrl.searchParams.get("dryRun") === "1",
    });
    return Response.json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Ingest failed:", message);
    return Response.json(
      { error: message, details: e instanceof IngestError ? e.details : undefined },
      { status: e instanceof IngestError ? 422 : 500 },
    );
  }
}
