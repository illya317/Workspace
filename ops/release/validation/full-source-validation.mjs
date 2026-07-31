#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const COMMAND = [
  "node",
  ["scripts/check/with-check-lock.js", "--", "node", "scripts/check/run-check-suite.mjs", "release-source"],
];

function atomicWrite(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}

function previousResult(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

export function runFullSourceValidation({
  cwd = process.cwd(),
  contentDigest,
  resultFile,
  env = process.env,
  execute = (command, args) => spawnSync(command, args, { cwd, env, stdio: "inherit" }),
  acknowledgeRepeat = false,
  now = () => Date.now(),
} = {}) {
  if (!/^[0-9a-f]{64}$/.test(contentDigest ?? "")) throw new Error("contentDigest must be SHA-256");
  if (!resultFile) throw new Error("resultFile is required");
  const previous = previousResult(resultFile);
  if (previous?.contentDigest === contentDigest && previous?.status === "passed") {
    process.stdout.write("==> 复用同一候选内容的一次性全量源码 CI 回执\n");
    return { ...previous, reused: true };
  }
  if (previous?.contentDigest === contentDigest && !acknowledgeRepeat) {
    throw new Error("same candidate already consumed its full-CI attempt; inspect the failure before explicitly acknowledging a repeat");
  }
  const startedAtMs = now();
  const result = execute(COMMAND[0], COMMAND[1]);
  const completedAtMs = now();
  const statusCode = result.error || result.signal || result.status === null ? 1 : result.status;
  const receipt = {
    schemaVersion: 1,
    kind: "workspace-full-source-validation-result",
    contentDigest,
    command: [COMMAND[0], ...COMMAND[1]].join(" "),
    status: statusCode === 0 ? "passed" : "failed",
    exitCode: statusCode,
    startedAt: new Date(startedAtMs).toISOString(),
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: Math.max(0, completedAtMs - startedAtMs),
  };
  atomicWrite(resultFile, receipt);
  return { ...receipt, reused: false };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--acknowledge-repeat") options.acknowledgeRepeat = true;
    else if (key === "--content") options.contentDigest = argv[++index];
    else if (key === "--result-file") options.resultFile = argv[++index];
    else throw new Error(`unknown argument: ${key}`);
  }
  return options;
}

export function main(argv = process.argv.slice(2)) {
  const result = runFullSourceValidation(parseArgs(argv));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
