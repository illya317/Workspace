#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { runCheckSuites } from "../check/run-check-suite.mjs";
import {
  createLocalFullCiReceipt,
  writeLocalFullCiReceipt,
} from "./local-full-ci-receipt.mjs";

const RECEIPT_NAME = "workspace-local-full-ci.json";
const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");

export function requiredRepositoryNodeMajor(repositoryRoot = REPOSITORY_ROOT) {
  const value = readFileSync(path.join(repositoryRoot, ".node-version"), "utf8").trim();
  if (!/^\d+$/.test(value)) throw new Error(".node-version must contain one Node major version");
  return value;
}

export function requiresRepositoryNodeBootstrap({
  repositoryRoot = REPOSITORY_ROOT,
  nodeVersion = process.versions.node,
} = {}) {
  return nodeVersion.split(".")[0] !== requiredRepositoryNodeMajor(repositoryRoot);
}

function runWithRepositoryNode() {
  const wrapper = path.join(REPOSITORY_ROOT, "scripts/runtime/run-with-repo-node.sh");
  const result = spawnSync(wrapper, ["node", path.resolve(process.argv[1])], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function runGit(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 200 * 1024 * 1024,
  }).trim();
}

function resolveGitPath(cwd, repositoryPath) {
  return path.isAbsolute(repositoryPath) ? repositoryPath : path.resolve(cwd, repositoryPath);
}

function receiptEligibility(env) {
  if (env.CI) return { eligible: false, reason: "CI environment" };
  if (env.PRE_COMMIT_FULL === "1") return { eligible: false, reason: "PRE_COMMIT_FULL index check" };
  return { eligible: true, reason: null };
}

export function runLocalFullCi({
  cwd = process.cwd(),
  env = process.env,
  git = (args) => runGit(cwd, args),
  runSuites = (suiteNames, options) => runCheckSuites(suiteNames, options),
  writeReceipt = writeLocalFullCiReceipt,
  stdout = process.stdout,
} = {}) {
  const eligibility = receiptEligibility(env);
  let cleanTreeBefore = null;
  let receiptFile = null;

  if (eligibility.eligible) {
    const statusBefore = git(["status", "--porcelain=v1", "--untracked-files=all"]);
    if (statusBefore === "") {
      cleanTreeBefore = git(["rev-parse", "HEAD^{tree}"]);
      receiptFile = resolveGitPath(cwd, git(["rev-parse", "--git-path", RECEIPT_NAME]));
    } else {
      stdout.write("Full CI receipt skipped: working tree was not clean before checks.\n");
    }
  } else {
    stdout.write(`Full CI receipt skipped: ${eligibility.reason}.\n`);
  }

  const status = runSuites(["ci"], { cwd, env, stdout });
  if (status !== 0) return status;
  if (!cleanTreeBefore || !receiptFile) return 0;

  const statusAfter = git(["status", "--porcelain=v1", "--untracked-files=all"]);
  if (statusAfter !== "") {
    stdout.write("Full CI passed, but no receipt was written because checks changed the working tree.\n");
    return 0;
  }

  const cleanTreeAfter = git(["rev-parse", "HEAD^{tree}"]);
  if (cleanTreeAfter !== cleanTreeBefore) {
    stdout.write("Full CI passed, but no receipt was written because HEAD tree changed during checks.\n");
    return 0;
  }

  writeReceipt(receiptFile, createLocalFullCiReceipt({ treeSha: cleanTreeAfter }));
  stdout.write(`Full CI receipt recorded for tree ${cleanTreeAfter.slice(0, 12)}.\n`);
  return 0;
}

export function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.length > 0) throw new Error("run-local-full-ci does not accept arguments");
  if (env.CHECK_LOCK !== "0") {
    throw new Error("run-local-full-ci must run through scripts/check/with-check-lock.js");
  }
  return runLocalFullCi({ env });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = requiresRepositoryNodeBootstrap() ? runWithRepositoryNode() : main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
