#!/usr/bin/env node

import { chmodSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validateLocalFullCiReceipt } from "../scripts/ci/local-full-ci-receipt.mjs";
import { validateLocalUnitCiReceipt } from "../scripts/ci/local-unit-ci-receipt.mjs";
import { canonicalJson, sha256 } from "./deploy-unit-release.mjs";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const UNIT_PATTERN = /^[a-z][a-z0-9-]*$/;
const RECEIPT_KIND = "workspace-local-release-gate";
const RECEIPT_COMMAND = "ops/local-release-gate.sh";
const FULL_CHECKS = [
  "full-ci",
  "disposable-postgresql-migrations",
  "resource-seed",
  "playwright-e2e",
];
const UNIT_CHECKS = [
  "release-unit-base",
  "deploy-unit-typecheck",
  "deploy-unit-production-build",
  "disposable-postgresql-migrations",
  "resource-seed",
  "deploy-unit-runtime-smoke",
  "deploy-unit-e2e",
];

function requireSha(value, label) {
  if (!SHA_PATTERN.test(value ?? "")) throw new Error(`${label} must be a full lowercase Git SHA`);
  return value;
}

function requireIsoTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("completedAt must be an ISO timestamp");
  }
  return value;
}

function requireDigest(value, label) {
  if (!DIGEST_PATTERN.test(value ?? "")) throw new Error(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function requireUnitId(value) {
  if (!UNIT_PATTERN.test(value ?? "")) throw new Error("deploy unit id is invalid");
  return value;
}

function requireStringArray(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value)
    || (!allowEmpty && value.length === 0)
    || value.some((item) => typeof item !== "string" || !item)) {
    throw new Error(`${label} must be a string array`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicates`);
  return [...value];
}

function createUnitProof({ unitId, unitContract, unitManifest, sourceSha, treeSha }) {
  const exactUnitId = requireUnitId(unitId);
  if (unitContract?.schemaVersion !== 1
    || unitContract?.kind !== "workspace-deploy-unit-contract"
    || unitContract?.id !== exactUnitId) {
    throw new Error("deploy unit contract is invalid");
  }
  if (unitManifest?.schemaVersion !== 1
    || unitManifest?.kind !== "workspace-deploy-unit-artifact"
    || unitManifest?.unit?.id !== exactUnitId) {
    throw new Error("deploy unit artifact manifest is invalid");
  }
  if (unitManifest.source?.commitSha !== sourceSha || unitManifest.source?.treeSha !== treeSha) {
    throw new Error("deploy unit artifact manifest belongs to a different source tree");
  }
  const contractSha256 = sha256(canonicalJson(unitContract));
  if (unitManifest.unit?.contractSha256 !== contractSha256
    || unitManifest.unit?.graphSha256 !== unitContract.graphSha256) {
    throw new Error("deploy unit artifact manifest does not match its contract");
  }
  const e2eSuites = requireStringArray(unitContract.checks?.e2eSuites, "deploy unit E2E suites", { allowEmpty: true });
  const typecheckScopes = requireStringArray(unitContract.checks?.typecheckScopes, "deploy unit typecheck scopes");
  return {
    id: exactUnitId,
    contractSha256: requireDigest(contractSha256, "deploy unit contract digest"),
    graphSha256: requireDigest(unitContract.graphSha256, "deploy unit graph digest"),
    artifactSha256: requireDigest(unitManifest.artifact?.sha256, "deploy unit artifact digest"),
    typecheckScopes,
    e2eSuites,
  };
}

function validateUnitProof(value, unitId) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.id !== unitId) {
    throw new Error("local unit release proof is invalid");
  }
  requireDigest(value.contractSha256, "deploy unit contract digest");
  requireDigest(value.graphSha256, "deploy unit graph digest");
  requireDigest(value.artifactSha256, "deploy unit artifact digest");
  requireStringArray(value.typecheckScopes, "deploy unit typecheck scopes");
  requireStringArray(value.e2eSuites, "deploy unit E2E suites", { allowEmpty: true });
  return value;
}

export function createLocalReleaseGateReceipt({
  sourceSha,
  treeSha,
  fullCiReceipt,
  unitId,
  unitCiReceipt,
  unitContract,
  unitManifest,
  completedAt = new Date().toISOString(),
} = {}) {
  const exactSource = requireSha(sourceSha, "source SHA");
  const exactTree = requireSha(treeSha, "tree SHA");
  if (unitId) {
    const exactUnitId = requireUnitId(unitId);
    return {
      schemaVersion: 3,
      kind: RECEIPT_KIND,
      status: "passed",
      command: RECEIPT_COMMAND,
      scope: { kind: "unit", unitId: exactUnitId },
      sourceSha: exactSource,
      treeSha: exactTree,
      checks: UNIT_CHECKS,
      unitCi: validateLocalUnitCiReceipt(unitCiReceipt, {
        unitId: exactUnitId,
        sourceSha: exactSource,
        treeSha: exactTree,
      }),
      unit: createUnitProof({
        unitId: exactUnitId,
        unitContract,
        unitManifest,
        sourceSha: exactSource,
        treeSha: exactTree,
      }),
      completedAt: requireIsoTimestamp(completedAt),
    };
  }
  return {
    schemaVersion: 2,
    kind: RECEIPT_KIND,
    status: "passed",
    command: RECEIPT_COMMAND,
    sourceSha: exactSource,
    treeSha: exactTree,
    checks: FULL_CHECKS,
    fullCi: validateLocalFullCiReceipt(fullCiReceipt, { treeSha: exactTree }),
    completedAt: requireIsoTimestamp(completedAt),
  };
}

export function validateLocalReleaseGateReceipt(receipt, {
  sourceSha,
  treeSha,
  scope = "full",
  unitId,
} = {}) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    throw new Error("local release gate receipt must be an object");
  }
  const exactSource = requireSha(sourceSha, "source SHA");
  const exactTree = requireSha(treeSha, "tree SHA");
  if (receipt.kind !== RECEIPT_KIND
    || receipt.status !== "passed"
    || receipt.command !== RECEIPT_COMMAND) {
    throw new Error("local release gate receipt contract is invalid");
  }
  if (receipt.sourceSha !== exactSource || receipt.treeSha !== exactTree) {
    throw new Error("local release gate receipt belongs to a different source tree");
  }
  if (scope === "full") {
    if (receipt.schemaVersion !== 2
      || receipt.scope !== undefined
      || JSON.stringify(receipt.checks) !== JSON.stringify(FULL_CHECKS)) {
      throw new Error("local Full release gate receipt contract is invalid");
    }
    validateLocalFullCiReceipt(receipt.fullCi, { treeSha: exactTree });
  } else if (scope === "unit") {
    const exactUnitId = requireUnitId(unitId);
    if (receipt.schemaVersion !== 3
      || receipt.scope?.kind !== "unit"
      || receipt.scope?.unitId !== exactUnitId
      || JSON.stringify(receipt.checks) !== JSON.stringify(UNIT_CHECKS)) {
      throw new Error("local unit release gate receipt contract is invalid");
    }
    validateUnitProof(receipt.unit, exactUnitId);
    validateLocalUnitCiReceipt(receipt.unitCi, {
      unitId: exactUnitId,
      sourceSha: exactSource,
      treeSha: exactTree,
    });
  } else {
    throw new Error("local release gate scope must be full or unit");
  }
  requireIsoTimestamp(receipt.completedAt);
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

function atomicWriteJson(file, value) {
  const target = resolve(file);
  const temporary = resolve(dirname(target), `.${basename(target)}.tmp-${process.pid}`);
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error(`${label} is missing or invalid JSON`);
  }
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (!options.source || !options.tree) throw new Error("--source and --tree are required");
  if (options.mode === "create") {
    if (!options.output) throw new Error("create requires --output");
    const unitMode = Boolean(options.unit);
    if (unitMode && (!options.unit_ci || !options.unit_contract || !options.unit_manifest)) {
      throw new Error("unit create requires --unit-ci, --unit-contract, and --unit-manifest");
    }
    if (!unitMode && !options.full_ci) throw new Error("Full create requires --full-ci");
    const receipt = createLocalReleaseGateReceipt({
      sourceSha: options.source,
      treeSha: options.tree,
      fullCiReceipt: unitMode ? undefined : readJson(options.full_ci, "local full CI receipt"),
      unitId: options.unit,
      unitCiReceipt: unitMode ? readJson(options.unit_ci, "local unit CI receipt") : undefined,
      unitContract: unitMode ? readJson(options.unit_contract, "deploy unit contract") : undefined,
      unitManifest: unitMode ? readJson(options.unit_manifest, "deploy unit artifact manifest") : undefined,
    });
    atomicWriteJson(options.output, receipt);
    return receipt;
  }
  if (options.mode === "verify") {
    if (!options.file) throw new Error("verify requires --file");
    const scope = options.scope ?? "full";
    const receipt = validateLocalReleaseGateReceipt(
      readJson(options.file, "local release gate receipt"),
      { sourceSha: options.source, treeSha: options.tree, scope, unitId: options.unit },
    );
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    return receipt;
  }
  throw new Error("usage: local-release-gate-receipt.mjs create|verify --source SHA --tree SHA [--full-ci FILE|--unit ID --unit-ci FILE --unit-contract FILE --unit-manifest FILE] [--output FILE|--scope full|unit --file FILE]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
