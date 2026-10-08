import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Every image ships pre-tuned WebP. The on-the-fly optimizer adds nothing and was seen hanging on cold
  // concurrent requests in the container, which left NYX blank; serve the files as they are.
  images: { unoptimized: true },
};

export default nextConfig;
