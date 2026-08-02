import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/workspace";
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.dirname(projectRoot);

function resolveLocalBuildVersion() {
  try {
    const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    if (/^[0-9a-f]{40}$/.test(commitSha)) {
      return `local-${commitSha}`;
    }
  } catch {
    // Source archives may not include Git metadata; keep one stable local fallback.
  }

  return "local-development";
}

const buildVersion =
  process.env.NEXT_PUBLIC_BUILD_VERSION ||
  process.env.BUILD_VERSION ||
  process.env.CNB_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  resolveLocalBuildVersion();

const noStoreHeaders = [
  { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
];

const agentRuntimeSourceTraceExcludes = [
  "app/**/*",
  "docs/**/*",
  "packages/**/*",
  "scripts/**/*",
  "*.{cjs,json,md,mjs,ts}",
];

// Library storage paths are tenant runtime data, not repository inputs. When
// NFT sees those dynamic fs paths it can otherwise conservatively copy the
// whole checkout into every Library route trace.
const libraryRuntimeSourceTraceExcludes = [
  "app/**/*",
  "docs/**/*",
  "e2e/**/*",
  "generated/**/*",
  "outputs/**/*",
  "packages/**/*",
  "prisma/**/*",
  "scripts/**/*",
  "test-results/**/*",
  "tmp/**/*",
  "*.{cjs,json,md,mjs,ts,tsbuildinfo}",
];

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    tsconfigPath: "tsconfig.app.json",
    // CI/release runs the complete project-reference graph first. Skip only
    // Next's duplicate, incomplete traversal after that authoritative gate.
    ignoreBuildErrors: process.env.WORKSPACE_NEXT_TYPECHECK_AUTHORITY === "external",
  },
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    turbopackFileSystemCacheForDev: false,
    turbopackFileSystemCacheForBuild: true,
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
  outputFileTracingExcludes: {
    "/*": [".git", ".git/**/*", "../.workspace/**/*"],
    "/agent/**": agentRuntimeSourceTraceExcludes,
    "/api/agent": agentRuntimeSourceTraceExcludes,
    "/api/agent/**": agentRuntimeSourceTraceExcludes,
    "/api/integrations/wecom/**": agentRuntimeSourceTraceExcludes,
    "/api/modules/agent/**": agentRuntimeSourceTraceExcludes,
    "/api/modules/library/**": libraryRuntimeSourceTraceExcludes,
  },
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
