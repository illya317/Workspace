#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const { changedFileSets } = require("./changed-files");

const ESLINT_EXTENSIONS = /\.(cjs|cts|js|jsx|mjs|mts|ts|tsx)$/i;
const ESLINT_CACHE_ARGS = ["--cache", "--cache-location", ".cache/eslint/.eslintcache"];
const repoRoot = path.resolve(__dirname, "../..");

const { files: changedFiles, source } = changedFileSets({ cwd: repoRoot });
const files = changedFiles.filter((file) => ESLINT_EXTENSIONS.test(file));

if (files.length === 0) {
  process.stdout.write(`No changed JS/TS files to lint (${source}).\n`);
  process.exit(0);
}

const result = spawnSync(
  "npx",
  ["eslint", ...ESLINT_CACHE_ARGS, "--max-warnings=0", ...files],
  { cwd: repoRoot, stdio: "inherit" },
);

process.exit(result.status ?? 1);
