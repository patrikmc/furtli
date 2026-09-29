/** Screen-space padding around the part of the map that should show the focus. */
export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const mercX = (lng: number) => (lng + 180) / 360;
const mercY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / Math.PI) / 2;
};
const unmercY = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

/**
 * Centre and zoom that frame `bounds` ([w, s, e, n]) inside a `width` × `height`
 * map, minus `padding` (MapLibre: Web Mercator, 512 px tiles).
 *
 * Why not map.fitBounds: MapLibre adds the map's *persistent* padding (left
 * behind by every flyTo/easeTo with `padding`, and by a deep link's initial
 * view) to fitBounds' own. On a phone, header + sheet padding counted twice
 * exceeds the screen height, and fitBounds silently does nothing ("Map cannot
 * fit within canvas"). Pass the result to easeTo together with the same
 * `padding`, so the persistent padding stays consistent.
 */
export function fitCamera(
  bounds: readonly [number, number, number, number],
  width: number,
  height: number,
  padding: Padding,
  maxZoom = 16,
): { center: [number, number]; zoom: number } {
  const [w, s, e, n] = bounds;
  const dx = Math.max(mercX(e) - mercX(w), 1e-9);
  const dy = Math.max(mercY(s) - mercY(n), 1e-9);
  // Never less than a sliver: an extreme padding still yields a sane camera.
  const availW = Math.max(width - padding.left - padding.right, 40);
  const availH = Math.max(height - padding.top - padding.bottom, 40);
  const zoom = Math.min(maxZoom, Math.log2(Math.min(availW / (dx * 512), availH / (dy * 512))));
  return { center: [(w + e) / 2, unmercY((mercY(s) + mercY(n)) / 2)], zoom };
}
