import { getDb, hasDatabase } from "db";
import type { NextRequest } from "next/server";
import { getMailer } from "@/lib/email/mailer";
import { runScheduledEmails } from "@/lib/subscriptions/scheduled";

/**
 * Daily email run (Vercel Cron, see vercel.json): tomorrow's reminders and,
 * on Sundays, the weekly overview. Requires `Authorization: Bearer $CRON_SECRET`.
 *   ?dryRun=1       plan only, send nothing
 *   ?forceDigest=1  include the weekly overview on any day (testing)
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
    const sp = req.nextUrl.searchParams;
    const summary = await runScheduledEmails(
      { db: getDb(), mailer: getMailer() },
      { dryRun: sp.get("dryRun") === "1", forceDigest: sp.get("forceDigest") === "1" },
    );
    if (summary.failed) console.error("Email run had failures", summary);
    return Response.json(summary, { status: summary.failed ? 207 : 200 });
  } catch (e) {
    console.error("Email run failed", e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
