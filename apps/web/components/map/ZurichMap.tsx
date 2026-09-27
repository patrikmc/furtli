"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Map, {
  AttributionControl,
  Layer,
  Marker,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
  type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import type { GeoJSONSource, Map as MaplibreMap } from "maplibre-gl";
import type { Feature, Polygon } from "geojson";
import type { AreaGeometry } from "geo";
import "maplibre-gl/dist/maplibre-gl.css";

import type { KreisCollection, StationCollection } from "@/lib/geo/types";
import { ZH_BOUNDS } from "@/lib/geo/kreis";
import { DATA_ATTRIBUTION } from "@/lib/map-config";
import { reducedMotion } from "@/lib/motion";
import { registerStationIcons } from "./icons";
import {
  LAYER,
  clusterCircle,
  clusterCount,
  focusFill,
  focusLine,
  kreisFill,
  kreisLabel,
  kreisLine,
  radiusFill,
  radiusLine,
  stationHalo,
  stationSymbol,
} from "./layers";

type Padding = { top: number; left: number; right: number; bottom: number };
export type InitialView =
  | { longitude: number; latitude: number; zoom: number; padding?: Padding }
  | {
      bounds: [number, number, number, number];
      fitBoundsOptions?: { padding: number | Padding };
    };

export interface MapPin {
  lng: number;
  lat: number;
  /** "gps": the user's location (blue dot); "map": a picked point (pin). */
  source: "gps" | "map";
}

export interface ZurichMapProps {
  mapRef: RefObject<MapRef | null>;
  initialView: InitialView;
  styleUrl: string;
  kreise: KreisCollection | null;
  stations: StationCollection | null;
  selectedStationId: string | null;
  onSelectStation: (id: string) => void;
  onLoad: () => void;
  onError: (message: string) => void;
  /** Tap on the map outside a station: pick this point as the search location. */
  onPickPoint?: (lng: number, lat: number) => void;
  /** The search location; draggable when onPickPoint is set. */
  pin?: MapPin | null;
  /** Kreis or postcode outline to highlight. */
  focusArea?: Feature<AreaGeometry> | null;
  /** Search radius around the pin. */
  radiusCircle?: Polygon | null;
  /** Stations in the current results; others are dimmed. null = no search. */
  highlightIds?: string[] | null;
  /** Fires on every camera change; `e.originalEvent` is set for user gestures. */
  onMove?: (e: ViewStateChangeEvent) => void;
  onMoveEnd?: (e: ViewStateChangeEvent) => void;
  /** Mirror the camera in the URL hash (#zoom/lat/lng), for shareable positions. */
  hash?: boolean;
  showNavigation?: boolean;
}

const INTERACTIVE = [LAYER.stations, LAYER.clusters];

/** First text font the base style uses — so our labels load glyphs the base style actually has. */
function detectFont(map: MaplibreMap): string[] | null {
  for (const layer of map.getStyle().layers ?? []) {
    const f = layer.type === "symbol" ? layer.layout?.["text-font"] : undefined;
    if (Array.isArray(f) && f.every((x) => typeof x === "string")) return f as string[];
  }
  return null;
}

