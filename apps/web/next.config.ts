import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a phone on the same Wi-Fi open the dev server (http://<your-ip>:3000).
  // Add your machine's LAN IP here if it changes.
  allowedDevOrigins: ["192.168.1.7"],

  // Keep search engines out of everything except the live site. Both Vercel
  // projects (staging and production) build as "production", so the live one
  // is marked explicitly with APP_ENV=production (production project only).
  async headers() {
    if (process.env.APP_ENV === "production") return [];
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
