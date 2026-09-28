// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

/**
 * Migration 0002 moves each subscriber's single plz/station/topics into a
 * `subscription` row. Run the real migrations on data in the old shape.
 */
const dir = join(__dirname, "../../../../packages/db/migrations");
const files = readdirSync(dir).filter((x) => x.endsWith(".sql")).sort();

async function run(pg: PGlite, file: string) {
  for (const stmt of readFileSync(join(dir, file), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await pg.exec(stmt);
}

it("0002 carries existing subscriptions over, including an unconfirmed change", async () => {
  const pg = new PGlite();
  const i = files.findIndex((f) => f.startsWith("0002_"));
  for (const f of files.slice(0, i)) await run(pg, f);
  await pg.exec(`
    insert into source_file (dataset, url, sha256, bytes, row_count, content) values ('t','x','x',1,1,'{}');
    insert into station (id, kind, name, plz, lng, lat, source_poi_id, source_name) values ('mrh-a','mrh','Stauffacher','8004',8.5,47.3,'1','S');
    insert into subscriber (email, status, plz, station_id, topics, digest, unsubscribe_token, confirmed_at, pending_prefs) values
      ('active@x.ch', 'active', '8004', null, '{cardboard,mrh}', true, 'u1', now(),
        '{"lang":"en","plz":"8003","stationId":null,"topics":["paper"],"reminders":true,"digest":true}'),
      ('pending@x.ch', 'pending', null, 'mrh-a', '{mrh}', false, 'u2', null, null),
      ('gone@x.ch', 'unsubscribed', '8005', null, '{waste}', false, 'u3', now(), null);
  `);
  await run(pg, files[i]);
  const { rows } = await pg.query<{ email: string; plz: string | null; station_id: string | null; topics: string; pending_topics: string | null }>(`
    select s.email, t.plz, t.station_id, t.topics::text, t.pending_topics::text
    from subscription t join subscriber s on s.id = t.subscriber_id order by s.id, t.id`);
  expect(rows).toEqual([
    { email: "active@x.ch", plz: "8004", station_id: null, topics: "{cardboard,mrh}", pending_topics: null },
    { email: "active@x.ch", plz: "8003", station_id: null, topics: "{}", pending_topics: "{paper}" },
    { email: "pending@x.ch", plz: null, station_id: "mrh-a", topics: "{}", pending_topics: "{mrh}" },
    { email: "gone@x.ch", plz: "8005", station_id: null, topics: "{waste}", pending_topics: null },
  ]);
  const prefs = await pg.query<{ pending_prefs: unknown }>(`select pending_prefs from subscriber where email = 'active@x.ch'`);
  expect(prefs.rows[0].pending_prefs).toEqual({ lang: "en", reminders: true, digest: true });
});
