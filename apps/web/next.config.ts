import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // The sample quiz content (content/quizzes/*.yaml) links thumbnail/cover
    // images from Unsplash. Add your own image host(s) here — or none at
    // all, if you swap in an object storage bucket per docs/ARCHITECTURE.md.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  allowedDevOrigins: ['192.168.1.7'],
};

export default nextConfig;
