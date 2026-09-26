import "server-only";
import { and, asc, collectionEvent, eq, getDb, gte, inArray, isNotNull, station } from "db";
import type { PlzCalendar, StationCollection, StationFeature } from "@/lib/geo/types";
import { zurichToday } from "./today";

/**
 * All active stations with their next three dates and the postcodes the
 * city assigns them to. ~250 stations and a few hundred dates: one small
 * response the browser filters by distance itself (instant as the pin moves).
 */
export async function loadStationsFromDb(now = new Date()): Promise<StationCollection> {
  const db = getDb();
  const today = zurichToday(now);
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const [rows, upcoming, serves] = await Promise.all([
    db.select().from(station).where(eq(station.active, true)),
    db
      .selectDistinct({ stationId: collectionEvent.stationId, date: collectionEvent.date })
      .from(collectionEvent)
      .where(and(isNotNull(collectionEvent.stationId), gte(collectionEvent.date, today)))
      .orderBy(asc(collectionEvent.stationId), asc(collectionEvent.date)),
    db
      .selectDistinct({ stationId: collectionEvent.stationId, plz: collectionEvent.plz })
      .from(collectionEvent)
      .where(and(isNotNull(collectionEvent.stationId), gte(collectionEvent.date, yearStart))),
  ]);

  const dates = new Map<string, string[]>();
  for (const u of upcoming) {
    const list = dates.get(u.stationId!) ?? [];
    if (list.length < 3) list.push(u.date);
    dates.set(u.stationId!, list);
  }
  const plzs = new Map<string, string[]>();
  for (const s of serves) plzs.set(s.stationId!, [...(plzs.get(s.stationId!) ?? []), s.plz].sort());

  const features: StationFeature[] = rows.map((s) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [s.lng, s.lat] },
    properties: {
      id: s.id,
      kind: s.kind,
      name: s.name,
      address: s.address,
      kreis: s.kreis ?? 0,
      plz: s.plz,
      ...(s.materials?.length ? { materials: s.materials } : {}),
      ...(dates.has(s.id) ? { nextDates: dates.get(s.id) } : {}),
      ...(plzs.has(s.id) ? { servesPlz: plzs.get(s.id) } : {}),
      hours: (s.hours as Record<string, string> | null) ?? null,
    },
  }));
  return { type: "FeatureCollection", features };
}

const KERBSIDE = ["paper", "cardboard", "organic", "waste"] as const;

/** Next three kerbside dates per type for one postcode. */
export async function loadPlzCalendar(plz: string, now = new Date()): Promise<PlzCalendar> {
  const rows = await getDb()
    .select({ type: collectionEvent.type, date: collectionEvent.date })
    .from(collectionEvent)
    .where(
      and(
        eq(collectionEvent.plz, plz),
        inArray(collectionEvent.type, [...KERBSIDE]),
        gte(collectionEvent.date, zurichToday(now)),
      ),
    )
    .orderBy(asc(collectionEvent.date));
  const next: PlzCalendar["next"] = {};
  for (const r of rows) {
    const t = r.type as (typeof KERBSIDE)[number];
    const list = (next[t] ??= []);
    if (list.length < 3) list.push(r.date);
  }
  return { plz, next };
}
