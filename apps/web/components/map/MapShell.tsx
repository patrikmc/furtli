"use client";

import dynamic from "next/dynamic";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import {
  type Anchor,
  areaBounds,
  circlePolygon,
  distanceMeters,
  distanceToArea,
  nearby,
  resolveAnchor,
} from "geo";

import { LangToggle } from "@/components/i18n/LangToggle";
import { useLang } from "@/components/i18n/LangProvider";
import {
  countBucket,
  errorCode,
  metersBucket,
  msBucket,
  sinceLoadMs,
  track,
  trackError,
  trackFirstAction,
  trackOnce,
} from "@/lib/analytics/umami";
import { type Radius, type SearchState, writeSearchParams } from "@/lib/geo/anchor";
import { fitCamera } from "@/lib/geo/camera";
import { toPoints, todayZurich } from "@/lib/geo/group";
import { ZH_CENTER, inMapBounds } from "@/lib/geo/kreis";
import { STATION_KINDS, type Material, type PlzCalendar, type StationCollection, type StationKind } from "@/lib/geo/types";
import { DEFAULT_BASEMAP, allBasemaps, type Basemap } from "@/lib/map-config";
import { reducedMotion } from "@/lib/motion";
import { HintToast, LocateButton, LocateInline, type LocateResult, useLocate } from "./LocateButton";
import { NearbyPanel } from "./NearbyPanel";
import { PlacePicker } from "./PlacePicker";
import { SHEET_COMPACT } from "./Sheet";
import { StationSheet } from "./StationSheet";
import { TypeFilterChips } from "./TypeFilterChips";
import { useMapData } from "./useMapData";
import type { InitialView, MapErrorKind, MapPin, PreviewStation } from "./ZurichMap";

/** How a station card was opened (`station_open.via`). */
type OpenVia = "map" | "preview_marker" | "list" | "link";

// MapLibre needs `window`, so the map itself never renders on the server.
const ZurichMap = dynamic(() => import("./ZurichMap"), { ssr: false });

interface Props {
  /** Search location, scope and radius from the URL (?at= / ?plz= / ?kreis=, &scope=, &r=). */
  initialSearch: SearchState;
  initialStationId: string | null;
  /** The 24 city postcodes (for the picker). */
  cityPlz: readonly string[];
}

