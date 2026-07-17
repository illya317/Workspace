#!/usr/bin/env node

import { chmodSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const RECEIPT_KIND = "workspace-local-full-ci";
const RECEIPT_COMMAND = "npm run check:ci";

function requireTreeSha(value) {
  if (!SHA_PATTERN.test(value ?? "")) throw new Error("tree SHA must be a full lowercase Git SHA");
  return value;
}

function requireIsoTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("completedAt must be an ISO timestamp");
  }
  return value;
}

export function createLocalFullCiReceipt({
  treeSha,
  completedAt = new Date().toISOString(),
  nodeVersion = process.version,
  platform = process.platform,
  architecture = process.arch,
} = {}) {
  return {
    schemaVersion: 1,
    kind: RECEIPT_KIND,
    status: "passed",
    command: RECEIPT_COMMAND,
    treeSha: requireTreeSha(treeSha),
    completedAt: requireIsoTimestamp(completedAt),
    runtime: {
      nodeVersion,
      platform,
      architecture,
    },
  };
}

export function validateLocalFullCiReceipt(receipt, {
  treeSha,
  nodeVersion = process.version,
  platform = process.platform,
  architecture = process.arch,
} = {}) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    throw new Error("local full CI receipt must be an object");
  }
  if (receipt.schemaVersion !== 1
    || receipt.kind !== RECEIPT_KIND
    || receipt.status !== "passed"
    || receipt.command !== RECEIPT_COMMAND) {
    throw new Error("local full CI receipt contract is invalid");
  }
  requireTreeSha(receipt.treeSha);
  if (receipt.treeSha !== requireTreeSha(treeSha)) {
    throw new Error("local full CI receipt is for a different Git tree");
  }
  requireIsoTimestamp(receipt.completedAt);
  if (receipt.runtime?.nodeVersion !== nodeVersion
    || receipt.runtime?.platform !== platform
    || receipt.runtime?.architecture !== architecture) {
    throw new Error("local full CI receipt runtime does not match the current runtime");
  }
  return receipt;
}

function parseArguments(argv) {
  const [mode, ...rest] = argv;
  const options = { mode };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!key?.startsWith("--")) throw new Error(`unknown argument: ${key ?? "<empty>"}`);
    const value = rest[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${key}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

function writeReceipt(file, receipt) {
  const target = resolve(file);
  const temporary = resolve(dirname(target), `.${basename(target)}.tmp-${process.pid}`);
  writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, target);
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.mode === "create") {
    if (!options.output) throw new Error("create requires --output");
    writeReceipt(options.output, createLocalFullCiReceipt({ treeSha: options.tree }));
    return;
  }
  if (options.mode === "verify") {
    if (!options.file) throw new Error("verify requires --file");
    const receipt = JSON.parse(readFileSync(options.file, "utf8"));
    validateLocalFullCiReceipt(receipt, { treeSha: options.tree });
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    return;
  }
  throw new Error("usage: local-full-ci-receipt.mjs create|verify --tree SHA --output|--file PATH");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
