#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { changedFileSets } = require("./changed-files");

const repoRoot = path.resolve(__dirname, "../..");
const MIGRATION_RELEVANT_PATTERNS = [
  /^prisma\/schema\.prisma$/i,
  /^prisma\/models\/.+\.prisma$/i,
  /^prisma\/migrations\/.+\/migration\.sql$/i,
  /^prisma\/migrations\/migration_lock\.toml$/i,
  /^prisma\.config\.ts$/i,
  /^scripts\/check\/check-prisma-migrations\.js$/i,
];

function isMigrationRelevant(file) {
  return MIGRATION_RELEVANT_PATTERNS.some((pattern) => pattern.test(file));
}

const { files: candidates, source } = changedFileSets({ cwd: repoRoot });
const relevantFiles = candidates.filter(isMigrationRelevant);

if (relevantFiles.length === 0) {
  process.stdout.write(`No changed Prisma migration inputs (${source}); skipping.\n`);
  process.exit(0);
}

process.stdout.write(`Prisma migration inputs changed:\n${relevantFiles.map((file) => `  - ${file}`).join("\n")}\n`);

const migrationCheckMode = process.env.PRISMA_MIGRATION_CHECK_MODE?.trim() || "full";
if (!new Set(["full", "static"]).has(migrationCheckMode)) {
  process.stderr.write("PRISMA_MIGRATION_CHECK_MODE must be full or static.\n");
  process.exit(2);
}

const migrationCheckArgs = ["scripts/check/check-prisma-migrations.js"];
if (migrationCheckMode === "static") migrationCheckArgs.push("--static");

const result = spawnSync("node", migrationCheckArgs, {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
