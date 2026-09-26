"use client";

import { useEffect, useState } from "react";
import { KREISE_URL, getStations } from "@/lib/geo/stations";
import type { KreisCollection, StationCollection } from "@/lib/geo/types";

/** Loads stations (via getStations) and the Kreis polygons once. */
export function useMapData() {
  const [stations, setStations] = useState<StationCollection | null>(null);
  const [kreise, setKreise] = useState<KreisCollection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      getStations(ctrl.signal),
      fetch(KREISE_URL, { signal: ctrl.signal }).then((r) => r.json() as Promise<KreisCollection>),
    ])
      .then(([s, k]) => {
        setStations(s);
        setKreise(k);
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(String(e?.message ?? e));
      });
    return () => ctrl.abort();
  }, []);

  return { stations, kreise, error };
}
