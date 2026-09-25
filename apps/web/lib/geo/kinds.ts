import type { StationKind } from "./types";

/**
 * Display metadata per station type. Colours are the Furtli brand tokens
 * (see app/globals.css); icons are drawn from `glyph` (24×24 SVG path data)
 * by components/map/icons.ts, so there are no image files to keep in sync.
 */
export const KINDS: Record<
  StationKind,
  { label: string; short: string; color: string; glyphColor: string; glyph: string }
> = {
  mrh: {
    label: "Mobiler Recyclinghof",
    short: "Recyclinghof",
    color: "#E8512B", // Orange
    glyphColor: "#FFFFFF",
    // delivery truck
    glyph:
      "M2 6.5h11v8.5H2z M13 9h4.2l2.8 3.2v2.8H13z M5.5 18.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z M16.5 18.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z",
  },
  hazmat: {
    label: "Sonderabfallmobil",
    short: "Sonderabfall",
    color: "#F6C343", // Sun
    glyphColor: "#17223B",
    // lab flask
    glyph: "M9 3h6v2h-1v4.2l5.2 9.1A1.8 1.8 0 0 1 17.6 21H6.4a1.8 1.8 0 0 1-1.6-2.7L10 9.2V5H9z",
  },
  sammelstelle: {
    label: "Sammelstelle",
    short: "Sammelstelle",
    color: "#2F7D5B", // Moss
    glyphColor: "#FFFFFF",
    // bottle
    glyph: "M10 2h4v4.2l1.6 2.6V21a1 1 0 0 1-1 1H9.4a1 1 0 0 1-1-1V8.8L10 6.2z",
  },
};

export const MATERIAL_LABELS: Record<string, string> = {
  glass: "Glas",
  metal: "Metall",
  textiles: "Textilien",
  oil: "Altöl",
};

export function iconId(kind: StationKind): string {
  return `station-${kind}`;
}
