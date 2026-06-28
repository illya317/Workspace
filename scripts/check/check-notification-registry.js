#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const NOTIFICATION_REGISTRY_FILE = "packages/platform/server/notifications.ts";
const SEARCH_ROOTS = ["app", "packages"];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function lineForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

const files = SEARCH_ROOTS.flatMap((root) => walk(path.join(ROOT, root)));
const errors = [];

for (const file of files) {
  const relativePath = rel(file);
  const text = stripComments(fs.readFileSync(file, "utf8"));
  if (relativePath === NOTIFICATION_REGISTRY_FILE) continue;

  for (const match of text.matchAll(/\bcreateNotification\s*\(/g)) {
    errors.push(`${relativePath}:${lineForIndex(text, match.index ?? 0)} must use sendNotification(type + payload) instead of createNotification()`);
  }

  if (/import\s*\{[^}]*\bcreateNotification\b[^}]*\}\s*from\s*["']@workspace\/platform\/server\/notifications["']/.test(text)) {
    errors.push(`${relativePath}: direct createNotification import is not allowed outside ${NOTIFICATION_REGISTRY_FILE}`);
  }
}

if (errors.length > 0) {
  console.error("✗ Notification registry check failed.");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log("✓ Notification registry check passed.");
