import { loadWorkspaceEnv } from "./lib/env-loader";
loadWorkspaceEnv();

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["pinyin-pro"],
  // Allow LAN access in development via env (e.g. ALLOWED_DEV_ORIGINS=192.168.31.243)
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
    : [],
};

export default nextConfig;
