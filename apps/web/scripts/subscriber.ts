import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
import { closeDb, getDb, hasDatabase } from "db";
import { formatReport, subscriberReport } from "@/lib/subscriptions/admin";

/**
 * Show everything one address has subscribed to.
 *
 *   pnpm subscriber anna@example.ch            (local database, from .env)
 *   pnpm subscriber anna@example.ch --json
 *   DATABASE_URL=<neon url> pnpm subscriber anna@example.ch
 *
 * Read-only. Prints the account, every subscription (confirmed and pending),
 * the upcoming dates they'll be emailed about, attribution and the email log.
 */
async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const email = args.find((a) => !a.startsWith("--"));
  if (!email) {
    console.error("Usage: pnpm subscriber <email> [--json]");
    process.exit(2);
  }
  if (!hasDatabase()) throw new Error("DATABASE_URL is not set.");
  const report = await subscriberReport(getDb(), email);
  if (!report) {
    console.error(`No subscriber with the address ${email.trim().toLowerCase()}.`);
    process.exitCode = 1;
    return;
  }
  console.log(args.includes("--json") ? JSON.stringify(report, null, 2) : formatReport(report));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
