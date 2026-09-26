"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/analytics/attribution";

/** Remembers where this visit came from (UTM tags, referrer) for the sign-up form. Renders nothing. */
export function AttributionCapture() {
  useEffect(() => {
    captureAttribution();
  }, []);
  return null;
}
