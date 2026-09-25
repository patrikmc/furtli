import { KINDS } from "@/lib/geo/kinds";
import type { StationKind } from "@/lib/geo/types";

/** Small SVG version of the map marker, for chips, lists and the sheet. */
export function KindDot({ kind, size = 22 }: { kind: StationKind; size?: number }) {
  const k = KINDS[kind];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <circle cx="12" cy="12" r="12" fill={k.color} />
      <g transform="translate(5.4 5.4) scale(0.55)">
        <path d={k.glyph} fill={k.glyphColor} />
      </g>
    </svg>
  );
}
