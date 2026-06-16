import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["pinyin-pro"],
  basePath,
  // Allow LAN access in development via env (e.g. ALLOWED_DEV_ORIGINS=192.168.31.243)
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
    : [],
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
