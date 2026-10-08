import type { NextConfig } from "next";

// Read at build time and baked into the standalone server: compose passes API_URL=http://api:8000 as a build arg.
const apiUrl = process.env.API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  images: { unoptimized: true },
  rewrites: async () => [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }],
};

export default nextConfig;
