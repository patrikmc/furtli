import type { Metadata, Viewport } from "next";
import Script from "next/script";
// Self-hosted brand fonts (npm packages, bundled at build time): no request
// to Google Fonts at build or run time, so CI and offline dev keep working.
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./globals.css";
import { AttributionCapture } from "@/components/analytics/AttributionCapture";
import { UMAMI_BEFORE_SEND_FN, UMAMI_BEFORE_SEND_JS } from "@/lib/analytics/umami";

// Umami is only loaded when a website id is configured (production).
// NEXT_PUBLIC_UMAMI_DOMAINS limits counting to the real domain(s), so a
// preview deployment with the same env doesn't pollute the numbers.
const umamiId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
const umamiSrc = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL || "https://cloud.umami.is/script.js";
const umamiDomains = process.env.NEXT_PUBLIC_UMAMI_DOMAINS;

export const metadata: Metadata = {
  title: { default: "Furtli – Recycling in Zürich", template: "%s · Furtli" },
  description: "Wo und wann du in Zürich entsorgen kannst: Mobile Recyclinghöfe, Sonderabfallmobil und Sammelstellen auf einer Karte.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F3F5F2",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de-CH" className="h-full antialiased">
      <body className="min-h-full">
        {children}
        <AttributionCapture />
        {umamiId && (
          <>
            {/* Strips the tapped location (?at=) etc. from what Umami receives; must exist before the tracker runs. */}
            <Script id="umami-before-send" strategy="beforeInteractive">
              {UMAMI_BEFORE_SEND_JS}
            </Script>
            <Script
              src={umamiSrc}
              strategy="afterInteractive"
              data-website-id={umamiId}
              data-before-send={UMAMI_BEFORE_SEND_FN}
              data-exclude-hash="true"
              {...(umamiDomains ? { "data-domains": umamiDomains } : {})}
            />
          </>
        )}
      </body>
    </html>
  );
}
