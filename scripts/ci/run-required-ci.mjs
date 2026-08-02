#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { runCheckSuites } from "../check/run-check-suite.mjs";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");

function requiredNodeMajor() {
  const value = readFileSync(path.join(REPOSITORY_ROOT, ".node-version"), "utf8").trim();
  if (!/^\d+$/.test(value)) throw new Error(".node-version must contain one Node major version");
  return value;
}

function runWithRepositoryNode() {
  const result = spawnSync(
    path.join(REPOSITORY_ROOT, "scripts/runtime/run-with-repo-node.sh"),
    ["node", path.resolve(process.argv[1])],
    { cwd: process.cwd(), env: process.env, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

export function main(env = process.env) {
  if (env.CHECK_LOCK !== "0") throw new Error("required CI must run through with-check-lock.js");
  return runCheckSuites(["ci"], {
    cwd: process.cwd(),
    env,
    stdout: process.stdout,
    collectFailures: true,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = process.versions.node.split(".")[0] === requiredNodeMajor()
      ? main()
      : runWithRepositoryNode();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
