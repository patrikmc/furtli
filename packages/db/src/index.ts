export { createDb, getDb, closeDb, hasDatabase, type Database } from "./client";
export * from "./schema";

// Re-exported so packages using the database never need `drizzle-orm` as a
// direct dependency of their own — one place owns the ORM version.
export {
  eq,
  and,
  or,
  desc,
  asc,
  ne,
  gte,
  lt,
  lte,
  between,
  isNull,
  isNotNull,
  inArray,
  notInArray,
  sql,
  count,
  avg,
  sum,
  max,
} from "drizzle-orm";
