import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// A single DATABASE_URL is the entire portability story: point it at local
// Docker Postgres, a Neon connection string, or a Supabase connection
// string, and nothing else in this file (or in any code that imports `db`)
// changes. That's deliberate — see docs/... in the template README for the
// Neon-vs-Supabase writeup this was built around.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill it " +
      "in (see the root README for local/Neon/Supabase connection strings).",
  );
}

// `prepare: false` is required for connection poolers that don't support
// prepared statements (Neon's pooled connection string, Supabase's pgbouncer
// pooler, and most serverless-friendly poolers). Harmless against a plain
// local Postgres too, so it's left on unconditionally rather than branching
// on environment.
export const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
