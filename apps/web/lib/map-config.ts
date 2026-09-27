/**
 * Base map configuration. We use swisstopo's free vector base maps
 * (keyless, commercial use allowed). Swapping the style is an env change
 * only (acceptance criterion A7): set NEXT_PUBLIC_MAP_STYLE_URL, restart.
 */

export interface Basemap {
  /** Stable id, e.g. "swisstopo-light". */
  id: string;
  label: string;
  url: string;
}

export const SWISSTOPO_LIGHT =
  "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json";

export const SWISSTOPO_PRESETS: Basemap[] = [
  { id: "swisstopo-light", label: "swisstopo Light", url: SWISSTOPO_LIGHT },
  {
    id: "swisstopo-base",
    label: "swisstopo Base",
    url: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.basemap.vt/style.json",
  },
];

/** Presets offered by the dev-only style switcher. */
export function allBasemaps(): Basemap[] {
  return SWISSTOPO_PRESETS;
}

/** The default base map for "/": env override, else swisstopo Light. */
export const DEFAULT_BASEMAP: Basemap = (() => {
  const env = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
  if (!env || env === SWISSTOPO_LIGHT) return SWISSTOPO_PRESETS[0];
  const preset = SWISSTOPO_PRESETS.find((p) => p.url === env);
  if (preset) return preset;
  return {
    id: "env",
    label: "Custom (.env)",
    url: env,
  };
})();

/** Credit for our own overlay data; the base map brings its own attribution. */
export const DATA_ATTRIBUTION =
  '<a href="https://data.stadt-zuerich.ch/dataset/geo_stadtkreise" target="_blank" rel="noopener">Stadtkreise © Stadt Zürich</a>';
