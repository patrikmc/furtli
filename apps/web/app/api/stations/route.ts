import { hasDatabase } from "db";
import seed from "@/lib/geo/data/stations.seed.json";
import { withCurated } from "@/lib/geo/curated";
import type { StationCollection } from "@/lib/geo/types";
import { loadStationsFromDb } from "@/lib/server/stations";

// Runs per request; Vercel's CDN caches the response for an hour (the data
// changes about once a year), so the database sees ~24 queries a day.
export const dynamic = "force-dynamic";

const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";

export async function GET() {
  if (!hasDatabase()) {
    // Local dev without a database: the hand-written sample stations.
    // Curated sites (private / neighbouring towns) are added in both cases.
    return Response.json(withCurated(seed as unknown as StationCollection), { headers: { "Cache-Control": "no-store", "X-Data-Source": "seed" } });
  }
  try {
    return Response.json(withCurated(await loadStationsFromDb()), { headers: { "Cache-Control": CACHE, "X-Data-Source": "db" } });
  } catch (e) {
    console.error("GET /api/stations failed", e);
    return Response.json({ error: "Stations unavailable" }, { status: 503 });
  }
}
