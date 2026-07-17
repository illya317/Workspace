#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const CNB_TRANSPORT = "cnb";
const RETIRED_TRANSPORT_OPTIONS = ["transport", "scope_policy", "risk_class", "build_image"];

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is required`);
  return value;
}

function requireSha(value, label) {
  if (!SHA_PATTERN.test(value ?? "")) throw new Error(`${label} must be a full lowercase Git SHA`);
  return value;
}

function optionalSha(value, label) {
  if (value === undefined || value === null || value === "") return null;
  return requireSha(value, label);
}

function requireDigest(value, label) {
  if (!DIGEST_PATTERN.test(value ?? "")) throw new Error(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function optionalDigest(value, label) {
  if (value === undefined || value === null || value === "") return null;
  return requireDigest(value, label);
}

export function normalizeDeployedRelease(record, { expectedRepository } = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("deployed-release must be an object");
  }

  const schemaVersion = record.schemaVersion;
  const runtimeSource = {
    commitSha: requireSha(record.source?.commitSha, "runtime source SHA"),
    treeSha: optionalSha(record.source?.treeSha, "runtime tree SHA"),
  };
  const artifact = {
    sha256: requireDigest(record.artifact?.sha256, "artifact digest"),
    manifestSha256: optionalDigest(record.artifact?.manifestSha256, "manifest digest"),
  };
  const repository = requireString(record.cnb?.repository, "CNB repository");
  if (expectedRepository && repository !== expectedRepository) {
    throw new Error(`CNB repository ${repository} does not match ${expectedRepository}`);
  }

  let injectionSha;
  let canonicalSource;
  let migrationSetSha256 = null;
  if (schemaVersion === 1 && !("releaseCommitSha" in (record.cnb ?? {}))) {
    injectionSha = requireSha(record.cnb?.injectionSha, "CNB injection SHA");
    canonicalSource = runtimeSource;
  } else if (schemaVersion === 2 && !("injectionSha" in (record.cnb ?? {}))) {
    injectionSha = requireSha(record.cnb?.releaseCommitSha, "legacy CNB release SHA");
    canonicalSource = runtimeSource;
  } else if (schemaVersion === 3) {
    injectionSha = requireSha(record.cnb?.injectionSha, "CNB injection SHA");
    const transport = requireString(record.transport?.kind, "release transport");
    if (transport !== CNB_TRANSPORT) throw new Error(`unsupported release transport: ${transport}`);
    canonicalSource = {
      commitSha: requireSha(record.canonicalSource?.commitSha, "canonical source SHA"),
      treeSha: requireSha(record.canonicalSource?.treeSha, "canonical tree SHA"),
    };
    runtimeSource.treeSha = requireSha(runtimeSource.treeSha, "runtime tree SHA");
    migrationSetSha256 = requireDigest(record.migration?.setSha256, "migration-set digest");
    if (runtimeSource.commitSha !== canonicalSource.commitSha
      || runtimeSource.treeSha !== canonicalSource.treeSha) {
      throw new Error("canonical CNB receipt must bind runtime and canonical source equally");
    }
  } else {
    throw new Error("unsupported deployed-release schema");
  }

  return {
    schemaVersion,
    runtimeSource,
    canonicalSource,
    artifact,
    migrationSetSha256,
    transport: CNB_TRANSPORT,
    cnb: {
      repository,
      sourceBranch: record.cnb?.sourceBranch ?? "",
      injectionSha,
    },
    deployment: {
      releaseId: record.deployment?.releaseId ?? "",
      releaseDir: record.deployment?.releaseDir ?? "",
      deployedAt: record.deployment?.deployedAt ?? "",
    },
  };
}

export function readDeployedRelease(file, options) {
  return normalizeDeployedRelease(JSON.parse(readFileSync(file, "utf8")), options);
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--")) throw new Error(`unknown argument: ${key ?? "<empty>"}`);
    const value = argv[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${key}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

function requireOption(options, key) {
  return requireString(options[key], `--${key.replaceAll("_", "-")}`);
}

function rejectRetiredTransportOptions(options) {
  const retired = RETIRED_TRANSPORT_OPTIONS.find((key) => options[key] !== undefined);
  if (retired) throw new Error(`--${retired.replaceAll("_", "-")} is no longer supported`);
}

function inspectReceipt(options) {
  const receipt = readDeployedRelease(requireOption(options, "file"), {
    expectedRepository: options.expected_repository,
  });
  if ((options.format ?? "json") === "json") {
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    return;
  }
  if (options.format !== "tsv") throw new Error(`unsupported inspect format: ${options.format}`);
  process.stdout.write([
    "RECORD",
    receipt.runtimeSource.commitSha,
    receipt.runtimeSource.treeSha ?? "",
    receipt.canonicalSource.commitSha,
    receipt.canonicalSource.treeSha ?? "",
    receipt.cnb.injectionSha,
    receipt.artifact.sha256,
    receipt.cnb.repository,
    receipt.cnb.sourceBranch,
    receipt.migrationSetSha256 ?? "",
  ].join("\t") + "\n");
}

function assertReceipt(options) {
  rejectRetiredTransportOptions(options);
  const receipt = readDeployedRelease(requireOption(options, "file"), {
    expectedRepository: options.expected_repository,
  });
  const comparisons = [
    ["runtime source", receipt.runtimeSource.commitSha, options.runtime_source],
    ["runtime tree", receipt.runtimeSource.treeSha, options.runtime_tree],
    ["canonical source", receipt.canonicalSource.commitSha, options.canonical_source],
    ["canonical tree", receipt.canonicalSource.treeSha, options.canonical_tree],
    ["artifact digest", receipt.artifact.sha256, options.artifact_sha],
    ["manifest digest", receipt.artifact.manifestSha256, options.manifest_sha],
    ["CNB injection", receipt.cnb.injectionSha, options.cnb_injection],
    ["release directory", receipt.deployment.releaseDir, options.release_dir],
  ];
  for (const [label, actual, expected] of comparisons) {
    if (expected !== undefined && actual !== expected) {
      throw new Error(`${label} changed: expected ${expected}, received ${actual ?? "<missing>"}`);
    }
  }
  process.stdout.write("MATCH\n");
}

function writeReceipt(options) {
  rejectRetiredTransportOptions(options);
  const file = resolve(requireOption(options, "file"));
  const runtimeSource = {
    commitSha: requireSha(requireOption(options, "runtime_source"), "runtime source SHA"),
    treeSha: requireSha(requireOption(options, "runtime_tree"), "runtime tree SHA"),
  };
  const canonicalSource = {
    commitSha: requireSha(requireOption(options, "canonical_source"), "canonical source SHA"),
    treeSha: requireSha(requireOption(options, "canonical_tree"), "canonical tree SHA"),
  };
  if (runtimeSource.commitSha !== canonicalSource.commitSha
    || runtimeSource.treeSha !== canonicalSource.treeSha) {
    throw new Error("canonical CNB receipt must bind runtime and canonical source equally");
  }
  const record = {
    schemaVersion: 3,
    source: runtimeSource,
    canonicalSource,
    artifact: {
      sha256: requireDigest(requireOption(options, "artifact_sha"), "artifact digest"),
      manifestSha256: requireDigest(requireOption(options, "manifest_sha"), "manifest digest"),
    },
    migration: {
      setSha256: requireDigest(requireOption(options, "migration_set"), "migration-set digest"),
    },
    transport: { kind: CNB_TRANSPORT },
    cnb: {
      repository: requireOption(options, "cnb_repository"),
      sourceBranch: requireOption(options, "cnb_branch"),
      injectionSha: requireSha(requireOption(options, "cnb_injection"), "CNB injection SHA"),
    },
    deployment: {
      releaseId: requireOption(options, "release_id"),
      releaseDir: requireOption(options, "release_dir"),
      deployedAt: new Date().toISOString(),
    },
  };
  normalizeDeployedRelease(record, { expectedRepository: record.cnb.repository });
  const temporary = resolve(dirname(file), `.${file.split("/").at(-1)}.tmp-${process.pid}-${randomUUID()}`);
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}

export async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const options = parseArguments(rest);
  if (command === "inspect") return inspectReceipt(options);
  if (command === "assert") return assertReceipt(options);
  if (command === "write") return writeReceipt(options);
  throw new Error(`unknown command: ${command ?? "<missing>"}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
