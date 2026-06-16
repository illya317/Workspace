#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const TARGET_DIRS = ["app", "lib", "server", "ops"];
const TARGET_FILES = [
  "scripts/check/check-db.js",
  "scripts/sync-budget-accounts.js",
  "scripts/balance-sheet-diff.ts",
  "scripts/balance-sheet-smoke-all.ts",
  "scripts/statement-workpapers-smoke.ts",
  "scripts/income-system-smoke.ts",
  "scripts/review-report-smoke.ts",
  "scripts/import-cash-flow-workpapers.ts",
  "scripts/lib/database-url.js",
];
const ALLOWED_FILES = new Set([
  "scripts/check/check-database-paths.js",
  "scripts/check/check-workspace-runtime.js",
]);

const FORBIDDEN_PATTERNS = [
  {
    pattern: /(?:["'`])(?:\.\/)?data\/dev\.db(?:["'`])/,
    message: "hardcoded data/dev.db path",
  },
  {
    pattern: /(?:["'`])(?:\.\.\/)*prisma\/dev\.db(?:["'`])/,
    message: "hardcoded prisma/dev.db path",
  },
  {
    pattern: /DATABASE_URL[^;\n]*(?:\?\?|[|]{2})[^;\n]*(?:data\/dev\.db|prisma\/dev\.db)/,
    message: "DATABASE_URL fallback path",
  },
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else if (/\.(?:js|mjs|cjs|ts|tsx|sh)$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

let failed = false;
for (const dir of TARGET_DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    const rel = path.relative(ROOT, file);
    if (ALLOWED_FILES.has(rel)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const { pattern, message } of FORBIDDEN_PATTERNS) {
      if (pattern.test(text)) {
        console.error(`✗ ${rel}: ${message}. Use required absolute DATABASE_URL/WORKSPACE_CONFIG_DIR instead.`);
        failed = true;
      }
    }
  }
}
for (const rel of TARGET_FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const { pattern, message } of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) {
      console.error(`✗ ${rel}: ${message}. Use required absolute DATABASE_URL/WORKSPACE_CONFIG_DIR instead.`);
      failed = true;
    }
  }
}

if (failed) {
  console.error("\n✗ Database path check failed. Runtime code must not fall back to cwd-relative SQLite files.");
  process.exit(1);
}

console.log("✓ Database path check passed");
