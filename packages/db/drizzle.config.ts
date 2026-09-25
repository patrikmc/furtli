// Migrations/DDL use a direct (unpooled) connection when available.
// Neon's pooled endpoint (PgBouncer, transaction mode) is for the app.
// Locally (Docker Postgres) only DATABASE_URL is set and is used as-is.

import { defineConfig } from "drizzle-kit";
import "dotenv/config";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL is not set — see .env.example");
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: url,
  },
  strict: true,
  verbose: true,
});
