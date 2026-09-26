import type { NearbyItem } from "geo";
import type { StationFeature } from "./types";

export interface StationPoint {
  lng: number;
  lat: number;
  f: StationFeature;
}
export type StationResult = NearbyItem<StationPoint>;

export interface Group<T> {
  band: number;
  items: T[];
}

export interface DateRow {
  date: string;
  result: StationResult;
}

export function toPoints(features: readonly StationFeature[]): StationPoint[] {
  return features.map((f) => ({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], f }));
}

function groupByBand<T>(items: T[], band: (t: T) => number): Group<T>[] {
  const map = new Map<number, T[]>();
  for (const it of items) {
    const b = band(it);
    map.set(b, [...(map.get(b) ?? []), it]);
  }
  return [...map.entries()].sort(([a], [b]) => a - b).map(([band, items]) => ({ band, items }));
}

/** Places grouped by distance band, nearest first within each band. */
export function groupPlaces(results: StationResult[]): Group<StationResult>[] {
  return groupByBand([...results].sort((a, b) => a.distance - b.distance), (r) => r.band);
}

/**
 * Upcoming dates (today or later) of the stations in the results, grouped
 * by distance band, soonest first within each band.
 */
export function groupDates(results: StationResult[], today: string): Group<DateRow>[] {
  const rows: DateRow[] = results.flatMap((result) =>
    (result.item.f.properties.nextDates ?? []).filter((d) => d >= today).map((date) => ({ date, result })),
  );
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.result.distance - b.result.distance);
  return groupByBand(rows, (r) => r.result.band);
}

/** Today in Zürich as YYYY-MM-DD. */
export function todayZurich(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(now);
}
