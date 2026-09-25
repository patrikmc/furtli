import type { Metadata, Viewport } from "next";
// Self-hosted brand fonts (npm packages, bundled at build time): no request
// to Google Fonts at build or run time, so CI and offline dev keep working.
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./globals.css";

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
      <body className="min-h-full">{children}</body>
    </html>
  );
}
