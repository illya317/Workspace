#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const REF_PATTERN = /^(?:HEAD|[0-9a-f]{7,64})$/i;

function unique(values) {
  return Array.from(new Set(values));
}

function parseNullSeparated(output) {
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function runGitNull(cwd, args, { failClosed = false } = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "buffer" });
  if (result.status !== 0) {
    if (!failClosed) return [];
    const stderr = result.stderr?.toString("utf8").trim();
    throw new Error(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }
  return parseNullSeparated(result.stdout ?? Buffer.alloc(0));
}

function assertCommitRef(cwd, name, value) {
  if (!REF_PATTERN.test(value)) {
    throw new Error(`${name} must be HEAD or a 7-64 character hexadecimal commit id`);
  }
  const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", `${value}^{commit}`], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`${name} does not resolve to a commit: ${value}`);
}

function explicitDiff(cwd, diffFilter, env) {
  const base = env.WORKSPACE_DIFF_BASE?.trim();
  const head = env.WORKSPACE_DIFF_HEAD?.trim();
  if (!base && !head) return undefined;
  if (!base || !head) {
    throw new Error("WORKSPACE_DIFF_BASE and WORKSPACE_DIFF_HEAD must be set together");
  }
  assertCommitRef(cwd, "WORKSPACE_DIFF_BASE", base);
  assertCommitRef(cwd, "WORKSPACE_DIFF_HEAD", head);
  return runGitNull(
    cwd,
    ["diff", "--name-only", "-z", `--diff-filter=${diffFilter}`, `${base}...${head}`, "--"],
    { failClosed: true },
  );
}

function changedFileSets({ cwd, diffFilter = "ACMR", env = process.env }) {
  const explicit = explicitDiff(cwd, diffFilter, env);
  if (explicit) {
    return {
      staged: [],
      unstaged: [],
      untracked: [],
      files: unique(explicit),
      hasStagedChanges: false,
      source: "explicit-diff",
    };
  }

  const staged = runGitNull(cwd, ["diff", "--name-only", "-z", `--diff-filter=${diffFilter}`, "--cached"]);
  const hasStagedChanges = staged.length > 0;
  const unstaged = runGitNull(cwd, ["diff", "--name-only", "-z", `--diff-filter=${diffFilter}`, "HEAD", "--"]);
  const untracked = runGitNull(cwd, ["ls-files", "-z", "--others", "--exclude-standard"]);
  return {
    staged: unique(staged),
    unstaged: unique(unstaged),
    untracked: unique(untracked),
    files: hasStagedChanges ? unique(staged) : unique([...unstaged, ...untracked]),
    hasStagedChanges,
    source: hasStagedChanges ? "staged" : "worktree",
  };
}

module.exports = {
  changedFileSets,
  parseNullSeparated,
};
