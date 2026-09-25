"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";

import { KREISE_URL, getStations } from "@/lib/geo/stations";
import type { InitialView } from "./ZurichMap";
import { ZH_CENTER, kreisForPoint } from "@/lib/geo/kreis";
import { STATION_KINDS, type KreisCollection, type KreisFeature, type StationCollection, type StationKind } from "@/lib/geo/types";
import { DEV_STYLE_OPTIONS, MAP_STYLE_URL } from "@/lib/map-config";
import { reducedMotion } from "@/lib/motion";
import { LocateButton, type LocateResult } from "./LocateButton";
import { StationSheet } from "./StationSheet";
import { TypeFilterChips } from "./TypeFilterChips";

// MapLibre needs `window`, so the map itself never renders on the server.
const ZurichMap = dynamic(() => import("./ZurichMap"), { ssr: false });

interface Props {
  initialKreis: number | null;
  initialStationId: string | null;
}

export default function MapShell({ initialKreis, initialStationId }: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [styleUrl, setStyleUrl] = useState(MAP_STYLE_URL);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const [allStations, setAllStations] = useState<StationCollection | null>(null);
  const [kreise, setKreise] = useState<KreisCollection | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  const [kinds, setKinds] = useState<StationKind[]>([...STATION_KINDS]);
  const [kreis, setKreis] = useState<number | null>(initialKreis);
  const [stationId, setStationId] = useState<string | null>(initialStationId);
  const [userLocation, setUserLocation] = useState<LocateResult | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  // ---- data ---------------------------------------------------------------
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      getStations(ctrl.signal),
      fetch(KREISE_URL, { signal: ctrl.signal }).then((r) => r.json() as Promise<KreisCollection>),
    ])
      .then(([s, k]) => {
        setAllStations(s);
        setKreise(k);
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setDataError(String(e?.message ?? e));
      });
    return () => ctrl.abort();
  }, []);

  const stations = useMemo<StationCollection | null>(
    () =>
      allStations && {
        type: "FeatureCollection",
        features: allStations.features.filter((f) => kinds.includes(f.properties.kind)),
      },
    [allStations, kinds],
  );

  const selectedStation = useMemo(
    () => allStations?.features.find((f) => f.properties.id === stationId) ?? null,
    [allStations, stationId],
  );
  const hasPlaceholders = allStations?.features.some((f) => f.properties.placeholder) ?? false;

  // ---- URL state: /?kreis=4&station=mrh-stauffacher -----------------------
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (kreis) params.set("kreis", String(kreis));
    else params.delete("kreis");
    if (stationId) params.set("station", stationId);
    else params.delete("station");
    const qs = params.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    // Next.js integrates native replaceState with its router, without a server round trip.
    window.history.replaceState(null, "", url);
  }, [kreis, stationId]);

  // ---- camera ---------------------------------------------------------------
  const flyTo = useCallback((lng: number, lat: number, zoom: number) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: reducedMotion() ? 0 : 900 });
  }, []);

  // Deep link (?station= / ?kreis=): computed once, before the map mounts,
  // so the first frame already shows the right place (no post-load jump).
  // allStations/kreise are set once and the initial* props never change,
  // so this is computed exactly once.
  const initialView = useMemo<InitialView | null>(() => {
    if (!allStations || !kreise) return null;
    const station = allStations.features.find((f) => f.properties.id === initialStationId);
    const kreisFeature = kreise.features.find((k) => k.properties.kreis === initialKreis);
    if (station) {
      const [longitude, latitude] = station.geometry.coordinates;
      return { longitude, latitude, zoom: 15 };
    }
    if (kreisFeature) return { bounds: bbox(kreisFeature), fitBoundsOptions: { padding: panelPadding() } };
    return { ...ZH_CENTER, zoom: 12 };
  }, [allStations, kreise, initialStationId, initialKreis]);

  // ---- handlers -------------------------------------------------------------
  const selectStation = useCallback(
    (id: string) => {
      const f = allStations?.features.find((s) => s.properties.id === id);
      if (!f) return;
      setStationId(id);
      setKreis(f.properties.kreis);
      const [lng, lat] = f.geometry.coordinates;
      const zoom = Math.max(mapRef.current?.getZoom() ?? 12, 14.5);
      flyTo(lng, lat, zoom);
    },
    [allStations, flyTo],
  );

  const selectKreis = useCallback((n: number | null) => {
    setStationId(null);
    setKreis(n);
  }, []);

  const onLocate = useCallback(
    ({ lng, lat }: LocateResult) => {
      setUserLocation({ lng, lat });
      const k = kreise ? kreisForPoint(lng, lat, kreise) : null;
      if (k === null) {
        setHint("Du bist ausserhalb der Stadt Zürich.");
        return;
      }
      setStationId(null);
      setKreis(k);
      flyTo(lng, lat, 14);
    },
    [kreise, flyTo],
  );

  const toggleKind = useCallback((k: StationKind) => {
    setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }, []);

  const closeSheet = useCallback(() => {
    setStationId(null);
    setKreis(null);
  }, []);

  const kreisStations = useMemo(
    () =>
      kreis && stations
        ? stations.features
            .filter((f) => f.properties.kreis === kreis)
            .sort((a, b) => (a.properties.nextDates?.[0] ?? "9").localeCompare(b.properties.nextDates?.[0] ?? "9"))
        : [],
    [kreis, stations],
  );

  // ---- render ---------------------------------------------------------------
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#E9ECE8]">
      {initialView && (
      <ZurichMap
        mapRef={mapRef}
        initialView={initialView}
        styleUrl={styleUrl}
        kreise={kreise}
        stations={stations}
        activeKreis={kreis}
        selectedStationId={stationId}
        userLocation={userLocation}
        onSelectStation={selectStation}
        onSelectKreis={selectKreis}
        onLoad={() => setMapReady(true)}
        onError={(m) => setMapError(m)}
      />
      )}

      {/* Top bar: brand, sample-data badge, filters */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 bg-gradient-to-b from-paper/95 via-paper/70 to-transparent px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4">
        <div className="flex items-center gap-2">
          <span className="pointer-events-auto font-display text-2xl font-extrabold tracking-tight text-ink">
            furtli<span className="text-orange">.</span>
          </span>
          {hasPlaceholders && (
            <span
              data-testid="sample-badge"
              className="rounded-full bg-sun px-2.5 py-0.5 text-xs font-bold text-ink"
              title="Die angezeigten Stationen und Termine sind Platzhalter."
            >
              Beispieldaten
            </span>
          )}
          {process.env.NODE_ENV === "development" && (
            <select
              aria-label="Kartenstil (nur Entwicklung)"
              value={styleUrl}
              onChange={(e) => setStyleUrl(e.target.value)}
              className="pointer-events-auto ml-auto max-w-40 rounded-lg border border-ink/15 bg-white px-2 py-1 text-xs text-ink"
            >
              {!DEV_STYLE_OPTIONS.some((o) => o.url === MAP_STYLE_URL) && (
                <option value={MAP_STYLE_URL}>.env style</option>
              )}
              {DEV_STYLE_OPTIONS.map((o) => (
                <option key={o.url} value={o.url}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>
        <TypeFilterChips active={kinds} onToggle={toggleKind} />
      </header>

      <LocateButton onLocate={onLocate} hint={hint} setHint={setHint} />

      {selectedStation ? (
        <StationSheet mode="station" station={selectedStation} onClose={closeSheet} />
      ) : kreis ? (
        <StationSheet
          mode="kreis"
          kreis={kreis}
          stations={kreisStations}
          onSelectStation={selectStation}
          onClose={closeSheet}
        />
      ) : null}

      {/* Loading skeleton / errors (the style is fetched client-side and can be slow) */}
      {!mapReady && !mapError && (
        <div className="absolute inset-0 z-0 grid place-items-center" aria-live="polite">
          <p className="animate-pulse rounded-full bg-white/80 px-4 py-2 text-sm text-ink/70">Karte lädt …</p>
        </div>
      )}
      {/* Individual tile errors are normal; only surface a failure to load the style itself. */}
      {((mapError && !mapReady) || dataError) && (
        <p
          role="alert"
          className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-xl bg-ink px-4 py-2 text-sm text-white"
        >
          {dataError ? "Stationen konnten nicht geladen werden." : "Die Karte konnte nicht vollständig geladen werden."}
        </p>
      )}
    </div>
  );
}

/** Keep the framed Kreis clear of the top bar and the sheet/side panel. */
function panelPadding() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return w >= 768
    ? { top: 130, left: 430, right: 60, bottom: 40 }
    : { top: 130, left: 20, right: 20, bottom: Math.round(h * 0.45) };
}

function bbox(f: KreisFeature): [number, number, number, number] {
  const coords = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates).flat(2);
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}
