import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
import { closeDb, getDb, hasDatabase } from "db";
import { formatAttribution, loadAttributionRows, summarizeAttribution } from "@/lib/analytics/attribution-report";

/**
 * Which channels and posts brought subscribers (Saturday check).
 *
 *   pnpm attribution                 last 7 days, local database (.env)
 *   pnpm attribution --days 30
 *   pnpm attribution --json
 *   DATABASE_URL=<neon url> pnpm attribution
 *
 * Read-only; prints counts only, no email addresses.
 */
async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const i = args.indexOf("--days");
  const days = i >= 0 ? Number(args[i + 1]) : 7;
  if (!Number.isInteger(days) || days < 1) {
    console.error("Usage: pnpm attribution [--days N] [--json]");
    process.exit(2);
  }
  if (!hasDatabase()) throw new Error("DATABASE_URL is not set.");
  const report = summarizeAttribution(await loadAttributionRows(getDb()), new Date(), days);
  console.log(args.includes("--json") ? JSON.stringify(report, null, 2) : formatAttribution(report));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
