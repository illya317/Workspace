#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const { changedFileSets } = require("./changed-files");
const { runOpsShellcheck, selectOpsShellFiles } = require("./run-ops-shellcheck");

const ESLINT_EXTENSIONS = /\.(cjs|cts|js|jsx|mjs|mts|ts|tsx)$/i;
const ESLINT_CACHE_ARGS = ["--cache", "--cache-location", ".cache/eslint/.eslintcache"];
const repoRoot = path.resolve(__dirname, "../..");

function selectLintFiles(files) {
  const unique = [...new Set(files)].sort();
  return {
    eslintFiles: unique.filter((file) => ESLINT_EXTENSIONS.test(file)),
    opsShellFiles: selectOpsShellFiles(unique),
  };
}

function main({
  cwd = repoRoot,
  changed = changedFileSets({ cwd }),
  spawn = spawnSync,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const { eslintFiles, opsShellFiles } = selectLintFiles(changed.files);
  if (eslintFiles.length === 0 && opsShellFiles.length === 0) {
    stdout.write(`No changed lint inputs (${changed.source}).\n`);
    return 0;
  }

  if (eslintFiles.length > 0) {
    const eslint = spawn(
      "npx",
      ["eslint", ...ESLINT_CACHE_ARGS, "--max-warnings=0", ...eslintFiles],
      { cwd, stdio: "inherit" },
    );
    if (eslint.error) stderr.write(`${eslint.error.message}\n`);
    if ((eslint.status ?? 1) !== 0) return eslint.status ?? 1;
  }

  return runOpsShellcheck(opsShellFiles, { cwd, spawn, stdout, stderr });
}

module.exports = { main, selectLintFiles };

if (require.main === module) process.exitCode = main();
