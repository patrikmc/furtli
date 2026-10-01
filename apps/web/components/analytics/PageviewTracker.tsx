"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { trackPageview } from "@/lib/analytics/umami";

/**
 * One Umami pageview per path. The tracker runs with data-auto-pageview="false"
 * because it would otherwise count every history.replaceState as a view, and
 * the map rewrites its query string on each search and station tap. Query-only
 * changes therefore never count; moving from / to /datenschutz does.
 */
export function PageviewTracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!pathname || pathname === last.current) return;
    const previous = last.current ?? undefined;
    last.current = pathname;
    trackPageview(previous);
  }, [pathname]);
  return null;
}
