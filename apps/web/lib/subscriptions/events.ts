import { and, asc, collectionEvent, eq, gte, lte, station, type Database } from "db";
import { timeWindow } from "@/lib/geo/kinds";
import type { StationKind } from "@/lib/geo/types";
import type { PlanEvent } from "./plan";

/** All collection dates from `from` to `to` (inclusive), with station name/address/time. */
export async function loadPlanEvents(db: Database, from: string, to: string): Promise<PlanEvent[]> {
  const rows = await db
    .select({
      type: collectionEvent.type,
      plz: collectionEvent.plz,
      date: collectionEvent.date,
      stationId: collectionEvent.stationId,
      stationName: station.name,
      address: station.address,
      kind: station.kind,
      hours: station.hours,
    })
    .from(collectionEvent)
    .leftJoin(station, eq(collectionEvent.stationId, station.id))
    .where(and(gte(collectionEvent.date, from), lte(collectionEvent.date, to)))
    .orderBy(asc(collectionEvent.date));
  return rows.map((r) => ({
    type: r.type,
    plz: r.plz,
    date: r.date,
    stationId: r.stationId,
    stationName: r.stationName,
    address: r.address,
    time: r.kind ? timeWindow(r.kind as StationKind, r.hours as Record<string, string> | null, r.date) : null,
  }));
}
