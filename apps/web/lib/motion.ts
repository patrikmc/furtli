/** Respect prefers-reduced-motion for flyTo / easeTo animations. */
export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
