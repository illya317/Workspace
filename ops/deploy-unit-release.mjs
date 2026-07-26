#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { readControlPlaneReceipt } from "./control-plane-receipt.mjs";
import { readControlPlaneRequirements } from "./control-plane-requirements.mjs";
import { readTenantConfigManifest } from "./tenant-config-manifest.mjs";

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const UNIT_PATTERN = /^[a-z][a-z0-9-]*$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SLOTS = new Set(["blue", "green"]);
const UNIT_CONTRACT_KIND = "workspace-deploy-unit-contract";
const ARTIFACT_KIND = "workspace-deploy-unit-artifact";
const RECEIPT_KIND = "workspace-deploy-unit-release";
const ACTIVATION_KIND = "workspace-deploy-unit-activation";
const STATE_KIND = "workspace-deploy-unit-state";

function fail(message) {
  throw new Error(message);
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, canonicalValue(nested)]));
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function digestFile(file) {
  return sha256(readFileSync(file));
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || !value) fail(`${label} is required`);
  return value;
}

function requireUnit(value, label = "unit id") {
  if (!UNIT_PATTERN.test(value ?? "")) fail(`${label} is invalid`);
  return value;
}

function requireId(value, label) {
  if (!ID_PATTERN.test(value ?? "")) fail(`${label} is invalid`);
  return value;
}

