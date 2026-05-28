import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["pinyin-pro"],
};

export default nextConfig;
