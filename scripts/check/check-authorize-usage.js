#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const API_ROOT = path.join(ROOT, "app/api");
const baseline = JSON.parse(
  fs.readFileSync(path.join(__dirname, "level1-api-baseline.json"), "utf8"),
);

const directPermissionBaseline = new Set(baseline.directPermissionFiles);
const directPrismaBaseline = new Set(baseline.directPrismaFiles);

const PUBLIC_API_ROUTES = new Set([
  "app/api/auth/dev-login/route.ts",
  "app/api/auth/gateway-check/route.ts",
  "app/api/auth/me/route.ts",
  "app/api/auth/wecom/callback/route.ts",
  "app/api/auth/wecom/start/route.ts",
  "app/api/auth/dev-login-bypass/route.ts",
  "app/api/me/week-info/route.ts",
]);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const errors = [];

const AUTHORIZE_ENTRY = "packages/platform/server/auth/authorize.ts";
const REQUIRED_DELEGATE_FILES = [
  "packages/platform/server/auth/admin.ts",
  "packages/platform/server/auth/domain.ts",
  "packages/platform/server/auth/finance.ts",
  "packages/platform/server/auth/authenticate.ts",
  "packages/platform/server/auth/guard.ts",
  "packages/platform/server/auth/library.ts",
];

const authorizePath = path.join(ROOT, AUTHORIZE_ENTRY);
if (!fs.existsSync(authorizePath)) {
  errors.push(`${AUTHORIZE_ENTRY} is missing`);
} else if (!/\bexport\s+async\s+function\s+authorize\b/.test(fs.readFileSync(authorizePath, "utf8"))) {
  errors.push(`${AUTHORIZE_ENTRY} must export async function authorize`);
}

for (const requiredFile of REQUIRED_DELEGATE_FILES) {
  const text = fs.readFileSync(path.join(ROOT, requiredFile), "utf8");
  if (!/\bauthorize\b/.test(text)) {
    errors.push(`${requiredFile} must delegate permission decisions to authorize()`);
  }
}

for (const file of walk(API_ROOT)) {
  const rel = relative(file);
  const code = stripComments(fs.readFileSync(file, "utf8"));
  const isRoute = rel.endsWith("/route.ts");
  const exportsHandler = /\bexport\s+(?:const|async\s+function)\s+(GET|POST|PUT|PATCH|DELETE)\b/.test(code);

  if (isRoute && exportsHandler && !PUBLIC_API_ROUTES.has(rel)) {
    const hasAuthGate = /\bauthorize\s*\(/.test(code) ||
      /\bwith(?:Auth|[A-Z][A-Za-z]*(?:Access|Write|Delete))\s*\(/.test(code);
    const usesLegacyGate = /\bauthenticate\s*\(/.test(code) ||
      /\bgetCurrentUser\s*\(/.test(code) ||
      /\brequireCurrentUser\s*\(/.test(code);
    const delegatesToPackageService = /\bfrom\s+["']@workspace\/[^"']+\/server["']/.test(code);
    const delegatesToProxyRoute = /\bcreate(?:Compatibility|ValidatedId)?ProxyHandler\b/.test(code) ||
      /\bfetch\s*\(\s*target\b/.test(code) ||
      /\bnew\s+URL\s*\(\s*["']\/api\//.test(code);
    const usesSecretTokenGate = /x-qc-cache-warmup|NEXTAUTH_SECRET/.test(code);
    const usesDisabledHandler = /\binventoryApiGone\b/.test(code);

    if (!hasAuthGate && !usesLegacyGate && !delegatesToPackageService && !delegatesToProxyRoute && !usesSecretTokenGate && !usesDisabledHandler) {
      errors.push(`${rel} exports API handlers without an authentication/authorization gate`);
    }
  }

  if (/\bcheckPermission\s*\(/.test(code) && !directPermissionBaseline.has(rel)) {
    errors.push(`${rel} uses direct checkPermission(); use authorize() or a wrapper that delegates to authorize()`);
  }

  if (/\bprisma\./.test(code) && !directPrismaBaseline.has(rel)) {
    errors.push(`${rel} uses Prisma directly in app/api; move business logic to package server service`);
  }
}

for (const rel of directPermissionBaseline) {
  if (fs.existsSync(path.join(ROOT, rel))) continue;
  directPermissionBaseline.delete(rel);
}

for (const rel of directPrismaBaseline) {
  if (fs.existsSync(path.join(ROOT, rel))) continue;
  directPrismaBaseline.delete(rel);
}

if (errors.length > 0) {
  console.error("✗ Authorize/API Level 1 check failed.");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log("✓ Authorize/API Level 1 check passed.");
