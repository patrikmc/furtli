import { timingSafeEqual } from "node:crypto";
import { getDb, hasDatabase } from "db";
import type { NextRequest } from "next/server";
import { formatReport, subscriberReport } from "@/lib/subscriptions/admin";

/**
 * Admin lookup: a subscriber's full subscription by email address.
 *   GET /api/internal/subscriber?email=anna@example.ch            → JSON
 *   GET /api/internal/subscriber?email=anna@example.ch&format=text → readable text
 * Requires `Authorization: Bearer $ADMIN_SECRET` (personal data: never the cron secret).
 */
export const dynamic = "force-dynamic";

function authorized(req: NextRequest, secret: string): boolean {
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return Response.json({ error: "ADMIN_SECRET not configured" }, { status: 503 });
  if (!authorized(req, secret)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDatabase()) return Response.json({ error: "DATABASE_URL not configured" }, { status: 503 });

  const email = req.nextUrl.searchParams.get("email")?.trim();
  if (!email) return Response.json({ error: "email is required" }, { status: 400 });
  const report = await subscriberReport(getDb(), email);
  if (!report) return Response.json({ error: "No subscriber with this email" }, { status: 404 });

  const headers = { "Cache-Control": "no-store" };
  if (req.nextUrl.searchParams.get("format") === "text") {
    return new Response(formatReport(report) + "\n", { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  }
  return Response.json(report, { headers });
}
