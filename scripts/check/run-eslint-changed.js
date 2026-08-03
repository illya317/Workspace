#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const { changedFileSets } = require("./changed-files");

const ESLINT_EXTENSIONS = /\.(cjs|cts|js|jsx|mjs|mts|ts|tsx)$/i;
const ESLINT_CACHE_ARGS = ["--cache", "--cache-location", ".cache/eslint/.eslintcache"];
const ESLINT_BATCH_SIZE = 200;
const repoRoot = path.resolve(__dirname, "../..");

const { files: changedFiles, source } = changedFileSets({ cwd: repoRoot });
const files = changedFiles.filter((file) => ESLINT_EXTENSIONS.test(file));

if (files.length === 0) {
  process.stdout.write(`No changed JS/TS files to lint (${source}).\n`);
  process.exit(0);
}

for (let offset = 0; offset < files.length; offset += ESLINT_BATCH_SIZE) {
  const batch = files.slice(offset, offset + ESLINT_BATCH_SIZE);
  const result = spawnSync(
    "npx",
    ["eslint", ...ESLINT_CACHE_ARGS, "--no-warn-ignored", "--max-warnings=0", ...batch],
    { cwd: repoRoot, stdio: "inherit" },
  );
  if (result.error) {
    console.error(`Failed to start ESLint: ${result.error.message}`);
    process.exit(1);
  }
  if (result.signal || result.status === null) {
    console.error(`ESLint batch was interrupted${result.signal ? ` by ${result.signal}` : ""}.`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status);
}
