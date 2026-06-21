#!/usr/bin/env node

/**
 * 硬约束：包注册表中声明了 resourceKey 的模块/子模块，
 * 如果存在对应的 app route，则该 page.tsx 或上游 layout.tsx
 * 必须调用 requireRouteAccess("<同一个 href>")。
 */

const fs = require("fs");
const path = require("path");
const { collectModuleDefs, ROOT } = require("./module-registry-reader");

const APP_DIR = path.join(ROOT, "app");

const WHITELIST_PATHS = new Set([
  "/settings",
  "/portal",
  "/login",
  "/history",
]);

const LEGACY_EXCEPTIONS = new Set([]);

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function isWhitelisted(href) {
  return WHITELIST_PATHS.has(href);
}

function walkPages(dir) {
  const output = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      output.push(...walkPages(full));
    } else if (entry === "page.tsx") {
      output.push(full);
    }
  }
  return output;
}

function routeFromPagePath(pagePath) {
  const relativeDir = path.relative(APP_DIR, path.dirname(pagePath)).replace(/\\/g, "/");
  const segments = relativeDir
    .split("/")
    .filter(Boolean)
    .filter((segment) => !segment.startsWith("(") || !segment.endsWith(")"));
  return `/${segments.join("/")}`.replace(/\/+$/g, "") || "/";
}

const PAGE_BY_ROUTE = new Map(walkPages(APP_DIR).map((pagePath) => [routeFromPagePath(pagePath), pagePath]));

function hrefToPagePath(href) {
  return PAGE_BY_ROUTE.get(href) ?? null;
}

function hasRouteGate(filePath, expectedHref, expectedKey) {
  if (!fs.existsSync(filePath)) return false;
  const text = readText(filePath);
  if (expectedKey === "settings.admin" && /\brequireAdminManageAccess\s*\(/.test(text)) {
    return true;
  }
  if (new RegExp(`ModuleHomePage\\s+moduleKey=["']${expectedKey.replace(/\./g, "\\.")}["']`).test(text)) return true;
  const regex = new RegExp(
    `requireRouteAccess\\s*\\(\\s*["']${expectedHref.replace(/\//g, "\\/")}["']\\s*\\)`,
  );
  return regex.test(text);
}

function findLayoutFiles(pageDir) {
  const layouts = [];
  let dir = pageDir;
  while (dir.startsWith(APP_DIR)) {
    const layout = path.join(dir, "layout.tsx");
    if (fs.existsSync(layout)) layouts.push(layout);
    if (dir === APP_DIR) break;
    dir = path.dirname(dir);
  }
  return layouts;
}

function checkPageGate(pagePath, expectedHref, expectedKey) {
  if (!fs.existsSync(pagePath)) return null;
  if (hasRouteGate(pagePath, expectedHref, expectedKey)) return true;
  const pageDir = path.dirname(pagePath);
  return findLayoutFiles(pageDir).some((layout) => hasRouteGate(layout, expectedHref, expectedKey));
}

const violations = [];

for (const def of collectModuleDefs()) {
  if (!def.href || !def.resourceKey) continue;
  if (isWhitelisted(def.href)) continue;

  const pagePath = hrefToPagePath(def.href);
  if (!pagePath) continue;

  const hasGate = checkPageGate(pagePath, def.href, def.key);
  if (hasGate === null) continue;

  const pageRelative = path.relative(ROOT, pagePath).replace(/\\/g, "/");
  if (!hasGate && !LEGACY_EXCEPTIONS.has(pageRelative)) {
    violations.push({
      pagePath: pageRelative,
      sourcePath: path.relative(ROOT, def.filePath).replace(/\\/g, "/"),
      sourceLine: def.line,
      key: def.key,
      expectedHref: def.href,
    });
  }
}

if (violations.length > 0) {
  console.error("✗ Module page gate check failed.");
  for (const v of violations) {
    console.error(
      `  ${v.pagePath} — missing requireRouteAccess("${v.expectedHref}") in page.tsx or upstream layout.tsx (declared at ${v.sourcePath}:${v.sourceLine} for ${v.key})`,
    );
  }
  process.exit(1);
}

console.log("✓ Module page gate check passed.");
