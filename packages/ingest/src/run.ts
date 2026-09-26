import { createHash } from "node:crypto";
import {
  and,
  between,
  collectionEvent,
  eq,
  ingestRun,
  inArray,
  sourceFile,
  station,
  sql,
  type Database,
  type EventTypeValue,
  type StationKindValue,
} from "db";
import { type Fetcher, listResources, readDatastore, readLayer } from "./fetcher";
import { buildMatcher, type MatchTier } from "./match";
import { parseCalendar, type CalendarRow } from "./parse/calendar";
import { IngestError } from "./parse/common";
import { parseStations, type ParsedStation } from "./parse/stations";
import { CALENDARS, CKAN_BASE, GEO_LAYERS, geoDatasetId, wfsUrl } from "./sources";

export interface IngestOptions {
  db: Database;
  fetcher: Fetcher;
  trigger: "cron" | "manual" | "test";
  /** "Today" (for choosing the years to load). Defaults to now. */
  now?: Date;
  /** Compute everything and report the diff, but roll back all writes. */
  dryRun?: boolean;
  log?: (msg: string) => void;
}

export interface DatasetSummary {
  dataset: string;
  year: number | null;
  rows: number;
  newFile: boolean;
  added: number;
  removed: number;
}

export interface IngestSummary {
  runId: number | null;
  dryRun: boolean;
  years: number[];
  stations: Record<StationKindValue, { total: number; added: number; deactivated: number }>;
  datasets: DatasetSummary[];
  matches: Record<MatchTier, number>;
  warnings: string[];
  changed: boolean;
}

interface RawFile {
  dataset: string;
  year: number | null;
  url: string;
  content: string;
  rowCount: number;
}

class DryRunRollback extends Error {}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Year in Zürich (so a run at 00:30 on 1 January already counts as the new year). */
function zurichYear(d: Date): number {
  return Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Zurich", year: "numeric" }).format(d));
}

/**
 * The whole pipeline. Everything is fetched, validated and matched before
 * the first write; all writes happen in one transaction. A failed run
 * therefore changes nothing (except its own row in ingest_run), and running
 * twice in a row changes nothing the second time.
 */
