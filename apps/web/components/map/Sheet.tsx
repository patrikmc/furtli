"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useLang } from "@/components/i18n/LangProvider";

/** Mobile sheet heights (MapShell's panelPadding keeps the focus above the compact one). */
export const SHEET_COMPACT = 0.4;
const COMPACT = "40dvh";
const EXPANDED = "85dvh";
/** Drag distance (px) that switches between compact and expanded. */
const SNAP = 48;
/** Dragging the compact sheet down this far closes it. */
const DISMISS = 140;

/**
 * Bottom sheet below 768 px, left side panel above (acceptance A4).
 * One container for both the nearby list and station details.
 *
 * On phones the sheet opens compact (40% of the screen) so the map around
 * the pin stays visible. Drag the handle up, or tap it, to expand to 85%;
 * drag down to shrink again, or further down to close.
 */
export function Sheet({
  title,
  subtitle,
  onClose,
  onBack,
  testId,
  collapseKey,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  onBack?: () => void;
  testId: string;
  /** When this changes (e.g. a new postcode was picked), shrink back to compact so the map shows the new focus. */
  collapseKey?: string;
  children: ReactNode;
}) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(false);
  const [dragY, setDragY] = useState<number | null>(null);
  const start = useRef<{ y: number; moved: boolean } | null>(null);

  // A new collapseKey (e.g. another postcode picked) shrinks the sheet back to
  // compact, so the newly framed area is visible. Adjusted during render
  // (React's "storing information from previous renders"), not in an effect.
  const [seenKey, setSeenKey] = useState(collapseKey);
  if (seenKey !== collapseKey) {
    setSeenKey(collapseKey);
    setExpanded(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    start.current = { y: e.clientY, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // not supported (e.g. test DOM): the drag still works while the finger stays on the handle
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!start.current) return;
    const dy = e.clientY - start.current.y;
    if (Math.abs(dy) > 4) start.current.moved = true;
    if (start.current.moved) setDragY(dy);
  };
  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const s = start.current;
    start.current = null;
    setDragY(null);
    if (!s) return;
    const dy = e.clientY - s.y;
    if (!s.moved) setExpanded((x) => !x); // a tap toggles
    else if (dy < -SNAP) setExpanded(true);
    else if (dy > SNAP && expanded) setExpanded(false);
    else if (dy > DISMISS) onClose();
  };
  const onPointerCancel = () => {
    start.current = null;
    setDragY(null);
  };

  const base = expanded ? EXPANDED : COMPACT;
  // While dragging, the sheet follows the finger (only the mobile max-height is overridden).
  const dragStyle = dragY === null ? undefined : { ["--sheet-h" as string]: `max(8rem, min(92dvh, calc(${base} - ${dragY}px)))` };

  return (
    <section
      role="dialog"
      aria-label={title}
      data-testid={testId}
      data-expanded={expanded}
      style={{ ["--sheet-h" as string]: base, ...dragStyle }}
      className={`pointer-events-auto absolute inset-x-0 bottom-0 z-20 max-h-(--sheet-h) overflow-y-auto overscroll-contain rounded-t-3xl bg-paper px-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(23,34,59,0.18)] md:inset-x-auto md:top-[7.5rem] md:bottom-auto md:left-4 md:max-h-[calc(100dvh-9rem)] md:w-[26rem] md:rounded-3xl md:px-5 md:pt-5 md:pb-5 ${
        dragY === null ? "transition-[max-height] duration-200 ease-out motion-reduce:transition-none" : ""
      }`}
    >
      {/* Drag handle (phones only): sticky so it stays reachable while the content scrolls. */}
      <div className="sticky top-0 z-10 -mx-4 bg-paper px-4 md:hidden">
        <button
          type="button"
          aria-label={expanded ? t.sheet.shrink : t.sheet.expand}
          aria-expanded={expanded}
          data-testid="sheet-handle"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setExpanded((x) => !x);
            }
          }}
          className="flex h-6 w-full touch-none items-center justify-center"
        >
          <span className="h-1.5 w-10 rounded-full bg-ink/20" aria-hidden />
        </button>
      </div>
      <div className="flex items-start gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t.sheet.back}
            className="-mt-1 -ml-2 rounded-full p-2 text-ink/60 hover:bg-ink/5 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl leading-tight font-bold text-ink md:text-2xl">{title}</h2>
          {subtitle && <div className="mt-0.5 text-xs text-ink/60 md:text-sm">{subtitle}</div>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.sheet.close}
          className="-mt-1.5 -mr-2 rounded-full p-2 text-ink/60 hover:bg-ink/5 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {children}
    </section>
  );
}
