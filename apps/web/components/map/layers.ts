import type {
  CircleLayerSpecification,
  FillLayerSpecification,
  FilterSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import { STATION_KINDS } from "@/lib/geo/types";
import { iconId } from "@/lib/geo/kinds";

// Layer ids are referenced by click handling (interactiveLayerIds) and tests.
export const LAYER = {
  kreisFill: "kreis-fill",
  kreisLine: "kreis-line",
  kreisLabel: "kreis-label",
  clusters: "clusters",
  clusterCount: "cluster-count",
  stationHalo: "station-halo",
  stations: "stations",
  focusFill: "focus-fill",
  focusLine: "focus-line",
  radiusFill: "radius-fill",
} as const;

const INK = "#17223B";
const MOSS = "#2F7D5B";
const ORANGE = "#E8512B";

type Omitted<T> = Omit<T, "source">;

export const kreisFill = (active: number | null): Omitted<FillLayerSpecification> => ({
  id: LAYER.kreisFill,
  type: "fill",
  paint: {
    "fill-color": MOSS,
    "fill-opacity": ["case", ["==", ["get", "kreis"], active ?? -1], 0.2, 0.04],
  },
});

export const kreisLine = (active: number | null): Omitted<LineLayerSpecification> => ({
  id: LAYER.kreisLine,
  type: "line",
  layout: { "line-join": "round" },
  paint: {
    "line-color": ["case", ["==", ["get", "kreis"], active ?? -1], MOSS, INK],
    "line-opacity": ["case", ["==", ["get", "kreis"], active ?? -1], 0.9, 0.35],
    "line-width": ["case", ["==", ["get", "kreis"], active ?? -1], 2.5, 1.2],
  },
});

/** `font` comes from the base style (see ZurichMap), so labels always have glyphs. */
export const kreisLabel = (font: string[]): Omitted<SymbolLayerSpecification> => ({
  id: LAYER.kreisLabel,
  type: "symbol",
  layout: {
    "text-field": ["get", "name"],
    "text-font": font,
    "text-size": ["interpolate", ["linear"], ["zoom"], 11, 12, 15, 16],
    "text-allow-overlap": false,
  },
  paint: {
    "text-color": INK,
    "text-opacity": 0.7,
    "text-halo-color": "#FFFFFF",
    "text-halo-width": 1.5,
  },
});

export const clusterCircle: Omitted<CircleLayerSpecification> = {
  id: LAYER.clusters,
  type: "circle",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": INK,
    "circle-radius": ["step", ["get", "point_count"], 16, 5, 20, 20, 26],
    "circle-stroke-color": "#FFFFFF",
    "circle-stroke-width": 2.5,
  },
};

export const clusterCount = (font: string[]): Omitted<SymbolLayerSpecification> => ({
  id: LAYER.clusterCount,
  type: "symbol",
  filter: ["has", "point_count"],
  layout: {
    "text-field": ["get", "point_count_abbreviated"],
    "text-font": font,
    "text-size": 13,
    "text-allow-overlap": true,
  },
  paint: { "text-color": "#FFFFFF" },
});

// The type filter is applied to the source data (MapShell), not here:
// clustering runs before layer filters, so a layer filter would leave
// hidden stations counted inside cluster bubbles.
const unclustered: FilterSpecification = ["!", ["has", "point_count"]];

/** Ring drawn under the selected station. */
export const stationHalo = (selectedId: string | null): Omitted<CircleLayerSpecification> => ({
  id: LAYER.stationHalo,
  type: "circle",
  filter: ["all", unclustered, ["==", ["get", "id"], selectedId ?? ""]],
  paint: {
    "circle-radius": 21,
    "circle-color": ORANGE,
    "circle-opacity": 0.25,
    "circle-stroke-color": ORANGE,
    "circle-stroke-width": 2,
  },
});

/**
 * Station markers. With a search active, stations outside the results are
 * dimmed rather than hidden, so the map still shows what's a bit further.
 */
export const stationSymbol = (highlightIds: string[] | null): Omitted<SymbolLayerSpecification> => ({
  id: LAYER.stations,
  type: "symbol",
  filter: unclustered,
  paint: {
    "icon-opacity": highlightIds ? ["case", ["in", ["get", "id"], ["literal", highlightIds]], 1, 0.35] : 1,
  },
  layout: {
    "icon-image": [
      "match",
      ["get", "kind"],
      ...STATION_KINDS.flatMap((k) => [k, iconId(k)]),
      iconId("sammelstelle"),
    ] as unknown as string,
    "icon-size": 1,
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
  },
});

/** The Kreis or postcode being searched (area anchors, or "only my Kreis"). */
export const focusFill: Omitted<FillLayerSpecification> = {
  id: LAYER.focusFill,
  type: "fill",
  paint: { "fill-color": MOSS, "fill-opacity": 0.14 },
};
export const focusLine: Omitted<LineLayerSpecification> = {
  id: LAYER.focusLine,
  type: "line",
  layout: { "line-join": "round" },
  paint: { "line-color": MOSS, "line-width": 2.5, "line-opacity": 0.9 },
};

/** The search radius around a picked point (its dashed outline is <RadiusRing>, a DOM overlay). */
export const radiusFill: Omitted<FillLayerSpecification> = {
  id: LAYER.radiusFill,
  type: "fill",
  paint: { "fill-color": ORANGE, "fill-opacity": 0.07 },
};
