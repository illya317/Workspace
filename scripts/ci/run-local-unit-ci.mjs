#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { runCheckSuites } from "../check/run-check-suite.mjs";
import {
  createLocalUnitCiReceipt,
  writeLocalUnitCiReceipt,
} from "./local-unit-ci-receipt.mjs";

const UNIT_PATTERN = /^[a-z][a-z0-9-]*$/;

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error("invalid local unit CI argument");
    options[key.slice(2)] = value;
  }
  if (!UNIT_PATTERN.test(options.unit ?? "") || !options.output) {
    throw new Error("usage: run-local-unit-ci.mjs --unit <id> --output <receipt-file>");
  }
  return options;
}

export function runLocalUnitCi({
  unitId,
  output,
  cwd = process.cwd(),
  env = process.env,
  runSuites = (suiteNames, options) => runCheckSuites(suiteNames, options),
  gitCommand = (args) => git(cwd, args),
  writeReceipt = writeLocalUnitCiReceipt,
  stdout = process.stdout,
} = {}) {
  if (!UNIT_PATTERN.test(unitId ?? "")) throw new Error("deploy unit id is invalid");
  if (!output) throw new Error("local unit CI output is required");
  if (gitCommand(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    throw new Error("local unit CI requires a clean committed working tree");
  }
  const sourceSha = gitCommand(["rev-parse", "HEAD^{commit}"]);
  const treeSha = gitCommand(["rev-parse", "HEAD^{tree}"]);
  const status = runSuites(["release-unit"], {
    cwd,
    env,
    stdout,
    collectFailures: true,
  });
  if (status !== 0) return status;
  if (gitCommand(["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    throw new Error("local unit CI changed the working tree; refusing its receipt");
  }
  if (gitCommand(["rev-parse", "HEAD^{commit}"]) !== sourceSha
    || gitCommand(["rev-parse", "HEAD^{tree}"]) !== treeSha) {
    throw new Error("local unit CI source tree changed while checks were running");
  }
  writeReceipt(path.resolve(cwd, output), createLocalUnitCiReceipt({ unitId, sourceSha, treeSha }));
  stdout.write(`Unit CI receipt recorded for ${unitId} at tree ${treeSha.slice(0, 12)}.\n`);
  return 0;
}

export function main(argv = process.argv.slice(2), env = process.env) {
  if (env.CHECK_LOCK !== "0") {
    throw new Error("run-local-unit-ci must run through scripts/check/with-check-lock.js");
  }
  const options = parseArguments(argv);
  return runLocalUnitCi({ unitId: options.unit, output: options.output, env });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
