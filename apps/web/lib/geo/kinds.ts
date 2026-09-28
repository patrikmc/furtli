import { localizeTimeText } from "@/lib/i18n/format";
import type { Lang } from "@/lib/i18n/lang";
import { ui } from "@/lib/i18n/ui";
import type { StationKind } from "./types";

/**
 * Display metadata per station type. Colours are the Furtli brand tokens
 * (see app/globals.css); icons are drawn from `glyph` (24×24 SVG path data)
 * by components/map/icons.ts, so there are no image files to keep in sync.
 * Names are per language: kindLabel() / kindShort() (lib/i18n/ui.ts).
 */
export const KINDS: Record<
  StationKind,
  { color: string; glyphColor: string; glyph: string }
> = {
  mrh: {
    color: "#E8512B", // Orange
    glyphColor: "#FFFFFF",
    // delivery truck
    glyph:
      "M2 6.5h11v8.5H2z M13 9h4.2l2.8 3.2v2.8H13z M5.5 18.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z M16.5 18.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z",
  },
  hazmat: {
    color: "#F6C343", // Sun
    glyphColor: "#17223B",
    // lab flask
    glyph: "M9 3h6v2h-1v4.2l5.2 9.1A1.8 1.8 0 0 1 17.6 21H6.4a1.8 1.8 0 0 1-1.6-2.7L10 9.2V5H9z",
  },
  sammelstelle: {
    color: "#2F7D5B", // Moss
    glyphColor: "#FFFFFF",
    // bottle
    glyph: "M10 2h4v4.2l1.6 2.6V21a1 1 0 0 1-1 1H9.4a1 1 0 0 1-1-1V8.8L10 6.2z",
  },
  recyclinghof: {
    color: "#17223B", // Ink
    glyphColor: "#D7EFE3",
    // hall with a gate
    glyph: "M2.5 10.5 12 4l9.5 6.5V20h-5v-6h-9v6h-5z",
  },
};

/** "Mobiler Recyclinghof" / "Mobile recycling point". */
export function kindLabel(kind: StationKind, lang: Lang = "de"): string {
  return ui(lang).kinds[kind].label;
}

/** Short name for chips and lists: "Sonderabfall" / "Hazardous waste". */
export function kindShort(kind: StationKind, lang: Lang = "de"): string {
  return ui(lang).kinds[kind].short;
}

/** Sammelstelle materials: "Glas" / "Glass" (unknown keys as they are). */
export function materialLabel(m: string, lang: Lang = "de"): string {
  return ui(lang).materials[m] ?? m;
}

/** Weekday keys of Recyclinghof hours (mo, di, …): "Mo" / "Mon". */
export function dayLabel(d: string, lang: Lang = "de"): string {
  return ui(lang).days[d] ?? d;
}

export function iconId(kind: StationKind): string {
  return `station-${kind}`;
}

/**
 * Mobile Recyclinghof opening hours, city-wide, as published on stadt-zuerich.ch
 * (see project doc 01). Re-check when the city changes the schedule.
 * The city's geo layer doesn't carry reliable per-stop hours for the MRH.
 */
export const MRH_HOURS = { weekday: "15–19 Uhr", saturday: "10–14 Uhr" };

/** Time window for a station on a given date, if known: "15–19 Uhr" / "15:00–19:00". */
export function timeWindow(
  kind: StationKind,
  hours: Record<string, string> | null | undefined,
  iso: string,
  lang: Lang = "de",
): string | null {
  let t: string | null;
  if (kind === "mrh") {
    const [y, m, d] = iso.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
    t = dow === 0 ? null : dow === 6 ? MRH_HOURS.saturday : MRH_HOURS.weekday;
  } else t = hours?.note ?? null;
  return t && localizeTimeText(t, lang);
}
