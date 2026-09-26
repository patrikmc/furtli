"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import {
  type Anchor,
  type NearbyMode,
  areaBounds,
  circlePolygon,
  distanceMeters,
  distanceToArea,
  kreisForPoint,
  nearby,
  resolveAnchor,
} from "geo";

import { type Radius, type SearchState, writeSearchParams } from "@/lib/geo/anchor";
import { toPoints, todayZurich } from "@/lib/geo/group";
import { ZH_CENTER } from "@/lib/geo/kreis";
import { STATION_KINDS, type PlzCalendar, type StationCollection, type StationKind } from "@/lib/geo/types";
import { DEFAULT_BASEMAP, allBasemaps, type Basemap } from "@/lib/map-config";
import { reducedMotion } from "@/lib/motion";
import { HintToast, LocateButton, LocateInline, type LocateResult, useLocate } from "./LocateButton";
import { NearbyPanel } from "./NearbyPanel";
import { PlacePicker } from "./PlacePicker";
import { StationSheet } from "./StationSheet";
import { TypeFilterChips } from "./TypeFilterChips";
import { useMapData } from "./useMapData";
import type { InitialView, MapPin } from "./ZurichMap";

// MapLibre needs `window`, so the map itself never renders on the server.
const ZurichMap = dynamic(() => import("./ZurichMap"), { ssr: false });

interface Props {
  /** Search location, scope and radius from the URL (?at= / ?plz= / ?kreis=, &scope=, &r=). */
  initialSearch: SearchState;
  initialStationId: string | null;
  /** The 24 city postcodes (for the picker). */
  cityPlz: readonly string[];
  /** Base map for this route; "/" uses the env default, /maptiler a MapTiler style. */
  basemap?: Basemap;
  /** Show which base map is active (on comparison routes). */
  showBasemapBadge?: boolean;
}

