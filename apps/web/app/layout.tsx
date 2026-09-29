import type { Metadata, Viewport } from "next";
import Script from "next/script";
// Self-hosted brand fonts (npm packages, bundled at build time): no request
// to Google Fonts at build or run time, so CI and offline dev keep working.
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./globals.css";
import { AttributionCapture } from "@/components/analytics/AttributionCapture";
import { LangProvider } from "@/components/i18n/LangProvider";
import { HTML_LANG } from "@/lib/i18n/lang";
import { getLang } from "@/lib/i18n/server";
import { ui } from "@/lib/i18n/ui";
import { UMAMI_BEFORE_SEND_JS, UMAMI_OPT_OUT_JS, umamiEnabled, umamiScriptAttrs } from "@/lib/analytics/umami";
import { SpeedInsightsClient } from "@/components/analytics/SpeedInsightsClient";


// Umami is loaded wherever a website id is configured (production, staging,
// local dev); tests and CI have none. NEXT_PUBLIC_UMAMI_DOMAINS limits which
// hostnames are counted.
const umamiId = umamiEnabled() ? process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID : undefined;
const umamiSrc = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL || "https://cloud.umami.is/script.js";
const umamiDomains = process.env.NEXT_PUBLIC_UMAMI_DOMAINS;

export async function generateMetadata(): Promise<Metadata> {
  const t = ui(await getLang()).meta;
  return { title: { default: t.title, template: "%s · Furtli" }, description: t.description };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F3F5F2",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();
  return (
    <html lang={HTML_LANG[lang]} className="h-full antialiased">
      <body className="min-h-full">
        <LangProvider initialLang={lang}>{children}</LangProvider>
        <AttributionCapture />
        <SpeedInsightsClient />
        {umamiId && (
          <>
            {/* ?umami=off opt-out, and strips the tapped location (?at=) etc. from what Umami receives; must exist before the tracker runs. */}
            <Script id="umami-before-send" strategy="beforeInteractive">
              {UMAMI_OPT_OUT_JS + UMAMI_BEFORE_SEND_JS}
            </Script>
            {/* One tracker tag: pageviews, events and Core Web Vitals (data-performance). */}
            <Script src={umamiSrc} strategy="afterInteractive" {...umamiScriptAttrs(umamiId, umamiDomains)} />
          </>
        )}
      </body>
    </html>
  );
}
