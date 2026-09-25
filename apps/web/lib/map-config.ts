/**
 * Base map configuration. Switching provider is an env change only
 * (acceptance criterion A7): set NEXT_PUBLIC_MAP_STYLE_URL, restart.
 */
export const SWISSTOPO_LIGHT =
  "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json";

export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || SWISSTOPO_LIGHT;

const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;

/** Options for the dev-only style switcher (not rendered in production). */
export const DEV_STYLE_OPTIONS: { label: string; url: string }[] = [
  { label: "swisstopo Light", url: SWISSTOPO_LIGHT },
  {
    label: "swisstopo Base",
    url: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.basemap.vt/style.json",
  },
  ...(maptilerKey
    ? [
        {
          label: "MapTiler Dataviz",
          url: `https://api.maptiler.com/maps/dataviz/style.json?key=${maptilerKey}`,
        },
      ]
    : []),
];

/** Credit for our own overlay data; the base map brings its own attribution. */
export const DATA_ATTRIBUTION =
  '<a href="https://data.stadt-zuerich.ch/dataset/geo_stadtkreise" target="_blank" rel="noopener">Stadtkreise © Stadt Zürich</a>';
