#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const TARGET_DIRS = ["app", "lib", "server", "packages", "ops", "scripts"];
const ALLOWED_FILES = new Set([
  "scripts/check/check-architecture-governance.js",
  "scripts/check/check-database-paths.js",
  "scripts/check/check-workspace-runtime.js",
]);

const FORBIDDEN_PATTERNS = [
  {
    pattern: /@prisma\/adapter-better-sqlite3|require\(["']better-sqlite3["']\)|from ["']better-sqlite3["']/,
    message: "SQLite runtime adapter dependency",
  },
  {
    pattern: /(?:import\s+sqlite3|from\s+sqlite3\s+import|require\(["']sqlite3["']\))/,
    message: "SQLite runtime dependency",
  },
  {
    pattern: /(?:from\s+["']@prisma\/client["']|require\(["']@prisma\/client["']\)|new\s+PrismaClient\s*\(\s*\))/,
    message: "Prisma client without the repository PostgreSQL adapter contract",
  },
  {
    pattern: /DATABASE_URL[^\n]*(?:startsWith\(["']file:|replace\([^\n]*\^?file:)/,
    message: "SQLite file DATABASE_URL handling",
  },
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
    else if (/\.(?:js|mjs|cjs|ts|tsx|sh|py)$/.test(entry.name) && !/\.(?:test|spec)\.[^.]+$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

let failed = false;
for (const dir of TARGET_DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    const rel = path.relative(ROOT, file);
    if (rel.startsWith("scripts/migrate/sqlite-legacy/")) continue;
    if (ALLOWED_FILES.has(rel)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const { pattern, message } of FORBIDDEN_PATTERNS) {
      if (pattern.test(text)) {
        console.error(`✗ ${rel}: ${message}. Runtime database access must use PostgreSQL.`);
        failed = true;
      }
    }
  }
}

if (failed) {
  console.error("\n✗ Database provider check failed. Runtime code must not depend on SQLite.");
  process.exit(1);
}

console.log("✓ PostgreSQL runtime provider check passed");
