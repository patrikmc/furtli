import { timingSafeEqual } from "node:crypto";
import { getDb, hasDatabase } from "db";
import type { NextRequest } from "next/server";
import { buildReport } from "@/lib/analytics/weekly/run";
import { latestSnapshot } from "@/lib/analytics/weekly/snapshot";

/**
 * The stored weekly report. Aggregates only (no personal data), so it has its
 * own secret, separate from ADMIN_SECRET.
 *   GET /api/internal/weekly-report                 latest week, Markdown
 *   GET /api/internal/weekly-report?week=2026-W40   that week
 *   &format=json                                    snapshot + history + summary + markdown
 *   &format=text                                    plain-text terminal layout (no colour)
 * Requires `Authorization: Bearer $REPORT_SECRET`.
 */
export const dynamic = "force-dynamic";

function authorized(req: NextRequest, secret: string): boolean {
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: NextRequest) {
  const secret = process.env.REPORT_SECRET;
  if (!secret) return Response.json({ error: "REPORT_SECRET not configured" }, { status: 503 });
  if (!authorized(req, secret)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDatabase()) return Response.json({ error: "DATABASE_URL not configured" }, { status: 503 });

  const db = getDb();
  const sp = req.nextUrl.searchParams;
  const week = sp.get("week") ?? (await latestSnapshot(db))?.week;
  if (!week) return Response.json({ error: "No weekly snapshot stored yet" }, { status: 404 });
  let report;
  try {
    report = await buildReport(db, week);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  if (!report) return Response.json({ error: `No snapshot for ${week}` }, { status: 404 });

  const headers = { "Cache-Control": "no-store" };
  const { terminal, ...data } = report;
  if (sp.get("format") === "json") return Response.json(data, { headers });
  if (sp.get("format") === "text") return new Response(terminal({ color: false, width: 100 }), { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(report.markdown, { headers: { ...headers, "Content-Type": "text/markdown; charset=utf-8" } });
}