export default function MapShell({
  initialSearch,
  initialStationId,
  cityPlz,
  basemap = DEFAULT_BASEMAP,
  showBasemapBadge = false,
}: Props) {
  const mapRef = useRef<MapRef | null>(null);
  // Dev style switcher overrides the route's base map locally.
  const [devBasemap, setDevBasemap] = useState<Basemap | null>(null);
  const active = devBasemap ?? basemap;
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const { stations: allStations, areas, error: dataError } = useMapData();

  const [search, setSearch] = useState<SearchState>(initialSearch);
  const [stationId, setStationId] = useState<string | null>(initialStationId);
  const [kinds, setKinds] = useState<StationKind[]>([...STATION_KINDS]);
  const [hint, setHint] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<PlzCalendar | null>(null);
  const today = useMemo(() => todayZurich(), []);

  // ---- derived data -----------------------------------------------------------
  const stations = useMemo<StationCollection | null>(
    () =>
      allStations && {
        type: "FeatureCollection",
        features: allStations.features.filter((f) => kinds.includes(f.properties.kind)),
      },
    [allStations, kinds],
  );

  const resolved = useMemo(
    () => (search.anchor && areas ? resolveAnchor(search.anchor, areas.kreise, areas.plz) : null),
    [search.anchor, areas],
  );

  const results = useMemo(
    () => (resolved && stations ? nearby(toPoints(stations.features), resolved, search) : []),
    [resolved, stations, search],
  );

  const selectedStation = useMemo(
    () => allStations?.features.find((f) => f.properties.id === stationId) ?? null,
    [allStations, stationId],
  );
  const selectedDistance = useMemo(() => {
    if (!selectedStation || !resolved) return undefined;
    const [lng, lat] = selectedStation.geometry.coordinates;
    const a = resolved.anchor;
    return a.type === "point" ? distanceMeters(a, { lng, lat }) : distanceToArea({ lng, lat }, resolved.area!);
  }, [selectedStation, resolved]);

  const hasPlaceholders = allStations?.features.some((f) => f.properties.placeholder) ?? false;

  // Map overlays for the search
  const pin: MapPin | null =
    search.anchor?.type === "point"
      ? { lng: search.anchor.lng, lat: search.anchor.lat, source: search.anchor.source === "gps" ? "gps" : "map" }
      : null;
  const focusArea = resolved ? (resolved.area ?? (search.mode === "strict" ? resolved.strictArea : null)) : null;
  const radiusCircle = useMemo(
    () =>
      search.anchor?.type === "point" && search.mode === "nearby" ? circlePolygon(search.anchor, search.radius) : null,
    [search],
  );
  const highlightIds = useMemo(
    () => (resolved ? results.map((r) => r.item.f.properties.id) : null),
    [resolved, results],
  );

  // ---- kerbside dates for the anchor's postcode ----------------------------------
  const anchorPlz = resolved?.plz ?? null;
  useEffect(() => {
    if (!anchorPlz) return;
    const ctrl = new AbortController();
    fetch(`/api/calendar?plz=${anchorPlz}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<PlzCalendar>) : null))
      .then((c) => setCalendar(c && Object.keys(c.next).length ? c : null))
      .catch(() => {});
    return () => ctrl.abort();
  }, [anchorPlz]);
  const shownCalendar = calendar && calendar.plz === anchorPlz ? calendar : null;

  // ---- URL state ---------------------------------------------------------------------
  useEffect(() => {
    const params = writeSearchParams(new URLSearchParams(window.location.search), search);
    if (stationId) params.set("station", stationId);
    else params.delete("station");
    const qs = params.toString();
    // Next.js integrates native replaceState with its router, without a server round trip.
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [search, stationId]);

  // ---- camera -------------------------------------------------------------------------
  // Centre points in the part of the map the sheet/panel doesn't cover.
  const flyTo = useCallback((lng: number, lat: number, zoom: number) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom, padding: panelPadding(), duration: reducedMotion() ? 0 : 900 });
  }, []);

  // Deep link: computed once, before the map mounts, so the first frame already
  // shows the right place. stations/areas are set once, initial* never change.
  const initialView = useMemo<InitialView | null>(() => {
    if (!allStations || !areas) return null;
    const station = allStations.features.find((f) => f.properties.id === initialStationId);
    if (station) {
      const [longitude, latitude] = station.geometry.coordinates;
      return { longitude, latitude, zoom: 15, padding: panelPadding() };
    }
    const a = initialSearch.anchor;
    if (a?.type === "point") return { longitude: a.lng, latitude: a.lat, zoom: 14, padding: panelPadding() };
    if (a) {
      const r = resolveAnchor(a, areas.kreise, areas.plz);
      if (r?.area) return { bounds: areaBounds(r.area), fitBoundsOptions: { padding: panelPadding() } };
    }
    return { ...ZH_CENTER, zoom: 12 };
  }, [allStations, areas, initialStationId, initialSearch]);

  // ---- handlers ----------------------------------------------------------------------
  const setAnchor = useCallback((anchor: Anchor | null) => {
    setSearch((s) => ({ ...s, anchor }));
    setStationId(null);
    setHint(null);
  }, []);

  const pickPoint = useCallback(
    (lng: number, lat: number) => setAnchor({ type: "point", lng, lat, source: "map" }),
    [setAnchor],
  );

  const pickArea = useCallback(
    (a: Anchor) => {
      setAnchor(a);
      const r = areas && resolveAnchor(a, areas.kreise, areas.plz);
      if (r?.area) {
        const [w, s, e, n] = areaBounds(r.area);
        mapRef.current?.fitBounds(
          [
            [w, s],
            [e, n],
          ],
          { padding: panelPadding(), duration: reducedMotion() ? 0 : 900 },
        );
      }
    },
    [areas, setAnchor],
  );

  const onLocate = useCallback(
    ({ lng, lat }: LocateResult) => {
      if (areas && kreisForPoint(lng, lat, areas.kreise) === null) {
        setHint("Du bist ausserhalb der Stadt Zürich. Tippe auf die Karte, um einen Ort zu wählen.");
        return;
      }
      setAnchor({ type: "point", lng, lat, source: "gps" });
      flyTo(lng, lat, 14.5);
    },
    [areas, flyTo, setAnchor],
  );

  const selectStation = useCallback(
    (id: string) => {
      const f = allStations?.features.find((s) => s.properties.id === id);
      if (!f) return;
      setStationId(id);
      const [lng, lat] = f.geometry.coordinates;
      flyTo(lng, lat, Math.max(mapRef.current?.getZoom() ?? 12, 14.5));
    },
    [allStations, flyTo],
  );

  const toggleKind = useCallback((k: StationKind) => {
    setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }, []);

  const setMode = useCallback((mode: NearbyMode) => setSearch((s) => ({ ...s, mode })), []);
  const setRadius = useCallback((radius: Radius) => setSearch((s) => ({ ...s, radius, mode: "nearby" })), []);

  const { locate, busy: locating } = useLocate(onLocate, setHint);
  const picker = (
    <PlacePicker
      cityPlz={cityPlz}
      anchor={search.anchor}
      onPick={pickArea}
      locate={<LocateInline locate={locate} busy={locating} />}
      compact
    />
  );

  // ---- render -------------------------------------------------------------------------
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#E9ECE8]">
      {initialView && (
        <ZurichMap
          mapRef={mapRef}
          initialView={initialView}
          styleUrl={active.url}
          provider={active.provider}
          kreise={areas?.kreise ?? null}
          stations={stations}
          selectedStationId={stationId}
          onSelectStation={selectStation}
          onPickPoint={pickPoint}
          pin={pin}
          focusArea={focusArea}
          radiusCircle={radiusCircle}
          highlightIds={highlightIds}
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
          {showBasemapBadge && (
            <span data-testid="basemap-badge" className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-white">
              {active.label}
            </span>
          )}
          {process.env.NODE_ENV === "development" && <DevStylePicker active={active} onPick={setDevBasemap} />}
        </div>
        <TypeFilterChips active={kinds} onToggle={toggleKind} />
      </header>

      <LocateButton locate={locate} busy={locating} />
      <HintToast hint={hint} onDismiss={() => setHint(null)} />

      {selectedStation ? (
        <StationSheet
          station={selectedStation}
          distance={selectedDistance}
          anchorPlz={anchorPlz}
          onBack={resolved ? () => setStationId(null) : undefined}
          onClose={() => setStationId(null)}
        />
      ) : resolved ? (
        <NearbyPanel
          resolved={resolved}
          results={results}
          mode={search.mode}
          radius={search.radius}
          today={today}
          calendar={shownCalendar}
          picker={picker}
          onModeChange={setMode}
          onRadiusChange={setRadius}
          onSelectStation={selectStation}
          onClose={() => setAnchor(null)}
        />
      ) : (
        mapReady && (
          <div
            data-testid="start-card"
            className="pointer-events-auto absolute inset-x-3 bottom-3 z-20 rounded-3xl bg-paper px-4 py-3.5 shadow-[0_8px_30px_rgba(23,34,59,0.18)] md:inset-x-auto md:top-[7.5rem] md:bottom-auto md:left-4 md:w-[26rem]"
          >
            <p className="font-display text-lg leading-tight font-bold text-ink">Was gibt&apos;s in deiner Nähe?</p>
            <p className="mt-0.5 mb-2.5 text-sm text-ink/65">
              Tippe auf die Karte (z.&nbsp;B. bei dir zuhause), nutze deinen Standort oder wähle PLZ oder Kreis.
            </p>
            {picker}
          </div>
        )
      )}

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

/** Dev-only: switch base map in place, and jump to the comparison views. */
function DevStylePicker({ active, onPick }: { active: Basemap; onPick: (b: Basemap) => void }) {
  const options = allBasemaps();
  const list = options.some((o) => o.id === active.id) ? options : [active, ...options];
  return (
    <div className="pointer-events-auto ml-auto flex items-center gap-2">
      <select
        aria-label="Kartenstil (nur Entwicklung)"
        value={active.id}
        onChange={(e) => {
          const next = list.find((o) => o.id === e.target.value);
          if (next) onPick(next);
        }}
        className="max-w-40 rounded-lg border border-ink/15 bg-white px-2 py-1 text-xs text-ink"
      >
        {list.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <Link href="/compare" className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-ink shadow-sm">
        Vergleich
      </Link>
    </div>
  );
}

/** Keep a framed area or centred point clear of the top bar and the sheet/side panel. */
function panelPadding() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return w >= 768
    ? { top: 110, left: 450, right: 60, bottom: 40 }
    : { top: 120, left: 20, right: 20, bottom: Math.round(h * 0.55) };
}
