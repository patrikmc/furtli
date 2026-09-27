import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a phone on the same Wi-Fi open the dev server (http://<your-ip>:3000).
  // Add your machine's LAN IP here if it changes.
  allowedDevOrigins: ["192.168.1.7"],

  // Keep search engines out of everything except production (staging on
  // furtli-web.vercel.app, PR previews, local). VERCEL_TARGET_ENV is "staging" for the custom
  // environment; VERCEL_ENV is the fallback on older builds.
  async headers() {
    const target = process.env.VERCEL_TARGET_ENV ?? process.env.VERCEL_ENV;
    if (target === "production") return [];
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
