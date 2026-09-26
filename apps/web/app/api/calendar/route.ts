import { hasDatabase } from "db";
import { CITY_PLZ } from "geo/data";
import type { NextRequest } from "next/server";
import { loadPlzCalendar } from "@/lib/server/stations";

export const dynamic = "force-dynamic";

/** GET /api/calendar?plz=8004 → next paper/cardboard/organic/waste dates for that postcode. */
export async function GET(req: NextRequest) {
  const plz = req.nextUrl.searchParams.get("plz") ?? "";
  if (!CITY_PLZ.includes(plz)) return Response.json({ error: "Unknown postcode" }, { status: 400 });
  if (!hasDatabase()) return Response.json({ plz, next: {} }, { headers: { "X-Data-Source": "none" } });
  try {
    return Response.json(await loadPlzCalendar(plz), {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (e) {
    console.error("GET /api/calendar failed", e);
    return Response.json({ error: "Calendar unavailable" }, { status: 503 });
  }
}
