import type { Map as MaplibreMap, MapStyleImageMissingEvent } from "maplibre-gl";
import { KINDS, iconId } from "@/lib/geo/kinds";
import { STATION_KINDS, type StationKind } from "@/lib/geo/types";

const PIXEL_RATIO = 2;
const SIZE = 30; // CSS px

/**
 * Draws a round marker (brand colour + white ring + pictogram) into
 * ImageData. Synchronous on purpose: MapLibre's `styleimagemissing` event
 * needs addImage() before the handler returns, and Path2D accepts SVG path
 * data directly, so no SVG files, no async image loading.
 */
function drawMarker(kind: StationKind): ImageData {
  const px = SIZE * PIXEL_RATIO;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  const { color, glyphColor, glyph } = KINDS[kind];

  const r = px / 2;
  ctx.shadowColor = "rgba(23,34,59,0.35)";
  ctx.shadowBlur = 4 * PIXEL_RATIO;
  ctx.shadowOffsetY = 1 * PIXEL_RATIO;
  ctx.beginPath();
  ctx.arc(r, r, r - 3 * PIXEL_RATIO, 0, Math.PI * 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.beginPath();
  ctx.arc(r, r, r - 5.5 * PIXEL_RATIO, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  const scale = (px * 0.5) / 24;
  ctx.save();
  ctx.translate(r - 12 * scale, r - 12 * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = glyphColor;
  ctx.fill(new Path2D(glyph));
  ctx.restore();

  return ctx.getImageData(0, 0, px, px);
}

function addIcon(map: MaplibreMap, kind: StationKind) {
  const id = iconId(kind);
  if (!map.hasImage(id)) map.addImage(id, drawMarker(kind), { pixelRatio: PIXEL_RATIO });
}

/** Adds all marker icons now, and again whenever a style swap drops them. */
export function registerStationIcons(map: MaplibreMap): () => void {
  STATION_KINDS.forEach((k) => addIcon(map, k));
  const onMissing = (e: MapStyleImageMissingEvent) => {
    const kind = STATION_KINDS.find((k) => iconId(k) === e.id);
    if (kind) addIcon(map, kind);
  };
  map.on("styleimagemissing", onMissing);
  return () => {
    map.off("styleimagemissing", onMissing);
  };
}

/** Same marker as a data URL, for legends and the detail sheet. */
export function markerDataUrl(kind: StationKind): string {
  const img = drawMarker(kind);
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d")!.putImageData(img, 0, 0);
  return c.toDataURL();
}
