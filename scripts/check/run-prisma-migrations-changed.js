#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const MIGRATION_RELEVANT_PATTERNS = [
  /^prisma\/schema\.prisma$/i,
  /^prisma\/models\/.+\.prisma$/i,
  /^prisma\/migrations\/.+\/migration\.sql$/i,
  /^prisma\/migrations\/migration_lock\.toml$/i,
  /^prisma\.config\.ts$/i,
  /^scripts\/check\/check-prisma-migrations\.js$/i,
];

function runGit(args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function unique(values) {
  return Array.from(new Set(values));
}

function isMigrationRelevant(file) {
  return MIGRATION_RELEVANT_PATTERNS.some((pattern) => pattern.test(file));
}

const staged = runGit(["diff", "--name-only", "--diff-filter=ACMR", "--cached"]);
const hasStagedChanges = staged.length > 0;
const candidates = hasStagedChanges
  ? staged
  : unique([
      ...runGit(["diff", "--name-only", "--diff-filter=ACMR", "HEAD", "--"]),
      ...runGit(["ls-files", "--others", "--exclude-standard"]),
    ]);
const relevantFiles = candidates.filter(isMigrationRelevant);

if (relevantFiles.length === 0) {
  process.stdout.write("No changed Prisma migration inputs; skipping.\n");
  process.exit(0);
}

process.stdout.write(`Prisma migration inputs changed:\n${relevantFiles.map((file) => `  - ${file}`).join("\n")}\n`);

const result = spawnSync("node", ["scripts/check/check-prisma-migrations.js"], {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
