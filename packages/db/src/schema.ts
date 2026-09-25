/**
 * Database schema for the recycling map.
 *
 * Intentionally empty in step 1: the map view reads a static seed file
 * (apps/web/public/geo/stations.seed.geojson) through getStations(), so
 * nothing touches Postgres yet. Step 2 (the ingestion pipeline) adds the
 * `stations` and `collection_dates` tables here, shaped after
 * apps/web/lib/geo/types.ts, and generates a fresh 0000 migration.
 *
 * The old quiz schema and its migration were moved to _to_delete/.
 */
export {};
