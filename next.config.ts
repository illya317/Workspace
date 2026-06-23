import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.dirname(projectRoot);
const buildVersion =
  process.env.NEXT_PUBLIC_BUILD_VERSION ||
  process.env.BUILD_VERSION ||
  process.env.CNB_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  `local-${Date.now()}`;

const noStoreHeaders = [
  { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
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
  generateBuildId: async () => buildVersion,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: noStoreHeaders,
      },
    ];
  },
};

export default nextConfig;
