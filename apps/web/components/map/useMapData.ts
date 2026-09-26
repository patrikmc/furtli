"use client";

import { useEffect, useState } from "react";
import { type Areas, loadAreas } from "@/lib/geo/areas";
import { getStations } from "@/lib/geo/stations";
import type { StationCollection } from "@/lib/geo/types";

/** Loads stations (via getStations → /api/stations) and the Kreis/postcode outlines once. */
export function useMapData() {
  const [stations, setStations] = useState<StationCollection | null>(null);
  const [areas, setAreas] = useState<Areas | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([getStations(ctrl.signal), loadAreas()])
      .then(([s, a]) => {
        setStations(s);
        setAreas(a);
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(String(e?.message ?? e));
      });
    return () => ctrl.abort();
  }, []);

  return { stations, areas, kreise: areas?.kreise ?? null, error };
}
