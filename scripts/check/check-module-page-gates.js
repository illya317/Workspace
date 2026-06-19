#!/usr/bin/env node

/**
 * 硬约束：包注册表中声明了 resourceKey 的模块/子模块，
 * 如果存在对应的 app/<path>/page.tsx，则该 page.tsx 或上游 layout.tsx
 * 必须调用 requireResourceAccess("<同一个 resourceKey>")。
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
  if (WHITELIST_PATHS.has(href)) return true;
  for (const prefix of WHITELIST_PATHS) {
    if (href.startsWith(prefix + "/")) return true;
  }
  return false;
}

function hrefToPagePath(href) {
  const relative = href.replace(/^\//, "");
  if (!relative) return null;
  return path.join(APP_DIR, relative, "page.tsx");
}

function hasResourceGate(filePath, expectedResourceKey) {
  if (!fs.existsSync(filePath)) return false;
  const text = readText(filePath);
  const regex = new RegExp(
    `requireResourceAccess\\s*\\(\\s*["']${expectedResourceKey.replace(/\./g, "\\.")}["']\\s*\\)`,
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

function checkPageGate(pagePath, expectedResourceKey) {
  if (!fs.existsSync(pagePath)) return null;
  if (hasResourceGate(pagePath, expectedResourceKey)) return true;
  const pageDir = path.dirname(pagePath);
  return findLayoutFiles(pageDir).some((layout) => hasResourceGate(layout, expectedResourceKey));
}

const violations = [];

for (const def of collectModuleDefs()) {
  if (!def.href || !def.resourceKey) continue;
  if (isWhitelisted(def.href)) continue;

  const pagePath = hrefToPagePath(def.href);
  if (!pagePath) continue;

  const hasGate = checkPageGate(pagePath, def.resourceKey);
  if (hasGate === null) continue;

  const pageRelative = path.relative(ROOT, pagePath).replace(/\\/g, "/");
  if (!hasGate && !LEGACY_EXCEPTIONS.has(pageRelative)) {
    violations.push({
      pagePath: pageRelative,
      sourcePath: path.relative(ROOT, def.filePath).replace(/\\/g, "/"),
      sourceLine: def.line,
      key: def.key,
      expectedResourceKey: def.resourceKey,
    });
  }
}

if (violations.length > 0) {
  console.error("✗ Module page gate check failed.");
  for (const v of violations) {
    console.error(
      `  ${v.pagePath} — missing requireResourceAccess("${v.expectedResourceKey}") in page.tsx or upstream layout.tsx (declared at ${v.sourcePath}:${v.sourceLine} for ${v.key})`,
    );
  }
  process.exit(1);
}

console.log("✓ Module page gate check passed.");
