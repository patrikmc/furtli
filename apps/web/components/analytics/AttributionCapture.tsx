"use client";

import { useEffect } from "react";
import { captureAttribution, visitSourceProps } from "@/lib/analytics/attribution";
import { trackWhenReady } from "@/lib/analytics/umami";

/**
 * Remembers where this visit came from (UTM tags, referrer) for the sign-up
 * form, and sends one "visit_source" event per browser session (channel,
 * source, post ID, campaign, referrer, landing page). Renders nothing.
 */
export function AttributionCapture() {
  useEffect(() => {
    const first = captureAttribution();
    if (first) trackWhenReady("visit_source", visitSourceProps(first));
  }, []);
  return null;
}
