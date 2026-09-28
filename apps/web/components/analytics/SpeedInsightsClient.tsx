"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";

/** Page-speed measurements from real visitors. The query string is dropped so the tapped point (?at=) is never sent. */
export function SpeedInsightsClient() {
  return <SpeedInsights beforeSend={(e) => ({ ...e, url: e.url.split("?")[0] })} />;
}