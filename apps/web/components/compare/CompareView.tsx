"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapRef, ViewStateChangeEvent } from "react-map-gl/maplibre";

import { ZH_CENTER } from "@/lib/geo/kreis";
import { KINDS } from "@/lib/geo/kinds";
import { MAPTILER_KEY, allBasemaps, type Basemap } from "@/lib/map-config";
import { KindDot } from "@/components/map/KindDot";
import { useMapData } from "@/components/map/useMapData";
import type { InitialView } from "@/components/map/ZurichMap";

const ZurichMap = dynamic(() => import("@/components/map/ZurichMap"), { ssr: false });

type Side = "left" | "right";

interface Props {
  leftId: string;
  rightId: string;
}

const INITIAL_VIEW = { ...ZH_CENTER, zoom: 12 } satisfies InitialView;

/**
 * Two base maps side by side (stacked on phones) with the same overlays,
 * cameras kept in sync. Pick styles per pane; choices live in the URL
 * (?left=…&right=…) and the camera in the hash (#zoom/lat/lng), so a
 * comparison can be shared as a link.
 */
export default function CompareView({ leftId, rightId }: Props) {
  const options = useMemo(() => allBasemaps(), []);
  const byId = useCallback((id: string) => options.find((o) => o.id === id) ?? options[0], [options]);
  const [ids, setIds] = useState<Record<Side, string>>({ left: leftId, right: rightId });

  const { stations, kreise, error } = useMapData();
  const [stationId, setStationId] = useState<string | null>(null);
  const [kreis, setKreis] = useState<number | null>(null);
  const selected = stations?.features.find((f) => f.properties.id === stationId) ?? null;

  // ---- camera sync ----------------------------------------------------------
  const refs = { left: useRef<MapRef | null>(null), right: useRef<MapRef | null>(null) };
  const leading = useRef<Side | null>(null);
  const [zoom, setZoom] = useState<Record<Side, number>>({ left: INITIAL_VIEW.zoom, right: INITIAL_VIEW.zoom });

  const sync = useCallback((from: Side, e: ViewStateChangeEvent) => {
    // A mirrored jumpTo emits its own move event on the other map; ignore it.
    if (leading.current && leading.current !== from) return;
    const other = refs[from === "left" ? "right" : "left"].current;
    if (!other) return;
    leading.current = from;
    const { longitude, latitude, zoom: z, bearing, pitch } = e.viewState;
    other.jumpTo({ center: [longitude, latitude], zoom: z, bearing, pitch });
    leading.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable
  }, []);

  // The right map starts wherever the left one restored from the URL hash.
  const onLoad = useCallback((side: Side) => {
    if (side !== "right") return;
    const l = refs.left.current;
    if (l) refs.right.current?.jumpTo({ center: l.getCenter(), zoom: l.getZoom() });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable
  }, []);

  // ---- URL: ?left=&right= (keeps the camera hash) ---------------------------
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("left", ids.left);
    params.set("right", ids.right);
    window.history.replaceState(null, "", `?${params.toString()}${window.location.hash}`);
  }, [ids]);

  const selectStation = useCallback(
    (id: string) => {
      setStationId(id);
      setKreis(stations?.features.find((f) => f.properties.id === id)?.properties.kreis ?? null);
    },
    [stations],
  );
  const selectKreis = useCallback((n: number | null) => {
    setStationId(null);
    setKreis(n);
  }, []);

  const pane = (side: Side) => {
    const basemap = byId(ids[side]);
    return (
      <Pane
        key={side}
        side={side}
        basemap={basemap}
        options={options}
        zoom={zoom[side]}
        onPick={(id) => setIds((prev) => ({ ...prev, [side]: id }))}
      >
        <ZurichMap
          mapRef={refs[side]}
          initialView={INITIAL_VIEW}
          styleUrl={basemap.url}
          provider={basemap.provider}
          kreise={kreise}
          stations={stations}
          selectedStationId={stationId}
          onSelectStation={selectStation}
          focusArea={kreis && kreise ? (kreise.features.find((f) => f.properties.kreis === kreis) ?? null) : null}
          onLoad={() => onLoad(side)}
          onError={() => {}}
          onMove={(e) => sync(side, e)}
          onMoveEnd={(e) => setZoom((prev) => ({ ...prev, [side]: e.viewState.zoom }))}
          hash={side === "left"}
          showNavigation={side === "right"}
        />
      </Pane>
    );
  };

  return (
    <div className="relative flex h-dvh flex-col bg-paper">
      <header className="flex items-center gap-3 border-b border-ink/10 px-3 py-2">
        <Link href="/" className="font-display text-xl font-extrabold tracking-tight text-ink">
          furtli<span className="text-orange">.</span>
        </Link>
        <h1 className="truncate text-sm font-bold text-ink/70">Kartenvergleich</h1>
        <nav className="ml-auto flex gap-2 text-xs font-bold whitespace-nowrap" aria-label="Volle App öffnen">
          <Link href="/" className="rounded-lg bg-white px-2 py-1 text-ink shadow-sm">
            <span className="hidden sm:inline">App: </span>swisstopo
          </Link>
          {MAPTILER_KEY && (
            <Link href="/maptiler" className="rounded-lg bg-white px-2 py-1 text-ink shadow-sm">
              <span className="hidden sm:inline">App: </span>MapTiler
            </Link>
          )}
        </nav>
      </header>

      {!MAPTILER_KEY && (
        <p data-testid="maptiler-key-hint" className="bg-sun px-3 py-1.5 text-xs text-ink">
          MapTiler styles appear here once <code>NEXT_PUBLIC_MAPTILER_KEY</code> is set in{" "}
          <code>apps/web/.env.local</code> (then restart <code>pnpm dev</code>). Until then you can compare the
          swisstopo styles.
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-rows-2 gap-px bg-ink/20 md:grid-cols-2 md:grid-rows-1">
        {pane("left")}
        {pane("right")}
      </div>

      {(selected || error) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-3">
          {error ? (
            <p role="alert" className="rounded-xl bg-ink px-4 py-2 text-sm text-white">
              Stationen konnten nicht geladen werden.
            </p>
          ) : selected ? (
            <p
              data-testid="compare-selection"
              className="pointer-events-auto flex items-center gap-2 rounded-full bg-white py-1.5 pr-2 pl-2 text-sm text-ink shadow-lg"
            >
              <KindDot kind={selected.properties.kind} />
              <b>{selected.properties.name}</b>
              <span className="text-ink/60">
                {KINDS[selected.properties.kind].short} · Kreis {selected.properties.kreis}
              </span>
              <button
                type="button"
                aria-label="Auswahl aufheben"
                onClick={() => selectKreis(null)}
                className="rounded-full px-2 text-ink/60 hover:bg-ink/5"
              >
                ×
              </button>
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Pane({
  side,
  basemap,
  options,
  zoom,
  onPick,
  children,
}: {
  side: Side;
  basemap: Basemap;
  options: Basemap[];
  zoom: number;
  onPick: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={`pane-${side}`} aria-label={basemap.label} className="relative min-h-0 bg-[#E9ECE8]">
      {children}
      <div className="pointer-events-none absolute top-2 left-2 z-10 flex items-center gap-2">
        <select
          aria-label={side === "left" ? "Kartenstil links" : "Kartenstil rechts"}
          value={basemap.id}
          onChange={(e) => onPick(e.target.value)}
          className="pointer-events-auto rounded-lg border border-ink/15 bg-white px-2 py-1 text-sm font-bold text-ink shadow-sm"
        >
          <optgroup label="swisstopo">
            {options
              .filter((o) => o.provider === "swisstopo")
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
          </optgroup>
          {options.some((o) => o.provider === "maptiler") && (
            <optgroup label="MapTiler">
              {options
                .filter((o) => o.provider === "maptiler")
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
            </optgroup>
          )}
        </select>
        <span
          data-testid={`zoom-${side}`}
          className="rounded-md bg-white/85 px-1.5 py-0.5 font-mono text-xs text-ink/70 tabular-nums"
        >
          z{zoom.toFixed(1)}
        </span>
      </div>
    </section>
  );
}
