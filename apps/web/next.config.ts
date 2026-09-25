import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a phone on the same Wi-Fi open the dev server (http://<your-ip>:3000).
  // Add your machine's LAN IP here if it changes.
  allowedDevOrigins: ["192.168.1.7"],
};

export default nextConfig;
