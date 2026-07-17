#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const OPS_SHELL_PATTERN = /^ops\/.+\.sh$/;

function selectOpsShellFiles(files) {
  return [...new Set(files.filter((file) => OPS_SHELL_PATTERN.test(file)))].sort();
}

function discoverTrackedOpsShellFiles({ cwd = repoRoot, spawn = spawnSync } = {}) {
  const result = spawn(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ":(glob)ops/**/*.sh"],
    { cwd, encoding: "buffer" },
  );
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error("git ls-files failed while discovering ops shell scripts");
  }
  return selectOpsShellFiles(
    (result.stdout ?? Buffer.alloc(0)).toString("utf8").split("\0").filter(Boolean),
  );
}

function runOpsShellcheck(files, {
  cwd = repoRoot,
  spawn = spawnSync,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const selected = selectOpsShellFiles(files);
  if (selected.length === 0) {
    stdout.write("No ops shell files to lint.\n");
    return 0;
  }
  const result = spawn(
    "shellcheck",
    ["-x", "-S", "warning", ...selected],
    { cwd, stdio: "inherit" },
  );
  if (result.error) {
    stderr.write(`ShellCheck is required for ops lint: ${result.error.message}\n`);
  }
  return result.status ?? 1;
}

function main() {
  let files;
  try {
    files = discoverTrackedOpsShellFiles();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  return runOpsShellcheck(files);
}

module.exports = {
  discoverTrackedOpsShellFiles,
  main,
  runOpsShellcheck,
  selectOpsShellFiles,
};

if (require.main === module) process.exitCode = main();
