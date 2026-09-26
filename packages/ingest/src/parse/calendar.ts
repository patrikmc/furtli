import { z } from "zod";
import type { CalendarSource } from "../sources";
import { IngestError, normalizePlz } from "./common";

export interface CalendarRow {
  plz: string;
  date: string;
  /** Raw station name, for station-based calendars. */
  station?: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const rowSchema = z.object({
  PLZ: z.union([z.string(), z.number()]),
  Abholdatum: z.string(),
  Station: z.string().optional(),
});

function checkDate(s: string, year: number): string {
  const m = ISO_DATE.exec(s.trim());
  if (!m) throw new IngestError(`Invalid date ${JSON.stringify(s)}`);
  const d = new Date(`${m[0]}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== m[0]) {
    throw new IngestError(`Invalid date ${JSON.stringify(s)}`);
  }
  if (Number(m[1]) !== year) throw new IngestError(`Date ${m[0]} is outside the file's year ${year}`);
  return m[0];
}

/**
 * Validates one DataStore table against the expected columns and turns it
 * into normalised rows. Fails loudly on a changed header, a bad date or a
 * bad postcode: a silent partial load would be worse than no load.
 */
export function parseCalendar(
  cal: CalendarSource,
  year: number,
  table: { fields: string[]; records: Record<string, unknown>[] },
): CalendarRow[] {
  const fields = table.fields.filter((f) => f !== "_id");
  const missing = cal.fields.filter((f) => !fields.includes(f));
  const extra = fields.filter((f) => !cal.fields.includes(f));
  if (missing.length || extra.length) {
    throw new IngestError(
      `${cal.dataset} ${year}: columns changed (missing: ${missing.join(", ") || "–"}; new: ${extra.join(", ") || "–"})`,
    );
  }

  const rows: CalendarRow[] = [];
  const seen = new Set<string>();
  table.records.forEach((rec, i) => {
    const parsed = rowSchema.safeParse(rec);
    if (!parsed.success) throw new IngestError(`${cal.dataset} ${year}: row ${i + 1} is malformed`, rec);
    const r = parsed.data;
    let row: CalendarRow;
    try {
      row = { plz: normalizePlz(r.PLZ), date: checkDate(r.Abholdatum, year) };
    } catch (e) {
      throw new IngestError(`${cal.dataset} ${year}: row ${i + 1}: ${(e as Error).message}`, rec);
    }
    if (cal.stationKind) {
      const station = r.Station?.trim();
      if (!station) throw new IngestError(`${cal.dataset} ${year}: row ${i + 1} has no station`, rec);
      row.station = station;
    }
    const key = `${row.plz}|${row.date}|${row.station ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      rows.push(row);
    }
  });
  return rows;
}