export async function runIngest(opts: IngestOptions): Promise<IngestSummary> {
  const { db, fetcher, trigger, dryRun = false } = opts;
  const log = opts.log ?? (() => {});
  const now = opts.now ?? new Date();
  const currentYear = zurichYear(now);

  const [run] = dryRun
    ? [null]
    : await db.insert(ingestRun).values({ trigger }).returning({ id: ingestRun.id });

  try {
    const summary = await collectAndLoad();
    if (run) {
      await db
        .update(ingestRun)
        .set({ status: "ok", finishedAt: new Date(), summary })
        .where(eq(ingestRun.id, run.id));
    }
    return summary;
  } catch (e) {
    if (run) {
      const err = e as IngestError;
      await db
        .update(ingestRun)
        .set({
          status: "failed",
          finishedAt: new Date(),
          error: err.message,
          summary: err.details === undefined ? null : { details: err.details },
        })
        .where(eq(ingestRun.id, run.id));
    }
    throw e;
  }

  async function collectAndLoad(): Promise<IngestSummary> {
    const warnings: string[] = [];
    const raws: RawFile[] = [];

    // ---- 1. Stations from the geo layers -----------------------------------
    const stations: ParsedStation[] = [];
    for (const g of GEO_LAYERS) {
      log(`geo: ${g.service}`);
      const body = await readLayer(fetcher, g);
      const parsed = parseStations(g.kind, body);
      stations.push(...parsed);
      raws.push({
        dataset: geoDatasetId(g),
        year: null,
        url: wfsUrl(g),
        content: JSON.stringify(body),
        rowCount: parsed.length,
      });
    }
    const stationIds = new Set(stations.map((s) => s.id));
    if (stationIds.size !== stations.length) throw new IngestError("Duplicate station ids across layers");

    // ---- 2. Calendars (current year and any later year already published) -
    const matchers = new Map<StationKindValue, ReturnType<typeof buildMatcher>>();
    const matchStats: Record<MatchTier, number> = { exact: 0, normalized: 0, "plz+place": 0, alias: 0 };
    const unmatched = new Map<string, Set<string>>();
    const calendarLoads: { type: EventTypeValue; year: number; dataset: string; rows: (CalendarRow & { stationId: string | null })[] }[] = [];
    const years = new Set<number>();

    for (const cal of CALENDARS) {
      const resources = (await listResources(fetcher, cal)).filter((r) => r.year !== null && r.year >= currentYear);
      if (!resources.some((r) => r.year === currentYear)) {
        throw new IngestError(`${cal.dataset}: no file for ${currentYear} published`);
      }
      for (const res of resources) {
        const year = res.year!;
        if (!res.datastoreActive) {
          throw new IngestError(`${cal.dataset} ${year}: DataStore not active for ${res.name}; cannot read it as JSON`);
        }
        log(`calendar: ${cal.dataset} ${year}`);
        const table = await readDatastore(fetcher, res.id);
        const rows = parseCalendar(cal, year, table);
        years.add(year);

        const withStations = rows.map((r) => {
          if (!cal.stationKind || !r.station) return { ...r, stationId: null };
          let m = matchers.get(cal.stationKind);
          if (!m) matchers.set(cal.stationKind, (m = buildMatcher(cal.stationKind, stations)));
          const hit = m.match(r.station);
          if (!hit) {
            if (!unmatched.has(cal.dataset)) unmatched.set(cal.dataset, new Set());
            unmatched.get(cal.dataset)!.add(r.station);
            return { ...r, stationId: null };
          }
          matchStats[hit.tier]++;
          return { ...r, stationId: hit.station.id };
        });

        calendarLoads.push({ type: cal.type, year, dataset: cal.dataset, rows: withStations });
        raws.push({
          dataset: cal.dataset,
          year,
          url: `${CKAN_BASE}/datastore_search?resource_id=${res.id}`,
          content: JSON.stringify({ resource: res.name, fields: table.fields, records: table.records }),
          rowCount: table.records.length,
        });
      }
    }

    if (unmatched.size) {
      const details = Object.fromEntries([...unmatched].map(([k, v]) => [k, [...v]]));
      throw new IngestError(
        `Calendar stations without a location: ${[...unmatched.values()].flatMap((v) => [...v]).join(" | ")}. ` +
          `Check them on the map and add an entry to STATION_ALIASES (packages/ingest/src/match.ts).`,
        details,
      );
    }

    // ---- 3. Sanity checks against the previous file of each dataset --------
    for (const r of raws) {
      const [prev] = await db
        .select({ rowCount: sourceFile.rowCount })
        .from(sourceFile)
        .where(
          and(
            eq(sourceFile.dataset, r.dataset),
            r.year === null ? sql`${sourceFile.year} is null` : eq(sourceFile.year, r.year),
          ),
        )
        .orderBy(sql`${sourceFile.fetchedAt} desc`)
        .limit(1);
      if (prev && r.rowCount < prev.rowCount * 0.7) {
        warnings.push(`${r.dataset}${r.year ? ` ${r.year}` : ""}: ${r.rowCount} rows, previously ${prev.rowCount}`);
      }
    }

    // ---- 4. Write everything in one transaction -----------------------------
    const stationSummary = Object.fromEntries(
      GEO_LAYERS.map((g) => [g.kind, { total: 0, added: 0, deactivated: 0 }]),
    ) as IngestSummary["stations"];
    const datasetSummaries: DatasetSummary[] = [];

    try {
      await db.transaction(async (tx) => {
        // 4a. raw files (deduplicated by content hash)
        const fileIds = new Map<string, { id: number; isNew: boolean }>();
        for (const r of raws) {
          const hash = sha256(r.content);
          const inserted = await tx
            .insert(sourceFile)
            .values({
              dataset: r.dataset,
              year: r.year,
              url: r.url,
              sha256: hash,
              bytes: Buffer.byteLength(r.content),
              rowCount: r.rowCount,
              content: r.content,
            })
            .onConflictDoNothing({ target: [sourceFile.dataset, sourceFile.sha256] })
            .returning({ id: sourceFile.id });
          const id =
            inserted[0]?.id ??
            (
              await tx
                .select({ id: sourceFile.id })
                .from(sourceFile)
                .where(and(eq(sourceFile.dataset, r.dataset), eq(sourceFile.sha256, hash)))
            )[0].id;
          fileIds.set(`${r.dataset}|${r.year ?? ""}`, { id, isNew: inserted.length > 0 });
        }

        // 4b. stations: upsert, then deactivate those that vanished
        const existing = await tx.select({ id: station.id, kind: station.kind, active: station.active }).from(station);
        const existingIds = new Set(existing.filter((s) => s.active).map((s) => s.id));
        for (const g of GEO_LAYERS) {
          const fileId = fileIds.get(`${geoDatasetId(g)}|`)!.id;
          const ofKind = stations.filter((s) => s.kind === g.kind);
          for (const s of ofKind) {
            const { matchNames: _m, ...row } = s;
            await tx
              .insert(station)
              .values({ ...row, active: true, sourceFileId: fileId, updatedAt: new Date() })
              .onConflictDoUpdate({
                target: station.id,
                set: {
                  kind: row.kind,
                  name: row.name,
                  address: row.address,
                  plz: row.plz,
                  kreis: row.kreis,
                  lng: row.lng,
                  lat: row.lat,
                  materials: row.materials,
                  hours: row.hours,
                  sourcePoiId: row.sourcePoiId,
                  sourceName: row.sourceName,
                  active: true,
                  sourceFileId: fileId,
                  updatedAt: new Date(),
                },
              });
          }
          const gone = existing.filter((e) => e.kind === g.kind && e.active && !stationIds.has(e.id)).map((e) => e.id);
          if (gone.length) {
            await tx.update(station).set({ active: false, updatedAt: new Date() }).where(inArray(station.id, gone));
          }
          stationSummary[g.kind] = {
            total: ofKind.length,
            added: ofKind.filter((s) => !existingIds.has(s.id)).length,
            deactivated: gone.length,
          };
        }

        // 4c. collection events: diff per (type, year)
        for (const c of calendarLoads) {
          const file = fileIds.get(`${c.dataset}|${c.year}`)!;
          const current = await tx
            .select({
              id: collectionEvent.id,
              plz: collectionEvent.plz,
              date: collectionEvent.date,
              stationId: collectionEvent.stationId,
            })
            .from(collectionEvent)
            .where(
              and(
                eq(collectionEvent.type, c.type),
                between(collectionEvent.date, `${c.year}-01-01`, `${c.year}-12-31`),
              ),
            );
          const key = (r: { plz: string; date: string; stationId: string | null }) =>
            `${r.plz}|${r.date}|${r.stationId ?? ""}`;
          const wanted = new Map(c.rows.map((r) => [key(r), r]));
          const have = new Map(current.map((r) => [key(r), r]));

          const toDelete = current.filter((r) => !wanted.has(key(r))).map((r) => r.id);
          const toInsert = c.rows.filter((r) => !have.has(key(r)));
          for (let i = 0; i < toDelete.length; i += 1000) {
            await tx.delete(collectionEvent).where(inArray(collectionEvent.id, toDelete.slice(i, i + 1000)));
          }
          for (let i = 0; i < toInsert.length; i += 1000) {
            await tx.insert(collectionEvent).values(
              toInsert.slice(i, i + 1000).map((r) => ({
                type: c.type,
                plz: r.plz,
                date: r.date,
                stationId: r.stationId,
                sourceFileId: file.id,
              })),
            );
          }
          datasetSummaries.push({
            dataset: c.dataset,
            year: c.year,
            rows: c.rows.length,
            newFile: file.isNew,
            added: toInsert.length,
            removed: toDelete.length,
          });
        }

        if (dryRun) throw new DryRunRollback();
      });
    } catch (e) {
      if (!(e instanceof DryRunRollback)) throw e;
    }

    const changed =
      datasetSummaries.some((d) => d.added || d.removed) ||
      Object.values(stationSummary).some((s) => s.added || s.deactivated);

    return {
      runId: run?.id ?? null,
      dryRun,
      years: [...years].sort(),
      stations: stationSummary,
      datasets: datasetSummaries,
      matches: matchStats,
      warnings,
      changed,
    };
  }
}
