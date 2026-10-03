"use client";

import { useEffect, useMemo, useRef } from "react";
import { Marker, useMap } from "react-map-gl/maplibre";
import type { Polygon } from "geojson";

/** Room around the circle so the stroke is never clipped. */
const PAD = 2;

/**
 * Dashed outline of the search radius, drawn as an SVG overlay on the map
 * (the fill stays a map layer). The dashes drift slowly around the circle with
 * a CSS stroke-dashoffset animation, stepped to ~6 repaints a second of this
 * one small SVG; the map itself never repaints for it. (Animating the map
 * layer's line-dasharray instead re-lays out the line on every step: far too
 * slow on phones.) Off for prefers-reduced-motion.
 *
 * The circle's size in pixels follows the zoom; no React re-render per frame.
 */
export function RadiusRing({ circle }: { circle: Polygon }) {
  const { current: mapRef } = useMap();
  const svgRef = useRef<SVGSVGElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);

  // Centre and the east/west extremes of the polygon, which circlePolygon()
  // draws round on screen (equal scale in x and y at Zürich's latitude).
  const geo = useMemo(() => {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const [x, y] of circle.coordinates[0]) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const lat = (minY + maxY) / 2;
    return {
      lng: (minX + maxX) / 2,
      lat,
      west: [minX, lat] as [number, number],
      east: [maxX, lat] as [number, number],
    };
  }, [circle]);

  useEffect(() => {
    const map = mapRef?.getMap();
    const svg = svgRef.current;
    const ring = ringRef.current;
    if (!map || !svg || !ring) return;
    const fit = () => {
      const r = Math.max(
        0,
        (map.project(geo.east).x - map.project(geo.west).x) / 2,
      );
      const size = Math.ceil(2 * (r + PAD));
      svg.setAttribute("width", String(size));
      svg.setAttribute("height", String(size));
      svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
      ring.setAttribute("cx", String(size / 2));
      ring.setAttribute("cy", String(size / 2));
      ring.setAttribute("r", String(r));
    };
    fit();
    // Only zooming changes the size on screen (rotation and pitch are off); the Marker keeps it in place.
    map.on("zoom", fit);
    return () => {
      map.off("zoom", fit);
    };
  }, [mapRef, geo]);

  return (
    <Marker
      longitude={geo.lng}
      latitude={geo.lat}
      anchor="center"
      style={{ pointerEvents: "none" }}
    >
      <svg
        ref={svgRef}
        width={0}
        height={0}
        className="block overflow-visible"
        data-testid="radius-ring"
        aria-hidden
      >
        <circle
          ref={ringRef}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.8}
          strokeWidth={1.5}
          strokeDasharray="3 3"
          className="text-orange motion-safe:animate-dash-drift"
        />
      </svg>
    </Marker>
  );
}
