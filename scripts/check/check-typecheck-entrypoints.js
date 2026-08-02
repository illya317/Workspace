#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const governedRoots = [
  ".githooks",
  "ops",
  "scripts",
  ".agents/skills",
  "docs/engineering",
  "docs/planning/short-term",
  "docs/planning/tracking",
];
const governedFiles = ["AGENTS.md", "package.json"];
const sourceExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".sh", ".md", ".yml", ".yaml"]);
const excludedFiles = new Set([
  "scripts/check/check-typecheck-entrypoints.js",
  "scripts/check/typecheck-entrypoints.test.js",
]);
const rawCompilerPatterns = [
  /\bnpx\s+tsc\b/g,
  /\bnpm\s+exec(?:\s+--)?\s+tsc\b/g,
  /node_modules\/\.bin\/tsc\b/g,
  /(?:^|[;&|]\s*)tsc\s+-b\b/gm,
  /(?:^|[;&|]\s*)tsc\s+--(?:noEmit|project|build)\b/gm,
];

function walk(relativeDirectory) {
  const absoluteDirectory = path.join(repoRoot, relativeDirectory);
  if (!fs.existsSync(absoluteDirectory)) return [];
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) return walk(relativePath);
    if (!entry.isFile() || !sourceExtensions.has(path.extname(entry.name))) return [];
    if (/\.test\.[cm]?[jt]s$/.test(entry.name) || excludedFiles.has(relativePath)) return [];
    return [relativePath];
  });
}

function findRawCompilerInvocations(source) {
  return rawCompilerPatterns.flatMap((pattern) => {
    pattern.lastIndex = 0;
    return [...source.matchAll(pattern)].map((match) => match[0].trim());
  });
}

function scanRepository() {
  const candidates = [...governedFiles, ...governedRoots.flatMap(walk)];
  return [...new Set(candidates)].sort().flatMap((relativePath) => {
    const absolutePath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(absolutePath)) return [];
    const source = fs.readFileSync(absolutePath, "utf8");
    return findRawCompilerInvocations(source).map((match) => ({ relativePath, match }));
  });
}

function main() {
  const violations = scanRepository();
  if (violations.length === 0) {
    console.log("TypeScript entrypoint policy passed.");
    return 0;
  }
  console.error("Raw TypeScript compiler invocations bypass the project lock:");
  for (const violation of violations) {
    console.error(`- ${violation.relativePath}: ${violation.match}`);
  }
  console.error("Use `npm run typecheck:scope -- <scope>`, `npm run typecheck:affected`, `npm run typecheck:quick`, or `npm run typecheck:full`.");
  return 1;
}

if (require.main === module) process.exitCode = main();

module.exports = { findRawCompilerInvocations, main, scanRepository };
