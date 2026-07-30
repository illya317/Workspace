#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    env: options.env ?? process.env,
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio ?? "pipe",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    throw new Error(`${command} ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }
  return typeof result.stdout === "string" ? result.stdout.trim() : "";
}

function stagedPaths(cwd = repositoryRoot) {
  return run("git", ["diff", "--cached", "--name-only", "--diff-filter=ACDMR", "--"], { cwd })
    .split(/\r?\n/)
    .filter(Boolean);
}

function linkRuntimeInputs(snapshotRoot, sourceRoot = repositoryRoot) {
  const nodeModules = path.join(sourceRoot, "node_modules");
  if (!fs.existsSync(nodeModules)) throw new Error("node_modules is required for staged pre-commit checks");
  fs.symlinkSync(nodeModules, path.join(snapshotRoot, "node_modules"), "dir");
  fs.mkdirSync(path.join(snapshotRoot, ".cache"), { recursive: true });
}

function environmentWithoutRepositoryBindings(cwd) {
  const environment = { ...process.env };
  const localVariables = run("git", ["rev-parse", "--local-env-vars"], { cwd }).split(/\r?\n/).filter(Boolean);
  for (const variable of localVariables) delete environment[variable];
  return environment;
}

export function runStagedPrecommit({ cwd = repositoryRoot, spawn = spawnSync } = {}) {
  const files = stagedPaths(cwd);
  if (files.length === 0) {
    process.stdout.write("No staged files; pre-commit checks skipped.\n");
    return { files, skipped: true };
  }

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-staged-precommit-"));
  const snapshotRoot = path.join(temporaryRoot, "tree");
  let worktreeAdded = false;
  try {
    const treeSha = run("git", ["write-tree"], { cwd });
    const headSha = run("git", ["rev-parse", "HEAD^{commit}"], { cwd });
    const syntheticCommit = run("git", ["commit-tree", treeSha, "-p", headSha, "-m", "staged pre-commit snapshot"], { cwd });
    const snapshotEnvironment = environmentWithoutRepositoryBindings(cwd);
    const add = spawn("git", ["worktree", "add", "--detach", "--quiet", snapshotRoot, syntheticCommit], {
      cwd,
      env: snapshotEnvironment,
      stdio: "inherit",
    });
    if (add.error) throw add.error;
    if (add.status !== 0) throw new Error(`git worktree add failed with status ${add.status ?? "unknown"}`);
    worktreeAdded = true;
    linkRuntimeInputs(snapshotRoot, cwd);

    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = spawn(npmCommand, ["run", "check:precommit:snapshot"], {
      cwd: snapshotRoot,
      env: {
        ...snapshotEnvironment,
        CHECK_WORKSPACE_SNAPSHOT_SCOPE: "committed",
        WORKSPACE_DIFF_BASE: headSha,
        WORKSPACE_DIFF_HEAD: syntheticCommit,
      },
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = result.status ?? 1;
    return { files, skipped: false, treeSha, syntheticCommit, status: result.status ?? 1 };
  } finally {
    if (worktreeAdded) {
      spawn("git", ["worktree", "remove", "--force", snapshotRoot], {
        cwd,
        env: environmentWithoutRepositoryBindings(cwd),
        stdio: "ignore",
      });
    }
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runStagedPrecommit({
      cwd: process.env.STAGED_PRECOMMIT_REPOSITORY_ROOT
        ? path.resolve(process.env.STAGED_PRECOMMIT_REPOSITORY_ROOT)
        : repositoryRoot,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
