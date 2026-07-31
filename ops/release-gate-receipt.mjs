#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import {
  atomicWriteReceipt,
  createCandidateReceipt,
  createValidationReceipt,
  readReceipt,
  validateCandidateReceipt,
  validateValidationReceipt,
} from "./release/contracts/release-receipt.mjs";

export {
  createCandidateReceipt as createReleaseCandidateReceipt,
  createValidationReceipt as createCnbReleaseGateReceipt,
  validateCandidateReceipt as validateReleaseCandidateReceipt,
  validateValidationReceipt as validateCnbReleaseGateReceipt,
};

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

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (!options.content || !options.tree) throw new Error("--content and --tree are required");
  const identity = { contentDigest: options.content, treeId: options.tree };
  if (options.mode === "candidate-create") {
    if (!options.output) throw new Error("candidate-create requires --output");
    const receipt = createCandidateReceipt(identity);
    atomicWriteReceipt(options.output, receipt);
    return receipt;
  }
  if (options.mode === "candidate-verify") {
    if (!options.file) throw new Error("candidate-verify requires --file");
    return validateCandidateReceipt(readReceipt(options.file), identity);
  }
  if (options.mode === "cnb-create") {
    if (!options.output) throw new Error("cnb-create requires --output");
    const receipt = createValidationReceipt({ ...identity, runner: options.runner ?? "cnb" });
    atomicWriteReceipt(options.output, receipt);
    return receipt;
  }
  if (options.mode === "cnb-verify") {
    if (!options.file) throw new Error("cnb-verify requires --file");
    return validateValidationReceipt(readReceipt(options.file), identity);
  }
  throw new Error("usage: release-gate-receipt.mjs candidate-create|candidate-verify|cnb-create|cnb-verify --content DIGEST --tree TREE --output|--file PATH [--runner cnb|local]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
