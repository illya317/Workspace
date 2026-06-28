#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "../..");
const DOMAIN_RELEVANT_PATTERNS = [
  /^app\/api\/.+\.(ts|tsx)$/i,
  /^packages\/[^/]+\/server\/.+\.(ts|tsx)$/i,
  /^scripts\/arch\/domain-validation.*\.(ts|tsx)$/i,
  /^scripts\/arch\/domain-gate\.ts$/i,
  /^scripts\/arch\/domain-validation-baseline\.json$/i,
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

function isDomainRelevant(file) {
  return DOMAIN_RELEVANT_PATTERNS.some((pattern) => pattern.test(file));
}

function changedFileSets() {
  const staged = runGit(["diff", "--name-only", "--diff-filter=ACMR", "--cached"]);
  const unstaged = runGit(["diff", "--name-only", "--diff-filter=ACMR", "HEAD", "--"]);
  const untracked = runGit(["ls-files", "--others", "--exclude-standard"]);
  return {
    staged: unique(staged),
    unstaged: unique(unstaged),
    untracked: unique(untracked),
  };
}

function runDomainValidation(cwd, scriptPath) {
  return spawnSync("npx", ["tsx", scriptPath], {
    cwd,
    stdio: "inherit",
    env: process.env,
  }).status ?? 1;
}

function createIndexSnapshot() {
  const baseDir = path.join(repoRoot, ".cache", "domain-validation-staged");
  fs.mkdirSync(baseDir, { recursive: true });
  const snapshotDir = fs.mkdtempSync(path.join(baseDir, "snapshot-"));
  const checkout = spawnSync("git", ["checkout-index", "-a", `--prefix=${snapshotDir}${path.sep}`], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (checkout.status !== 0) {
    fs.rmSync(snapshotDir, { recursive: true, force: true });
    process.exit(checkout.status ?? 1);
  }
  return snapshotDir;
}

const { staged, unstaged, untracked } = changedFileSets();
const hasStagedChanges = staged.length > 0;
const candidateFiles = hasStagedChanges ? staged : unique([...unstaged, ...untracked]);
const relevantFiles = candidateFiles.filter(isDomainRelevant);

if (relevantFiles.length === 0) {
  process.stdout.write("No changed domain-validation inputs; skipping.\n");
  process.exit(0);
}

process.stdout.write(`Domain validation inputs changed:\n${relevantFiles.map((file) => `  - ${file}`).join("\n")}\n`);

if (hasStagedChanges) {
  const snapshotDir = createIndexSnapshot();
  try {
    const status = runDomainValidation(snapshotDir, path.join(snapshotDir, "scripts/arch/domain-validation.ts"));
    process.exit(status);
  } finally {
    fs.rmSync(snapshotDir, { recursive: true, force: true });
  }
}

process.exit(runDomainValidation(repoRoot, path.join(repoRoot, "scripts/arch/domain-validation.ts")));
