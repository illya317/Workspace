#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const ESLINT_EXTENSIONS = /\.(cjs|cts|js|jsx|mjs|mts|ts|tsx)$/i;
const ESLINT_CACHE_ARGS = ["--cache", "--cache-location", ".cache/eslint/.eslintcache"];

function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    return [];
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function unique(values) {
  return Array.from(new Set(values));
}

function changedFiles() {
  const staged = runGit(["diff", "--name-only", "--diff-filter=ACMR", "--cached"]);
  if (staged.length > 0) return staged;

  const tracked = runGit(["diff", "--name-only", "--diff-filter=ACMR", "HEAD", "--"]);
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"]);
  return unique([...tracked, ...untracked]);
}

const files = changedFiles().filter((file) => ESLINT_EXTENSIONS.test(file));

const responseFormat = spawnSync(
  "node",
  ["scripts/check/check-api-response-format.js"],
  { stdio: "inherit" },
);

if (responseFormat.status !== 0) {
  process.exit(responseFormat.status ?? 1);
}

const historyPolicy = spawnSync(
  "npx",
  ["tsx", "scripts/check/check-history-policy-registry.ts"],
  { stdio: "inherit" },
);

if (historyPolicy.status !== 0) {
  process.exit(historyPolicy.status ?? 1);
}

if (files.length === 0) {
  process.stdout.write("No changed JS/TS files to lint.\n");
  process.exit(0);
}

const result = spawnSync(
  "npx",
  ["eslint", ...ESLINT_CACHE_ARGS, "--max-warnings=0", ...files],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
