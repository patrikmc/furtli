export { db } from "./client";
export * from "./schema";

// Re-exported so apps consuming this package never need `drizzle-orm` as a
// direct dependency of their own — one place owns the ORM version.
export {
  eq,
  and,
  or,
  desc,
  asc,
  ne,
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
