import type { KreisCollection, PlzCollection } from "geo";

export interface Areas {
  kreise: KreisCollection;
  plz: PlzCollection;
}

/**
 * Kreis and postcode outlines (~110 KB), loaded as a separate chunk so they
 * don't weigh down the first paint. Cached after the first call.
 */
let pending: Promise<Areas> | null = null;
export function loadAreas(): Promise<Areas> {
  pending ??= import("geo/data").then((m) => ({ kreise: m.KREISE, plz: m.PLZ }));
  return pending;
}
