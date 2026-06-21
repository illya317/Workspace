import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.dirname(projectRoot);

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["pinyin-pro"],
  basePath,
  // Allow local aliases in development; LAN access can still be added via env.
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    ...(process.env.ALLOWED_DEV_ORIGINS
      ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
      : []),
  ],
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
