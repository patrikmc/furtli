"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics/umami";

/** Fires one Umami event when a page is shown (e.g. "subscribe_confirmed"). */
export function TrackOnMount({ event, data }: { event: string; data?: Record<string, string | number | boolean> }) {
  const key = JSON.stringify(data ?? {});
  useEffect(() => {
    // The tracker loads after hydration; give it a moment on direct landings.
    const t = window.setTimeout(() => track(event, JSON.parse(key)), 1500);
    return () => window.clearTimeout(t);
  }, [event, key]);
  return null;
}