function requireDigest(value, label) {
  if (!DIGEST_PATTERN.test(value ?? "")) fail(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function requireSha(value, label) {
  if (!SHA_PATTERN.test(value ?? "")) fail(`${label} must be a full lowercase Git SHA`);
  return value;
}

function requireTimestamp(value, label) {
  if (!TIMESTAMP_PATTERN.test(value ?? "")) fail(`${label} must be an ISO UTC timestamp`);
  return value;
}

function requirePort(value, label) {
  if (!Number.isInteger(value) || value < 1024 || value > 65535) fail(`${label} must be a valid internal port`);
  return value;
}

function requireSlot(value) {
  if (!SLOTS.has(value)) fail("deploy unit slot must be blue or green");
  return value;
}

function requireAbsolutePath(value, label) {
  const candidate = requireString(value, label);
  if (!path.isAbsolute(candidate)) fail(`${label} must be absolute`);
  return candidate;
}

function requireRelativePath(value, label) {
  const candidate = requireString(value, label);
  if (path.isAbsolute(candidate) || candidate.split(/[\\/]/).includes("..")) {
    fail(`${label} must stay inside the artifact`);
  }
  return candidate;
}

function normalizedArtifactIdentity(value, label = "artifact") {
  const artifact = requireObject(value, label);
  return {
    sha256: requireDigest(artifact.sha256, `${label} digest`),
    manifestSha256: requireDigest(artifact.manifestSha256, `${label} manifest digest`),
  };
}

export function normalizeDeployUnitContract(value) {
  const contract = requireObject(value, "deploy unit contract");
  if (contract.schemaVersion !== 1 || contract.kind !== UNIT_CONTRACT_KIND) fail("deploy unit contract is invalid");
  const id = requireUnit(contract.id);
  if (!DIGEST_PATTERN.test(contract.graphSha256 ?? "")) fail(`${id} graph digest is invalid`);
  if (!new Set(["planned", "candidate", "active"]).has(contract.maturity)) fail(`${id} maturity is invalid`);
  if (!new Set(["available", "frozen-final-handoff"]).has(contract.coordination)) fail(`${id} coordination is invalid`);
  const build = requireObject(contract.build, `${id} build contract`);
  if (!new Set(["standalone", "node-bundle"]).has(build.output)
    || build.deploymentIdSource !== "artifact-manifest") {
    fail(`${id} build contract is unsupported`);
  }
  if (!requireString(build.basePath, `${id} base path`).startsWith("/")) fail(`${id} base path must be absolute`);
  if (build.assetPrefix !== null && !requireString(build.assetPrefix, `${id} asset prefix`).startsWith("/")) {
    fail(`${id} asset prefix must be absolute`);
  }
  const runtime = requireObject(contract.runtime, `${id} runtime contract`);
  if (!new Set(["next-standalone", "node-worker"]).has(runtime.engine)) fail(`${id} runtime engine is unsupported`);
  const expectedOutput = runtime.engine === "next-standalone" ? "standalone" : "node-bundle";
  if (build.output !== expectedOutput) fail(`${id} build output does not match its runtime engine`);
  requireString(runtime.processName, `${id} process name`);
  if (!requireString(runtime.healthPath, `${id} health path`).startsWith("/")) fail(`${id} health path must be absolute`);
  if (!requireString(runtime.versionPath, `${id} version path`).startsWith("/")) fail(`${id} version path must be absolute`);
  const slots = requireObject(runtime.slots, `${id} runtime slots`);
  const bluePort = requirePort(slots.blue?.port, `${id} blue port`);
  const greenPort = requirePort(slots.green?.port, `${id} green port`);
  if (bluePort === greenPort) fail(`${id} blue and green ports must differ`);
  const readiness = requireObject(contract.readiness, `${id} readiness`);
  if (!Array.isArray(readiness.contributorBlockers)) fail(`${id} contributor blockers must be an array`);
  return contract;
}

export function readDeployUnitContract(file) {
  return normalizeDeployUnitContract(JSON.parse(readFileSync(file, "utf8")));
}

function assertBuildableContract(contract) {
  if (contract.maturity === "planned") fail(`${contract.id} is planned and cannot produce an independent artifact`);
  if (contract.coordination === "frozen-final-handoff") fail(`${contract.id} is frozen until final handoff`);
  if (contract.readiness.contributorBlockers.length > 0) {
    fail(`${contract.id} still has cross-unit contributor blockers`);
  }
}

export function createDeployUnitArtifactManifest({
  contractFile,
  artifactFile,
  sourceSha,
  sourceTree,
  buildId,
  deploymentId,
  serverEntry,
  controlPlaneRequirementsFile,
  createdAt = new Date().toISOString(),
}) {
  const contract = readDeployUnitContract(contractFile);
  assertBuildableContract(contract);
  const controlPlaneRequirements = readControlPlaneRequirements(controlPlaneRequirementsFile);
  if (controlPlaneRequirements.source.commitSha !== sourceSha
    || controlPlaneRequirements.source.treeSha !== sourceTree) {
    fail(`${contract.id} control-plane requirements belong to another source`);
  }
  const normalizedBuildId = requireId(buildId, "build id");
  const normalizedDeploymentId = requireId(deploymentId, "deployment id");
  if (normalizedBuildId !== normalizedDeploymentId) fail("build id and deployment id must be identical");
  const artifactStat = statSync(artifactFile);
  if (!artifactStat.isFile() || artifactStat.size <= 0) fail("deploy unit artifact must be a non-empty file");
  return normalizeDeployUnitArtifactManifest({
    schemaVersion: 1,
    kind: ARTIFACT_KIND,
    unit: {
      id: contract.id,
      kind: contract.unitKind,
      contractSha256: sha256(canonicalJson(contract)),
      graphSha256: contract.graphSha256,
    },
    source: {
      commitSha: sourceSha,
      treeSha: sourceTree,
    },
    build: {
      buildId: normalizedBuildId,
      deploymentId: normalizedDeploymentId,
      serverEntry,
      basePath: contract.build.basePath,
      assetPrefix: contract.build.assetPrefix,
      output: contract.build.output,
    },
    runtime: {
      engine: contract.runtime.engine,
      processName: contract.runtime.processName,
      slots: contract.runtime.slots,
      healthPath: contract.runtime.healthPath,
      versionPath: contract.runtime.versionPath,
      capacity: contract.runtime.capacity,
    },
    artifact: {
      sha256: digestFile(artifactFile),
      size: artifactStat.size,
    },
    controlPlane: {
      policy: "require-existing",
      requirementsSha256: digestFile(controlPlaneRequirementsFile),
      inputs: controlPlaneRequirements.inputs,
    },
    createdAt,
  });
}

export function normalizeDeployUnitArtifactManifest(value) {
  const manifest = requireObject(value, "deploy unit artifact manifest");
  if (manifest.schemaVersion !== 1 || manifest.kind !== ARTIFACT_KIND) fail("deploy unit artifact manifest is invalid");
  const unit = requireObject(manifest.unit, "artifact unit");
  const id = requireUnit(unit.id);
  requireDigest(unit.contractSha256, `${id} contract digest`);
  requireDigest(unit.graphSha256, `${id} graph digest`);
  const source = requireObject(manifest.source, `${id} source`);
  requireSha(source.commitSha, `${id} source SHA`);
  requireSha(source.treeSha, `${id} source tree`);
  const build = requireObject(manifest.build, `${id} build`);
  const buildId = requireId(build.buildId, `${id} build id`);
  if (buildId !== requireId(build.deploymentId, `${id} deployment id`)) {
    fail(`${id} build id and deployment id differ`);
  }
  requireRelativePath(build.serverEntry, `${id} server entry`);
  if (!new Set(["standalone", "node-bundle"]).has(build.output)) fail(`${id} artifact output is unsupported`);
  const runtime = requireObject(manifest.runtime, `${id} runtime`);
  if (!new Set(["next-standalone", "node-worker"]).has(runtime.engine)) fail(`${id} runtime engine is unsupported`);
  const expectedOutput = runtime.engine === "next-standalone" ? "standalone" : "node-bundle";
  if (build.output !== expectedOutput) fail(`${id} artifact output does not match its runtime engine`);
  const slots = requireObject(runtime.slots, `${id} runtime slots`);
  requirePort(slots.blue?.port, `${id} blue port`);
  requirePort(slots.green?.port, `${id} green port`);
  requireString(runtime.healthPath, `${id} health path`);
  requireString(runtime.versionPath, `${id} version path`);
  const capacity = requireObject(runtime.capacity, `${id} runtime capacity`);
  if (!Number.isSafeInteger(capacity.memoryMiB) || capacity.memoryMiB <= 0) {
    fail(`${id} runtime memory capacity is invalid`);
  }
  if (!Number.isSafeInteger(capacity.databasePoolMax) || capacity.databasePoolMax <= 0) {
    fail(`${id} runtime database pool capacity is invalid`);
  }
  if (capacity.blueGreenReplicaMultiplier !== 2) {
    fail(`${id} runtime blue-green replica multiplier is invalid`);
  }
  const artifact = requireObject(manifest.artifact, `${id} artifact`);
  requireDigest(artifact.sha256, `${id} artifact digest`);
  if (!Number.isSafeInteger(artifact.size) || artifact.size <= 0) fail(`${id} artifact size is invalid`);
  if (manifest.controlPlane?.policy !== "require-existing") fail(`${id} control-plane policy is unsafe`);
  requireDigest(manifest.controlPlane?.requirementsSha256, `${id} control-plane requirements digest`);
  const controlPlaneInputs = requireObject(manifest.controlPlane?.inputs, `${id} control-plane inputs`);
  const expectedControlPlaneKeys = [
    "dataReleaseManifestSetSha256",
    "lifecycleToolSetSha256",
    "migrationSetSha256",
    "resourceManifestSha256",
  ];
  if (JSON.stringify(Object.keys(controlPlaneInputs).sort()) !== JSON.stringify(expectedControlPlaneKeys)) {
    fail(`${id} control-plane inputs are incomplete or unknown`);
  }
  for (const [key, digest] of Object.entries(controlPlaneInputs)) requireDigest(digest, `${id} control-plane ${key}`);
  requireTimestamp(manifest.createdAt, `${id} artifact creation time`);
  return manifest;
}

export function readDeployUnitArtifactManifest(file) {
  return normalizeDeployUnitArtifactManifest(JSON.parse(readFileSync(file, "utf8")));
}

export function assertDeployUnitArtifact({ manifestFile, artifactFile, contractFile }) {
  const manifest = readDeployUnitArtifactManifest(manifestFile);
  const contract = readDeployUnitContract(contractFile);
  if (manifest.unit.id !== contract.id) fail(`artifact belongs to ${manifest.unit.id}, expected ${contract.id}`);
  const contractSha256 = sha256(canonicalJson(contract));
  if (manifest.unit.contractSha256 !== contractSha256) fail(`${contract.id} artifact contract digest drifted`);
  if (manifest.unit.graphSha256 !== contract.graphSha256) fail(`${contract.id} artifact graph digest drifted`);
  if (manifest.artifact.sha256 !== digestFile(artifactFile)) fail(`${contract.id} artifact digest mismatch`);
  if (manifest.artifact.size !== statSync(artifactFile).size) fail(`${contract.id} artifact size mismatch`);
  return manifest;
}

export function createDeployUnitReceipt({
  manifestFile,
  controlPlaneReceiptFile,
  tenantManifestFile,
  releaseId,
  releaseDir,
  slot,
  deployedAt = new Date().toISOString(),
}) {
  const manifest = readDeployUnitArtifactManifest(manifestFile);
  const controlPlane = readControlPlaneReceipt(controlPlaneReceiptFile);
  assertArtifactControlPlane({ manifestFile, receiptFile: controlPlaneReceiptFile, tenantManifestFile });
  const normalizedSlot = requireSlot(slot);
  const port = manifest.runtime.slots[normalizedSlot].port;
  return normalizeDeployUnitReceipt({
    schemaVersion: 1,
    kind: RECEIPT_KIND,
    unitId: manifest.unit.id,
    source: manifest.source,
    contract: {
      sha256: manifest.unit.contractSha256,
      graphSha256: manifest.unit.graphSha256,
    },
    artifact: {
      sha256: manifest.artifact.sha256,
      manifestSha256: digestFile(manifestFile),
    },
    build: manifest.build,
    controlPlane: {
      receiptSha256: digestFile(controlPlaneReceiptFile),
      inputs: controlPlane.inputs,
      completedAt: controlPlane.completedAt,
    },
    deployment: {
      releaseId,
      releaseDir,
      slot: normalizedSlot,
      port,
      status: "shadow-ready",
      deployedAt,
    },
    checks: [
      { id: "health", path: manifest.runtime.healthPath, status: "passed" },
      { id: "version", path: manifest.runtime.versionPath, status: "passed" },
    ],
  });
}

export function normalizeDeployUnitReceipt(value) {
  const receipt = requireObject(value, "deploy unit receipt");
  if (receipt.schemaVersion !== 1 || receipt.kind !== RECEIPT_KIND) fail("deploy unit receipt is invalid");
  const unitId = requireUnit(receipt.unitId);
  requireSha(receipt.source?.commitSha, `${unitId} receipt source SHA`);
  requireSha(receipt.source?.treeSha, `${unitId} receipt source tree`);
  requireDigest(receipt.contract?.sha256, `${unitId} receipt contract digest`);
  requireDigest(receipt.contract?.graphSha256, `${unitId} receipt graph digest`);
  normalizedArtifactIdentity(receipt.artifact, `${unitId} receipt artifact`);
  const buildId = requireId(receipt.build?.buildId, `${unitId} receipt build id`);
  if (buildId !== requireId(receipt.build?.deploymentId, `${unitId} receipt deployment id`)) {
    fail(`${unitId} receipt build id and deployment id differ`);
  }
  requireRelativePath(receipt.build?.serverEntry, `${unitId} receipt server entry`);
  requireDigest(receipt.controlPlane?.receiptSha256, `${unitId} control-plane receipt digest`);
  const controlPlaneInputs = requireObject(receipt.controlPlane?.inputs, `${unitId} control-plane receipt inputs`);
  const expectedReceiptInputKeys = [
    "dataReleaseManifestSetSha256",
    "lifecycleToolSetSha256",
    "migrationSetSha256",
    "resourceManifestSha256",
    "tenantConfigDigest",
  ];
  if (JSON.stringify(Object.keys(controlPlaneInputs).sort()) !== JSON.stringify(expectedReceiptInputKeys)) {
    fail(`${unitId} control-plane receipt inputs are incomplete or unknown`);
  }
  for (const [key, digest] of Object.entries(controlPlaneInputs)) requireDigest(digest, `${unitId} control-plane ${key}`);
  requireTimestamp(receipt.controlPlane?.completedAt, `${unitId} control-plane completion time`);
  const deployment = requireObject(receipt.deployment, `${unitId} deployment`);
  requireId(deployment.releaseId, `${unitId} release id`);
  requireAbsolutePath(deployment.releaseDir, `${unitId} release directory`);
  requireSlot(deployment.slot);
  requirePort(deployment.port, `${unitId} deployment port`);
  if (deployment.status !== "shadow-ready") fail(`${unitId} deployment is not shadow-ready`);
  requireTimestamp(deployment.deployedAt, `${unitId} deployment time`);
  if (!Array.isArray(receipt.checks) || receipt.checks.length !== 2) fail(`${unitId} deployment checks are incomplete`);
  if (receipt.checks.some((check) => check?.status !== "passed")) fail(`${unitId} deployment checks did not pass`);
  if (receipt.checks[0]?.id !== "health" || receipt.checks[1]?.id !== "version") {
    fail(`${unitId} deployment checks are not the exact ordered set`);
  }
  for (const check of receipt.checks) {
    if (!requireString(check.path, `${unitId} ${check.id} check path`).startsWith("/")) {
      fail(`${unitId} ${check.id} check path must be absolute`);
    }
  }
  return receipt;
}

export function readDeployUnitReceipt(file) {
  return normalizeDeployUnitReceipt(JSON.parse(readFileSync(file, "utf8")));
}

export function assertArtifactControlPlane({ manifestFile, receiptFile, tenantManifestFile }) {
  const manifest = readDeployUnitArtifactManifest(manifestFile);
  const receipt = readControlPlaneReceipt(receiptFile);
  const tenantManifest = readTenantConfigManifest(tenantManifestFile);
  for (const [key, expected] of Object.entries(manifest.controlPlane.inputs)) {
    const actual = receipt.inputs[key];
    if (actual !== expected) {
      fail(`${manifest.unit.id} control-plane ${key} mismatch: expected ${expected}, received ${actual ?? "<missing>"}`);
    }
  }
  if (receipt.inputs.tenantConfigDigest !== tenantManifest.digest) {
    fail(`${manifest.unit.id} control-plane tenant config does not match the installed manifest`);
  }
  return receipt;
}

export function createDeployUnitActivation(receiptFile, activatedAt = new Date().toISOString()) {
  const receipt = readDeployUnitReceipt(receiptFile);
  return normalizeDeployUnitActivation({
    schemaVersion: 1,
    kind: ACTIVATION_KIND,
    unitId: receipt.unitId,
    slot: receipt.deployment.slot,
    port: receipt.deployment.port,
    releaseId: receipt.deployment.releaseId,
    releaseDir: receipt.deployment.releaseDir,
    deploymentId: receipt.build.deploymentId,
    artifact: receipt.artifact,
    receiptSha256: digestFile(receiptFile),
    activatedAt,
  });
}

export function normalizeDeployUnitActivation(value) {
  const activation = requireObject(value, "deploy unit activation");
  if (activation.schemaVersion !== 1 || activation.kind !== ACTIVATION_KIND) fail("deploy unit activation is invalid");
  const unitId = requireUnit(activation.unitId);
  requireSlot(activation.slot);
  requirePort(activation.port, `${unitId} activation port`);
  requireId(activation.releaseId, `${unitId} activation release id`);
  requireAbsolutePath(activation.releaseDir, `${unitId} activation release directory`);
  requireId(activation.deploymentId, `${unitId} activation deployment id`);
  normalizedArtifactIdentity(activation.artifact, `${unitId} activation artifact`);
  requireDigest(activation.receiptSha256, `${unitId} activation receipt digest`);
  requireTimestamp(activation.activatedAt, `${unitId} activation time`);
  return activation;
}

export function normalizeDeployUnitState(value) {
  const state = requireObject(value, "deploy unit state");
  if (state.schemaVersion !== 1 || state.kind !== STATE_KIND) fail("deploy unit state is invalid");
  const unitId = requireUnit(state.unitId);
  const active = state.active === null ? null : normalizeDeployUnitActivation(state.active);
  const previous = state.previous === null ? null : normalizeDeployUnitActivation(state.previous);
  if (active && active.unitId !== unitId) fail(`${unitId} active release belongs to ${active.unitId}`);
  if (previous && previous.unitId !== unitId) fail(`${unitId} previous release belongs to ${previous.unitId}`);
  if (active && previous && active.receiptSha256 === previous.receiptSha256) {
    fail(`${unitId} active and previous releases must differ`);
  }
  requireTimestamp(state.updatedAt, `${unitId} state update time`);
  return { ...state, active, previous };
}

export function readDeployUnitState(file) {
  return normalizeDeployUnitState(JSON.parse(readFileSync(file, "utf8")));
}

export function promoteDeployUnitState(current, activation, updatedAt = new Date().toISOString()) {
  const next = normalizeDeployUnitActivation(activation);
  const previousState = current === null
    ? {
      schemaVersion: 1,
      kind: STATE_KIND,
      unitId: next.unitId,
      active: null,
      previous: null,
      updatedAt,
    }
    : normalizeDeployUnitState(current);
  if (previousState.unitId !== next.unitId) fail(`state belongs to ${previousState.unitId}, not ${next.unitId}`);
  if (previousState.active?.receiptSha256 === next.receiptSha256) fail(`${next.unitId} release is already active`);
  if (previousState.active?.slot === next.slot) fail(`${next.unitId} must deploy to the inactive slot`);
  return normalizeDeployUnitState({
    schemaVersion: 1,
    kind: STATE_KIND,
    unitId: next.unitId,
    active: next,
    previous: previousState.active,
    updatedAt,
  });
}

export function rollbackDeployUnitState(current, updatedAt = new Date().toISOString()) {
  const state = normalizeDeployUnitState(current);
  if (!state.active || !state.previous) fail(`${state.unitId} has no previous release to roll back to`);
  return normalizeDeployUnitState({
    ...state,
    active: state.previous,
    previous: state.active,
    updatedAt,
  });
}

export function writePrivateJson(file, value, normalize = (candidate) => candidate) {
  const normalized = normalize(value);
  const resolved = path.resolve(file);
  mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(resolved), `.${path.basename(resolved)}.tmp-${process.pid}-${randomUUID()}`);
  writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, resolved);
  chmodSync(resolved, 0o600);
  return normalized;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[++index];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) fail(`invalid argument: ${key ?? "<missing>"}`);
    options[key.slice(2).replaceAll("-", "_")] = value;
  }
  return options;
}