export default function MapShell({
  initialSearch,
  initialStationId,
  cityPlz,
}: Props) {
  const { lang, t } = useLang();
  const mapRef = useRef<MapRef | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);

  // The header's height depends on the screen width and language (the filter
  // chips wrap on phones). Everything placed below it (attribution, hint toast,
  // map padding) reads --header-h instead of a fixed offset.
  useEffect(() => {
    const header = headerRef.current;
    const root = rootRef.current;
    if (!header || !root) return;
    const update = () => root.style.setProperty("--header-h", `${Math.round(header.getBoundingClientRect().height)}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);
  // Dev style switcher overrides the default base map locally.
  const [devBasemap, setDevBasemap] = useState<Basemap | null>(null);
  const active = devBasemap ?? DEFAULT_BASEMAP;
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const readyRef = useRef(false);
  const tileErrors = useRef(0);

  const { stations: allStations, areas, error: dataError } = useMapData();

  const [search, setSearch] = useState<SearchState>(initialSearch);
  const [stationId, setStationId] = useState<string | null>(initialStationId);
  // First tap on a list row marks the station on the map; a second tap opens it.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [kinds, setKinds] = useState<StationKind[]>([...STATION_KINDS]);
  const [hint, setHint] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<PlzCalendar | null>(null);
  const today = useMemo(() => todayZurich(), []);

  // ---- derived data -----------------------------------------------------------
  const stations = useMemo<StationCollection | null>(
    () =>
      allStations && {
        type: "FeatureCollection",
        // A material narrows everything (map, lists) to the places that list it
        // (Sammelstellen and curated sites; the MRH and city Recyclinghöfe carry no list).
        features: allStations.features.filter(
          (f) =>
            kinds.includes(f.properties.kind) &&
            (!search.material || !!f.properties.materials?.includes(search.material)),
        ),
      },
    [allStations, kinds, search.material],
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

  const preview = useMemo<PreviewStation | null>(() => {
    const f = previewId ? allStations?.features.find((s) => s.properties.id === previewId) : null;
    if (!f) return null;
    const [lng, lat] = f.geometry.coordinates;
    return { id: f.properties.id, name: f.properties.name, kind: f.properties.kind, lng, lat };
  }, [allStations, previewId]);

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
      .then((r) => {
        if (r.ok) return r.json() as Promise<PlzCalendar>;
        trackError("calendar_api", r.status);
        return null;
      })
      .then((c) => setCalendar(c && Object.keys(c.next).length ? c : null))
      .catch(() => {
        if (!ctrl.signal.aborted) trackError("calendar_api");
      });
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
    setPreviewId(null);
    setHint(null);
  }, []);

  const pickPoint = useCallback(
    (lng: number, lat: number) => {
      setAnchor({ type: "point", lng, lat, source: "map" });
      trackFirstAction("search_map", { lang });
    },
    [setAnchor, lang],
  );

  const pickArea = useCallback(
    (a: Anchor) => {
      setAnchor(a);
      if (a.type === "plz" || a.type === "kreis") trackFirstAction(a.type === "plz" ? "search_plz" : "search_kreis", { lang });
      const r = areas && resolveAnchor(a, areas.kreise, areas.plz);
      const map = mapRef.current;
      if (r?.area && map) {
        // Frame the whole area in the part of the map the header and sheet leave
        // free (see fitCamera for why this isn't map.fitBounds).
        const padding = panelPadding();
        const box = map.getContainer();
        const { center, zoom } = fitCamera(areaBounds(r.area), box.clientWidth, box.clientHeight, padding);
        map.easeTo({ center, zoom, padding, duration: reducedMotion() ? 0 : 900 });
      }
    },
    [areas, setAnchor, lang],
  );

  const onLocate = useCallback(
    ({ lng, lat }: LocateResult) => {
      trackFirstAction("search_gps", { lang });
      // Anywhere on the map works (the city and the towns around it with listed sites).
      if (!inMapBounds(lng, lat)) {
        setHint(t.map.outsideCity);
        track("search_no_result", { by: "gps", reason: "outside_map" });
        return;
      }
      setAnchor({ type: "point", lng, lat, source: "gps" });
      flyTo(lng, lat, 14.5);
    },
    [flyTo, setAnchor, t, lang],
  );

  const selectStation = useCallback(
    (id: string, via: OpenVia) => {
      const f = allStations?.features.find((s) => s.properties.id === id);
      if (!f) return;
      setStationId(id);
      setPreviewId(null);
      track("station_open", stationProps(f.properties, via));
      trackFirstAction("station", { lang });
      const [lng, lat] = f.geometry.coordinates;
      flyTo(lng, lat, Math.max(mapRef.current?.getZoom() ?? 12, 14.5));
    },
    [allStations, flyTo, lang],
  );

  // First tap on a list row: mark the station on the map and, only if it's
  // outside the visible part of the map, zoom out just enough to show it next
  // to the search location. Second tap on the same row: open the station.
  const previewStation = useCallback(
    (id: string) => {
      if (id === previewId) return selectStation(id, "list");
      const f = allStations?.features.find((s) => s.properties.id === id);
      if (!f) return;
      setPreviewId(id);
      track("station_preview", { kind: f.properties.kind, station: f.properties.id, kreis: f.properties.kreis });
      const map = mapRef.current;
      if (!map) return;
      const [lng, lat] = f.geometry.coordinates;
      const pad = panelPadding();
      const box = map.getContainer();
      const w = box.clientWidth;
      const h = box.clientHeight;
      const m = 40; // keep the marker's ring clear of the edges
      const p = map.project([lng, lat]);
      if (p.x >= pad.left + m && p.x <= w - pad.right - m && p.y >= pad.top + m && p.y <= h - pad.bottom - m) return;
      let [west, south, east, north] = [lng, lat, lng, lat];
      const a = resolved?.anchor;
      const around = a?.type === "point" ? [a.lng, a.lat, a.lng, a.lat] : resolved?.area ? areaBounds(resolved.area) : null;
      if (around) {
        west = Math.min(west, around[0]);
        south = Math.min(south, around[1]);
        east = Math.max(east, around[2]);
        north = Math.max(north, around[3]);
      }
      const inner = { top: pad.top + m, right: pad.right + m, bottom: pad.bottom + m, left: pad.left + m };
      // Never zoom in: the current zoom is the upper bound.
      const { center, zoom } = fitCamera([west, south, east, north], w, h, inner, map.getZoom());
      map.easeTo({ center, zoom, padding: pad, duration: reducedMotion() ? 0 : 700 });
    },
    [previewId, allStations, resolved, selectStation],
  );

  const toggleKind = useCallback(
    (k: StationKind) => {
      setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
      setPreviewId(null);
      trackFirstAction("filter", { lang });
    },
    [lang],
  );

  const setMaterial = useCallback((material: Material | null) => {
    setSearch((s) => ({ ...s, material: material ?? undefined }));
    setPreviewId(null);
    track("panel_change", { control: "material", value: material ?? "all" });
  }, []);

  const setRadius = useCallback((radius: Radius) => {
    setSearch((s) => ({ ...s, radius, mode: "nearby" }));
    setPreviewId(null);
    track("panel_change", { control: "radius", value: radius });
  }, []);

  // "place_search": once per new search location (tap, GPS, PLZ, Kreis), sent
  // once its results are known so it carries what the search found. The
  // search a deep link opens with (?at= / ?plz=) is not counted as a search.
  const lastSearched = useRef<Anchor | null>(initialSearch.anchor ?? null);
  useEffect(() => {
    const a = search.anchor;
    if (!a || a === lastSearched.current || !resolved || !stations) return;
    lastSearched.current = a;
    const nearest = results[0]?.distance;
    // PLZ for postcode searches and map taps / GPS (coarse: never the point itself).
    const plz = a.type === "plz" ? a.plz : a.type === "point" ? resolved.plz : null;
    const where: Record<string, string | number> = a.type === "kreis" ? { kreis: a.kreis } : plz ? { plz } : {};
    track("place_search", {
      by: a.type === "point" ? (a.source ?? "map") : a.type,
      ...where,
      result_count: results.length,
      results: countBucket(results.length),
      ...(nearest !== undefined ? { nearest: metersBucket(nearest) } : {}),
      radius: search.radius,
      ...(search.material ? { material: search.material } : {}),
    });
  }, [search, resolved, stations, results]);

  // A deep link straight to a station (?station=) opens its card without a tap.
  const linkTracked = useRef(false);
  useEffect(() => {
    if (linkTracked.current || !initialStationId || !allStations) return;
    linkTracked.current = true;
    const f = allStations.features.find((s) => s.properties.id === initialStationId);
    if (f) track("station_open", stationProps(f.properties, "link"));
  }, [allStations, initialStationId]);

  // ---- map health ---------------------------------------------------------------------
  // "map_ready": base map drawn and stations loaded, in ms since the page started
  // loading. Once per page load. Visitors who leave before it are the map's
  // silent losses; "client_error" map_timeout catches the ones still waiting at 15 s.
  useEffect(() => {
    if (!mapReady || !allStations) return;
    const ms = sinceLoadMs();
    trackOnce("map_ready", "map_ready", { ms, within: msBucket(ms) });
  }, [mapReady, allStations]);
  useEffect(() => {
    if (mapReady) return;
    const timer = window.setTimeout(() => trackError("map_timeout", "timeout"), 15_000);
    return () => window.clearTimeout(timer);
  }, [mapReady]);
  useEffect(() => {
    if (dataError) trackError("stations_api", errorCode(dataError));
  }, [dataError]);
  const onMapError = useCallback((message: string, kind: MapErrorKind) => {
    setMapError(message);
    if (kind === "map" && !readyRef.current) trackError("map_style");
    // A few failed tiles are normal (edges, slow network); three or more on one
    // page load mean the base map visibly has holes.
    if (kind === "tile" && ++tileErrors.current === 3) trackError("tiles");
  }, []);

  // "search_no_result": a search that shows no station (e.g. strict scope in a
  // Kreis without an MRH stop). Once per distinct search, so re-renders don't
  // count twice; tells us where coverage or the default radius falls short.
  const lastNoResult = useRef<string | null>(null);
  useEffect(() => {
    const a = search.anchor;
    if (!a || !resolved || !stations || results.length > 0) {
      lastNoResult.current = null;
      return;
    }
    const by = a.type === "point" ? (a.source ?? "map") : a.type;
    const filtered = kinds.length < STATION_KINDS.length;
    const key = JSON.stringify([a, search.mode, search.radius, kinds]);
    if (key === lastNoResult.current) return;
    lastNoResult.current = key;
    track("search_no_result", {
      by,
      reason: filtered ? "filtered" : "no_stations",
      mode: search.mode,
      radius: search.radius,
      ...(resolved.plz ? { plz: resolved.plz } : {}),
    });
  }, [search, resolved, stations, results, kinds]);

  const { locate, busy: locating } = useLocate(onLocate, setHint);
  // The nearby panel puts its radius select on the same row (`trailing`).
  const picker = (trailing?: ReactNode) => (
    <PlacePicker
      cityPlz={cityPlz}
      anchor={search.anchor}
      onPick={pickArea}
      locate={<LocateInline locate={locate} busy={locating} />}
      trailing={trailing}
    />
  );

  // ---- render -------------------------------------------------------------------------
  return (
    <div ref={rootRef} className="relative h-dvh w-full overflow-hidden bg-[#E9ECE8]">
      {initialView && (
        <ZurichMap
          mapRef={mapRef}
          initialView={initialView}
          styleUrl={active.url}
          kreise={areas?.kreise ?? null}
          stations={stations}
          selectedStationId={stationId}
          onSelectStation={selectStation}
          onPickPoint={pickPoint}
          pin={pin}
          focusArea={focusArea}
          radiusCircle={radiusCircle}
          highlightIds={highlightIds}
          previewStation={selectedStation ? null : preview}
          onLoad={() => {
            readyRef.current = true;
            setMapReady(true);
          }}
          onError={onMapError}
        />
      )}

      {/* Top bar: brand, sample-data badge, filters */}
      <header
        ref={headerRef}
        data-map-header
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 bg-gradient-to-b from-paper/95 via-paper/70 to-transparent px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4">
        <div className="flex items-center gap-2">
          <span className="pointer-events-auto font-display text-2xl font-extrabold tracking-tight text-ink">
            furtli<span className="text-orange">.</span>
          </span>
          {hasPlaceholders && (
            <span
              data-testid="sample-badge"
              className="rounded-full bg-sun px-2.5 py-0.5 text-xs font-bold text-ink"
              title={t.map.sampleTitle}
            >
              {t.map.sampleBadge}
            </span>
          )}
          {process.env.NODE_ENV === "development" && <DevStylePicker active={active} onPick={setDevBasemap} />}
          <LangToggle className="ml-auto" />
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
          radius={search.radius}
          today={today}
          calendar={shownCalendar}
          picker={picker}
          onRadiusChange={setRadius}
          material={search.material ?? null}
          onMaterialChange={setMaterial}
          previewId={previewId}
          onPreviewStation={previewStation}
          onClose={() => setAnchor(null)}
        />
      ) : (
        mapReady && (
          <div
            data-testid="start-card"
            className="pointer-events-auto absolute inset-x-3 bottom-3 z-20 rounded-3xl bg-paper px-4 py-3.5 shadow-[0_8px_30px_rgba(23,34,59,0.18)] md:inset-x-auto md:top-[7.5rem] md:bottom-auto md:left-4 md:w-[26rem]"
          >
            <p className="font-display text-lg leading-tight font-bold text-ink">{t.map.startTitle}</p>
            <p className="mt-0.5 mb-2.5 text-sm text-ink/65">{t.map.startText}</p>
            {picker()}
          </div>
        )
      )}

      {/* Loading skeleton / errors (the style is fetched client-side and can be slow) */}
      {!mapReady && !mapError && (
        <div className="absolute inset-0 z-0 grid place-items-center" aria-live="polite">
          <p className="animate-pulse rounded-full bg-white/80 px-4 py-2 text-sm text-ink/70">{t.map.loading}</p>
        </div>
      )}
      {/* Individual tile errors are normal; only surface a failure to load the style itself. */}
      {((mapError && !mapReady) || dataError) && (
        <p
          role="alert"
          className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-xl bg-ink px-4 py-2 text-sm text-white"
        >
          {dataError ? t.map.stationsError : t.map.mapError}
        </p>
      )}
    </div>
  );
}

/** `station_open` / `station_preview` properties: the station is a public place, never the visitor's location. */
function stationProps(p: { id: string; kind: StationKind; kreis: number }, via: OpenVia) {
  return { kind: p.kind, station: p.id, kreis: p.kreis, via };
}

/** Dev-only: switch between the swisstopo base maps in place. */
function DevStylePicker({ active, onPick }: { active: Basemap; onPick: (b: Basemap) => void }) {
  const { t } = useLang();
  const options = allBasemaps();
  const list = options.some((o) => o.id === active.id) ? options : [active, ...options];
  return (
    <div className="pointer-events-auto ml-auto flex items-center gap-2">
      <select
        aria-label={t.map.devStyle}
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
    </div>
  );
}

/** Keep a framed area or centred point clear of the top bar and the sheet/side panel. */
function panelPadding() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // Below the header, whose height varies (chips wrap on phones).
  const headerBottom = document.querySelector("[data-map-header]")?.getBoundingClientRect().bottom;
  const top = Math.round((headerBottom ?? 100) + 10);
  return w >= 768
    ? { top, left: 450, right: 60, bottom: 40 }
    : { top, left: 20, right: 20, bottom: Math.round(h * (SHEET_COMPACT + 0.02)) };
}
