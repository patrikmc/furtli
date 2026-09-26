/**
 * Base map configuration. Switching provider is an env change only
 * (acceptance criterion A7): set NEXT_PUBLIC_MAP_STYLE_URL, restart.
 *
 * /maptiler and /compare use the presets below to put MapTiler next to
 * swisstopo for the base-map decision (spec section 3).
 */
export type BasemapProvider = "swisstopo" | "maptiler" | "custom";

export interface Basemap {
  /** Stable id used in URLs, e.g. "swisstopo-light" or "maptiler-dataviz". */
  id: string;
  label: string;
  provider: BasemapProvider;
  url: string;
}

export const SWISSTOPO_LIGHT =
  "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json";

export const SWISSTOPO_PRESETS: Basemap[] = [
  { id: "swisstopo-light", label: "swisstopo Light", provider: "swisstopo", url: SWISSTOPO_LIGHT },
  {
    id: "swisstopo-base",
    label: "swisstopo Base",
    provider: "swisstopo",
    url: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.basemap.vt/style.json",
  },
];

/**
 * MapTiler Cloud map ids worth comparing for a data overlay. Any other
 * MapTiler map id also works via ?style=<id>.
 */
export const MAPTILER_STYLES: { id: string; label: string }[] = [
  { id: "dataviz", label: "Dataviz" },
  { id: "streets-v2", label: "Streets" },
  { id: "basic-v2", label: "Basic" },
  { id: "bright-v2", label: "Bright" },
  { id: "pastel", label: "Pastel" },
  { id: "backdrop", label: "Backdrop" },
  { id: "topo-v2", label: "Topo" },
];
export const DEFAULT_MAPTILER_STYLE = "dataviz";

/**
 * Browser-visible by design (map tiles are fetched client-side). Restrict
 * the key to your domains in the MapTiler dashboard (Account → Keys →
 * Allowed HTTP origins): localhost, the Vercel preview domain, production.
 */
export const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || "";

const MAPTILER_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;

/** Builds a MapTiler preset; returns null without a key or with an invalid id. */
export function maptilerBasemap(styleId: string | undefined | null, key = MAPTILER_KEY): Basemap | null {
  if (!key) return null;
  const id = styleId && MAPTILER_ID.test(styleId) ? styleId : DEFAULT_MAPTILER_STYLE;
  const known = MAPTILER_STYLES.find((s) => s.id === id);
  return {
    id: `maptiler-${id}`,
    label: `MapTiler ${known?.label ?? id}`,
    provider: "maptiler",
    url: `https://api.maptiler.com/maps/${id}/style.json?key=${encodeURIComponent(key)}`,
  };
}

/** Every preset available in this environment (MapTiler only with a key). */
export function allBasemaps(): Basemap[] {
  return [
    ...SWISSTOPO_PRESETS,
    ...(MAPTILER_KEY ? MAPTILER_STYLES.map((s) => maptilerBasemap(s.id)!) : []),
  ];
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
    provider: env.includes("api.maptiler.com") ? "maptiler" : "custom",
    url: env,
  };
})();

/** Credit for our own overlay data; the base map brings its own attribution. */
export const DATA_ATTRIBUTION =
  '<a href="https://data.stadt-zuerich.ch/dataset/geo_stadtkreise" target="_blank" rel="noopener">Stadtkreise © Stadt Zürich</a>';
