#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import {
  atomicWriteReceipt,
  createArtifactReceipt,
  createCandidateReceipt,
  createSourceValidationReceipt,
  readReceipt,
  validateArtifactReceipt,
  validateCandidateReceipt,
  validateSourceValidationReceipt,
} from "./release/contracts/release-receipt.mjs";

export {
  createArtifactReceipt as createReleaseArtifactReceipt,
  createCandidateReceipt as createReleaseCandidateReceipt,
  createSourceValidationReceipt as createReleaseSourceValidationReceipt,
  validateArtifactReceipt as validateReleaseArtifactReceipt,
  validateCandidateReceipt as validateReleaseCandidateReceipt,
  validateSourceValidationReceipt as validateReleaseSourceValidationReceipt,
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
  if (options.mode === "source-create") {
    if (!options.output) throw new Error("source-create requires --output");
    const receipt = createSourceValidationReceipt({ ...identity, runner: options.runner ?? "cnb" });
    atomicWriteReceipt(options.output, receipt);
    return receipt;
  }
  if (options.mode === "source-verify") {
    if (!options.file) throw new Error("source-verify requires --file");
    return validateSourceValidationReceipt(readReceipt(options.file), identity);
  }
  if (options.mode === "artifact-create") {
    if (!options.output) throw new Error("artifact-create requires --output");
    const receipt = createArtifactReceipt({
      ...identity,
      targetId: options.target ?? "monolith",
      runner: options.runner ?? "cnb",
    });
    atomicWriteReceipt(options.output, receipt);
    return receipt;
  }
  if (options.mode === "artifact-verify") {
    if (!options.file) throw new Error("artifact-verify requires --file");
    return validateArtifactReceipt(readReceipt(options.file), { ...identity, targetId: options.target ?? "monolith" });
  }
  throw new Error("usage: release-gate-receipt.mjs candidate-create|candidate-verify|source-create|source-verify|artifact-create|artifact-verify --content DIGEST --tree TREE --output|--file PATH [--runner cnb|local] [--target ID]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
