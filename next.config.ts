import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["pinyin-pro", "better-sqlite3", "@prisma/adapter-better-sqlite3"],
};

export default nextConfig;