export default function ZurichMap({
  mapRef,
  initialView,
  styleUrl,
  kreise,
  stations,
  selectedStationId,
  onSelectStation,
  onLoad,
  onError,
  onPickPoint,
  pin = null,
  focusArea = null,
  radiusCircle = null,
  highlightIds = null,
  onMove,
  onMoveEnd,
  hash = false,
  showNavigation = true,
}: ZurichMapProps) {
  const [font, setFont] = useState<string[] | null>(null);
  // Our sources mount only once icons are registered, so markers never
  // reference a missing image.
  const [styleReady, setStyleReady] = useState(false);
  const [hovering, setHovering] = useState(false);
  const cleanupIcons = useRef<(() => void) | null>(null);

  // Icons + font must be (re)applied after every style load, including
  // swaps from the dev style switcher.
  const handleStyle = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    cleanupIcons.current?.();
    cleanupIcons.current = registerStationIcons(map);
    const next = detectFont(map);
    setFont((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    setStyleReady(true);
  }, [mapRef]);

  useEffect(() => () => cleanupIcons.current?.(), []);

  const handleClick = useCallback(
    async (e: MapLayerMouseEvent) => {
      const features = e.features ?? [];
      const station = features.find((f) => f.layer.id === LAYER.stations);
      if (station) {
        // Look the station up by id rather than trusting f.properties:
        // MapLibre stringifies array properties such as nextDates.
        onSelectStation(String(station.properties.id));
        return;
      }
      const cluster = features.find((f) => f.layer.id === LAYER.clusters);
      if (cluster && cluster.geometry.type === "Point") {
        const map = mapRef.current?.getMap();
        const source = map?.getSource("stations") as GeoJSONSource | undefined;
        if (!map || !source) return;
        const zoom = await source.getClusterExpansionZoom(Number(cluster.properties.cluster_id));
        map.easeTo({
          center: cluster.geometry.coordinates as [number, number],
          zoom,
          duration: reducedMotion() ? 0 : 500,
        });
        return;
      }
      onPickPoint?.(+e.lngLat.lng.toFixed(6), +e.lngLat.lat.toFixed(6));
    },
    [mapRef, onPickPoint, onSelectStation],
  );

  const focusData = useMemo(() => (focusArea ? { type: "FeatureCollection" as const, features: [focusArea] } : null), [focusArea]);
  const radiusData = useMemo(
    () => (radiusCircle ? { type: "Feature" as const, geometry: radiusCircle, properties: {} } : null),
    [radiusCircle],
  );

  return (
    <Map
      ref={mapRef}
      initialViewState={initialView}
      minZoom={11}
      maxZoom={18}
      maxBounds={[ZH_BOUNDS[0] - 0.05, ZH_BOUNDS[1] - 0.03, ZH_BOUNDS[2] + 0.05, ZH_BOUNDS[3] + 0.03]}
      mapStyle={styleUrl}
      style={{ position: "absolute", inset: 0 }}
      attributionControl={false}
      dragRotate={false}
      touchPitch={false}
      interactiveLayerIds={INTERACTIVE}
      cursor={hovering ? "pointer" : onPickPoint ? "crosshair" : "grab"}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={handleClick}
      onLoad={() => {
        handleStyle();
        // re-apply after style swaps (dev style switcher)
        mapRef.current?.getMap().on("style.load", handleStyle);
        onLoad();
      }}
      onError={(e) => onError(e.error?.message ?? "Kartenfehler")}
      onMove={onMove}
      onMoveEnd={onMoveEnd}
      hash={hash}
    >
      {/* Top-right, below the header: never hidden by the bottom sheet (A6). */}
      <AttributionControl position="top-right" compact={false} customAttribution={DATA_ATTRIBUTION} />
      {showNavigation && <NavigationControl position="bottom-right" showCompass={false} />}

      {styleReady && kreise && (
        <Source id="kreise" type="geojson" data={kreise}>
          <Layer {...kreisFill(null)} />
          <Layer {...kreisLine(null)} />
          {font && <Layer {...kreisLabel(font)} />}
        </Source>
      )}

      {styleReady && focusData && (
        <Source id="focus" type="geojson" data={focusData}>
          <Layer {...focusFill} />
          <Layer {...focusLine} />
        </Source>
      )}

      {styleReady && radiusData && (
        <Source id="radius" type="geojson" data={radiusData}>
          <Layer {...radiusFill} />
          <Layer {...radiusLine} />
        </Source>
      )}

      {styleReady && stations && (
        <Source
          id="stations"
          type="geojson"
          data={stations}
          cluster
          clusterRadius={40}
          clusterMaxZoom={14}
        >
          <Layer {...clusterCircle} />
          {font && <Layer {...clusterCount(font)} />}
          <Layer {...stationHalo(selectedStationId)} />
          <Layer {...stationSymbol(highlightIds)} />
        </Source>
      )}

      {pin && (
        <Marker
          longitude={pin.lng}
          latitude={pin.lat}
          anchor={pin.source === "gps" ? "center" : "bottom"}
          draggable={!!onPickPoint}
          onDragEnd={(e) => onPickPoint?.(+e.lngLat.lng.toFixed(6), +e.lngLat.lat.toFixed(6))}
        >
          {pin.source === "gps" ? (
            <span
              aria-label="Dein Standort"
              data-testid="search-pin"
              className="block h-4 w-4 rounded-full border-[3px] border-white bg-[#2563EB] shadow-[0_0_0_6px_rgba(37,99,235,0.2)]"
            />
          ) : (
            <svg
              aria-label="Gewählter Punkt (verschiebbar)"
              data-testid="search-pin"
              width="30"
              height="40"
              viewBox="0 0 30 40"
              className="cursor-grab drop-shadow-md active:cursor-grabbing"
            >
              <path
                d="M15 39s13-12.4 13-23A13 13 0 0 0 2 16c0 10.6 13 23 13 23z"
                fill="#17223B"
                stroke="#fff"
                strokeWidth="2"
              />
              <circle cx="15" cy="16" r="5" fill="#E8512B" />
            </svg>
          )}
        </Marker>
      )}
    </Map>
  );
}