function requiredOption(options, key) {
  return requireString(options[key], `--${key.replaceAll("_", "-")}`);
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const options = parseArguments(rest);
  if (command === "artifact-write") {
    const manifest = createDeployUnitArtifactManifest({
      contractFile: requiredOption(options, "contract"),
      artifactFile: requiredOption(options, "artifact"),
      sourceSha: requiredOption(options, "source_sha"),
      sourceTree: requiredOption(options, "source_tree"),
      buildId: requiredOption(options, "build_id"),
      deploymentId: requiredOption(options, "deployment_id"),
      serverEntry: requiredOption(options, "server_entry"),
      controlPlaneRequirementsFile: requiredOption(options, "control_plane_requirements"),
    });
    writePrivateJson(requiredOption(options, "manifest"), manifest, normalizeDeployUnitArtifactManifest);
    return;
  }
  if (command === "artifact-assert") {
    assertDeployUnitArtifact({
      manifestFile: requiredOption(options, "manifest"),
      artifactFile: requiredOption(options, "artifact"),
      contractFile: requiredOption(options, "contract"),
    });
    process.stdout.write("MATCH\n");
    return;
  }
  if (command === "receipt-write") {
    const receipt = createDeployUnitReceipt({
      manifestFile: requiredOption(options, "manifest"),
      controlPlaneReceiptFile: requiredOption(options, "control_plane_receipt"),
      tenantManifestFile: requiredOption(options, "tenant_manifest"),
      releaseId: requiredOption(options, "release_id"),
      releaseDir: requiredOption(options, "release_dir"),
      slot: requiredOption(options, "slot"),
    });
    writePrivateJson(requiredOption(options, "receipt"), receipt, normalizeDeployUnitReceipt);
    return;
  }
  if (command === "receipt-source-assert") {
    const receipt = readDeployUnitReceipt(requiredOption(options, "receipt"));
    if (receipt.source.commitSha !== requiredOption(options, "source_sha")
      || receipt.source.treeSha !== requiredOption(options, "source_tree")) {
      fail(`${receipt.unitId} receipt source does not match the requested release`);
    }
    process.stdout.write("MATCH\n");
    return;
  }
  if (command === "control-plane-assert") {
    assertArtifactControlPlane({
      manifestFile: requiredOption(options, "manifest"),
      receiptFile: requiredOption(options, "control_plane_receipt"),
      tenantManifestFile: requiredOption(options, "tenant_manifest"),
    });
    process.stdout.write("MATCH\n");
    return;
  }
  if (command === "activation-write") {
    const activation = createDeployUnitActivation(requiredOption(options, "receipt"));
    writePrivateJson(requiredOption(options, "activation"), activation, normalizeDeployUnitActivation);
    return;
  }
  if (command === "state-promote") {
    const stateFile = requiredOption(options, "state");
    let current = null;
    try {
      current = readDeployUnitState(stateFile);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const activation = normalizeDeployUnitActivation(JSON.parse(readFileSync(requiredOption(options, "activation"), "utf8")));
    writePrivateJson(stateFile, promoteDeployUnitState(current, activation), normalizeDeployUnitState);
    return;
  }
  if (command === "state-rollback") {
    const stateFile = requiredOption(options, "state");
    writePrivateJson(stateFile, rollbackDeployUnitState(readDeployUnitState(stateFile)), normalizeDeployUnitState);
    return;
  }
  if (command === "state-inspect") {
    process.stdout.write(`${JSON.stringify(readDeployUnitState(requiredOption(options, "state")))}\n`);
    return;
  }
  fail(`unknown command: ${command ?? "<missing>"}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
