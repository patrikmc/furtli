import { afterAll, describe, expect, it } from "vitest";
import { collectionEvent, count, createDb, eq, ingestRun, sourceFile, station } from "db";
import { TEST_DATABASE_URL } from "db/test/test-db";
import { IngestError } from "./parse/common";
import { runIngest } from "./run";
import { FixtureFetcher, loadFixtures } from "./test/fixture-fetcher";

const db = createDb(TEST_DATABASE_URL, { max: 2 });
afterAll(() => db.$client.end());

const NOW = new Date("2026-09-26T10:00:00+02:00");
const ingest = (fetcher = new FixtureFetcher(), extra: { dryRun?: boolean; now?: Date } = {}) =>
  runIngest({ db, fetcher, trigger: "test", now: NOW, ...extra });

const countOf = async (t: typeof station | typeof collectionEvent | typeof sourceFile | typeof ingestRun) =>
  (await db.select({ n: count() }).from(t))[0].n;

// Fixture sizes: 37 MRH + 23 hazmat + 20 Sammelstellen + 2 Recyclinghöfe;
// events: MRH 36, hazmat 30, paper 26, cardboard 52, organic 53, waste 100.
const STATIONS = 82;
const EVENTS = 297;

describe("runIngest (fixtures → Postgres)", () => {
  it("loads stations, events and raw files, and logs the run", async () => {
    const s = await ingest();
    expect(s.changed).toBe(true);
    expect(s.years).toEqual([2026]);
    expect(s.stations.mrh).toEqual({ total: 37, added: 37, deactivated: 0 });
    expect(s.matches).toMatchObject({ "plz+place": expect.any(Number), alias: expect.any(Number) });
    expect(await countOf(station)).toBe(STATIONS);
    expect(await countOf(collectionEvent)).toBe(EVENTS);
    expect(await countOf(sourceFile)).toBe(10);

    const [run] = await db.select().from(ingestRun);
    expect(run).toMatchObject({ status: "ok", trigger: "test" });
    expect(run.finishedAt).not.toBeNull();

    // An MRH date is linked to its station, and the station has its Kreis.
    const [ev] = await db
      .select({ plz: collectionEvent.plz, kreis: station.kreis, name: station.name })
      .from(collectionEvent)
      .innerJoin(station, eq(collectionEvent.stationId, station.id))
      .where(eq(collectionEvent.stationId, "mrh-stauffacher-st-jakobstrasse-29"))
      .limit(1);
    expect(ev).toMatchObject({ kreis: 4, name: "Stauffacher" });
  });

  it("is idempotent: a second run changes nothing and stores no duplicate files", async () => {
    await ingest();
    const s = await ingest();
    expect(s.changed).toBe(false);
    expect(s.datasets.every((d) => d.added === 0 && d.removed === 0 && !d.newFile)).toBe(true);
    expect(await countOf(collectionEvent)).toBe(EVENTS);
    expect(await countOf(sourceFile)).toBe(10);
    expect(await countOf(ingestRun)).toBe(2);
  });

  it("applies city corrections: moved dates are replaced, the new file is kept", async () => {
    await ingest();
    const f = new FixtureFetcher();
    const recs = f.fx.calendars.papier.records;
    const moved = String(recs[0].Abholdatum);
    recs[0] = { ...recs[0], Abholdatum: "2026-12-30" };
    const s = await ingest(f);
    expect(s.datasets.find((d) => d.dataset === "entsorgungskalender_papier")).toMatchObject({
      added: 1,
      removed: 1,
      newFile: true,
    });
    const dates = (await db.select({ d: collectionEvent.date }).from(collectionEvent).where(eq(collectionEvent.type, "paper"))).map(
      (r) => r.d,
    );
    expect(dates).toContain("2026-12-30");
    expect(dates).not.toContain(moved);
    expect(await countOf(sourceFile)).toBe(11);
  });

  it("stops without writing when a calendar stop has no location", async () => {
    await ingest();
    const f = new FixtureFetcher();
    f.fx.calendars.mobiler_recyclinghof.records.push({ PLZ: "8004", Station: "8004, Neuland: Unbekanntplatz 1", Abholdatum: "2026-11-11" });
    await expect(ingest(f)).rejects.toThrow(/without a location: 8004, Neuland: Unbekanntplatz 1/);
    expect(await countOf(collectionEvent)).toBe(EVENTS);
    const runs = await db.select().from(ingestRun).orderBy(ingestRun.id);
    expect(runs.at(-1)).toMatchObject({ status: "failed" });
    expect(runs.at(-1)!.error).toMatch(/STATION_ALIASES/);
  });

  it("deactivates stations that disappear from the city's layer", async () => {
    await ingest();
    const fx = loadFixtures();
    const removed = fx.geo.recyclinghof.features.pop() as { properties: { name: string } };
    const s = await ingest(new FixtureFetcher(fx));
    expect(s.stations.recyclinghof).toMatchObject({ total: 1, deactivated: 1 });
    const inactive = await db.select().from(station).where(eq(station.active, false));
    expect(inactive.map((x) => x.name)).toEqual([removed.properties.name]);
  });

  it("dry run reports the diff but writes nothing", async () => {
    const s = await ingest(new FixtureFetcher(), { dryRun: true });
    expect(s.dryRun).toBe(true);
    expect(s.datasets.reduce((n, d) => n + d.added, 0)).toBe(EVENTS);
    expect(await countOf(collectionEvent)).toBe(0);
    expect(await countOf(station)).toBe(0);
    expect(await countOf(ingestRun)).toBe(0);
  });

  it("loads next year's file as soon as the city publishes it", async () => {
    const s = await ingest(new FixtureFetcher(undefined, [2026, 2027]));
    expect(s.years).toEqual([2026, 2027]);
    expect(await countOf(collectionEvent)).toBe(EVENTS * 2);
  });

  it("fails clearly if the current year's calendar is missing", async () => {
    await expect(ingest(new FixtureFetcher(undefined, [2025]))).rejects.toThrow(IngestError);
    await expect(ingest(new FixtureFetcher(undefined, [2025]))).rejects.toThrow(/no file for 2026/);
  });
});
