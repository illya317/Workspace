import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertDeployUnitArtifact,
  createDeployUnitActivation,
  createDeployUnitArtifactManifest,
  createDeployUnitReceipt,
  normalizeDeployUnitArtifactManifest,
  promoteDeployUnitState,
  readDeployUnitState,
  rollbackDeployUnitState,
  writePrivateJson,
} from "./deploy-unit-release.mjs";
import { createControlPlaneReceipt, writeControlPlaneReceipt } from "./control-plane-receipt.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function controlPlaneFixture(root) {
  const resourceManifestFile = path.join(root, "resource-defs.json");
  const tenantManifestFile = path.join(root, "tenant-config-manifest.json");
  const lifecycleRoot = path.join(root, "lifecycle");
  for (const relativePath of [
    "node_modules/prisma/package.json",
    "ops/prisma-genesis-cutover.mjs",
    "scripts/check/check-permission-action-grants.mjs",
    "scripts/check/check-prisma-deploy-status.js",
    "scripts/ci/check-migration-policy.mjs",
    "scripts/lib/agent-workforce-specs.mjs",
    "scripts/migrate/sqlite-to-postgresql.mjs",
    "scripts/provision-agent-workforce.mjs",
    "seed-resources-runtime.mjs",
  ]) {
    const file = path.join(lifecycleRoot, relativePath);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${relativePath}\n`);
  }
  writeFileSync(resourceManifestFile, "{\"resources\":[]}\n");
  const tenantFiles = [
    { path: "manifest.json", size: 2, sha256: sha256("{}") },
    { path: "config/tenant/profile.json", size: 2, sha256: sha256("{}") },
  ];
  const tenantDigest = sha256(Buffer.from(tenantFiles.map((file) => `${file.path}\0${file.size}\0${file.sha256}\n`).join("")));
  writeJson(tenantManifestFile, {
    schemaVersion: 2,
    kind: "workspace-tenant-config",
    digest: tenantDigest,
    managedDirectories: [],
    files: tenantFiles,
  });
  const receiptFile = path.join(root, "control-plane-release.json");
  writeControlPlaneReceipt(receiptFile, createControlPlaneReceipt({
    target: "production",
    sourceSha: "a".repeat(40),
    sourceTree: "b".repeat(40),
    migrationSetSha256: "c".repeat(64),
    resourceManifestFile,
    tenantManifestFile,
    lifecycleRoot,
    completedAt: "2026-07-25T00:00:00.000Z",
  }));
  return { receiptFile, tenantManifestFile };
}

function contract(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: "workspace-deploy-unit-contract",
    graphSha256: "d".repeat(64),
    id: "finance",
    unitKind: "business-l1",
    maturity: "candidate",
    coordination: "available",
    build: {
      appRoot: "apps/finance",
      output: "standalone",
      basePath: "/workspace",
      assetPrefix: "/workspace-static/finance",
      deploymentIdSource: "artifact-manifest",
    },
    runtime: {
      engine: "next-standalone",
      appRoot: "apps/finance",
      processName: "workspace-finance",
      slots: { blue: { port: 3201 }, green: { port: 3301 } },
      assetPrefix: "/workspace-static/finance",
      healthPath: "/api/internal/health",
      versionPath: "/api/settings/version",
      capacity: { memoryMiB: 512, databasePoolMax: 4, blueGreenReplicaMultiplier: 2 },
    },
    routes: { pagePrefixes: ["/workspace/finance"], apiPrefixes: [], assetPrefix: "/workspace-static/finance" },
    compiler: { projects: [], typecheckScopes: ["finance"] },
    checks: { typecheckScopes: ["finance"], e2eSuites: [], unmatchedChangePolicy: "fail-closed" },
    controlPlane: {
      authority: "workspace-control-plane-job",
      policy: "require-existing",
      minimumSchemaReceipt: "required-before-unit-start",
    },
    readiness: { contributorBlockers: [] },
    ...overrides,
  };
}

function fixture(contractOverrides = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-deploy-unit-"));
  const contractFile = path.join(root, "contract.json");
  const artifactFile = path.join(root, "finance.tgz");
  const manifestFile = path.join(root, "finance.manifest.json");
  writeJson(contractFile, contract(contractOverrides));
  writeFileSync(artifactFile, "immutable-artifact\n");
  const controlPlane = controlPlaneFixture(root);
  const controlPlaneRequirementsFile = path.join(root, "control-plane-requirements.json");
  const controlPlaneReceipt = JSON.parse(readFileSync(controlPlane.receiptFile, "utf8"));
  writeJson(controlPlaneRequirementsFile, {
    schemaVersion: 1,
    kind: "workspace-control-plane-requirements",
    source: { commitSha: "1".repeat(40), treeSha: "2".repeat(40) },
    inputs: {
      migrationSetSha256: controlPlaneReceipt.inputs.migrationSetSha256,
      resourceManifestSha256: controlPlaneReceipt.inputs.resourceManifestSha256,
      lifecycleToolSetSha256: controlPlaneReceipt.inputs.lifecycleToolSetSha256,
    },
    createdAt: "2026-07-25T00:30:00.000Z",
  });
  return {
    root,
    contractFile,
    artifactFile,
    manifestFile,
    controlPlaneReceiptFile: controlPlane.receiptFile,
    tenantManifestFile: controlPlane.tenantManifestFile,
    controlPlaneRequirementsFile,
  };
}

function createManifest(files, deploymentId = "finance-a1") {
  return createDeployUnitArtifactManifest({
    ...files,
    sourceSha: "1".repeat(40),
    sourceTree: "2".repeat(40),
    buildId: deploymentId,
    deploymentId,
    serverEntry: "server.js",
    controlPlaneRequirementsFile: files.controlPlaneRequirementsFile,
    createdAt: "2026-07-25T01:00:00.000Z",
  });
}

test("artifact manifest binds the exact contract, graph, source, deployment id, and bytes", () => {
  const files = fixture();
  const manifest = createManifest(files);
  writePrivateJson(files.manifestFile, manifest, normalizeDeployUnitArtifactManifest);
  assert.equal(assertDeployUnitArtifact(files).unit.id, "finance");
  assert.equal(manifest.build.buildId, manifest.build.deploymentId);
  assert.equal(manifest.runtime.slots.green.port, 3301);
  writeFileSync(files.artifactFile, "tampered\n");
  assert.throws(() => assertDeployUnitArtifact(files), /artifact digest mismatch/);
});

test("planned, frozen, and contributor-coupled units cannot produce an artifact", () => {
  assert.throws(() => createManifest(fixture({ maturity: "planned" })), /is planned/);
  assert.throws(() => createManifest(fixture({ coordination: "frozen-final-handoff" })), /is frozen/);
  assert.throws(() => createManifest(fixture({
    readiness: { contributorBlockers: [{ targetUnitId: "hr", importedPackage: "@workspace/hr", files: ["route.ts"] }] },
  })), /contributor blockers/);
});

test("shadow-ready receipt binds the control-plane floor before activation", () => {
  const files = fixture();
  writePrivateJson(files.manifestFile, createManifest(files), normalizeDeployUnitArtifactManifest);
  const receiptFile = path.join(files.root, "release.json");
  const receipt = createDeployUnitReceipt({
    manifestFile: files.manifestFile,
    controlPlaneReceiptFile: files.controlPlaneReceiptFile,
    tenantManifestFile: files.tenantManifestFile,
    releaseId: "finance-release-a1",
    releaseDir: "/srv/workspace/deploy-units/finance/releases/finance-release-a1",
    slot: "blue",
    deployedAt: "2026-07-25T02:00:00.000Z",
  });
  writePrivateJson(receiptFile, receipt);
  const activation = createDeployUnitActivation(receiptFile, "2026-07-25T02:01:00.000Z");
  assert.equal(activation.port, 3201);
  assert.equal(activation.artifact.manifestSha256.length, 64);
  assert.equal(activation.receiptSha256.length, 64);
});

test("state promotes only the inactive slot and rollback swaps exact immutable releases", () => {
  const base = {
    schemaVersion: 1,
    kind: "workspace-deploy-unit-activation",
    unitId: "finance",
    releaseId: "release-blue",
    releaseDir: "/srv/workspace/deploy-units/finance/releases/release-blue",
    deploymentId: "finance-blue",
    artifact: { sha256: "a".repeat(64), manifestSha256: "b".repeat(64) },
    receiptSha256: "c".repeat(64),
    slot: "blue",
    port: 3201,
    activatedAt: "2026-07-25T03:00:00.000Z",
  };
  const first = promoteDeployUnitState(null, base, "2026-07-25T03:00:00.000Z");
  assert.equal(first.active.slot, "blue");
  assert.equal(first.previous, null);
  assert.throws(() => rollbackDeployUnitState(first), /no previous release/);
  assert.throws(() => promoteDeployUnitState(first, { ...base, releaseId: "same-slot", receiptSha256: "d".repeat(64) }), /inactive slot/);
  const green = {
    ...base,
    releaseId: "release-green",
    releaseDir: "/srv/workspace/deploy-units/finance/releases/release-green",
    deploymentId: "finance-green",
    artifact: { sha256: "e".repeat(64), manifestSha256: "f".repeat(64) },
    receiptSha256: "0".repeat(64),
    slot: "green",
    port: 3301,
    activatedAt: "2026-07-25T04:00:00.000Z",
  };
  const second = promoteDeployUnitState(first, green, "2026-07-25T04:00:00.000Z");
  assert.equal(second.active.releaseId, "release-green");
  assert.equal(second.previous.releaseId, "release-blue");
  const rolledBack = rollbackDeployUnitState(second, "2026-07-25T05:00:00.000Z");
  assert.equal(rolledBack.active.releaseId, "release-blue");
  assert.equal(rolledBack.previous.releaseId, "release-green");
});

test("unit state writes atomically as a private file", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-deploy-unit-state-"));
  const stateFile = path.join(root, "nested", "state.json");
  const state = {
    schemaVersion: 1,
    kind: "workspace-deploy-unit-state",
    unitId: "finance",
    active: null,
    previous: null,
    updatedAt: "2026-07-25T00:00:00.000Z",
  };
  writePrivateJson(stateFile, state);
  assert.deepEqual(readDeployUnitState(stateFile), state);
  assert.equal(statSync(stateFile).mode & 0o777, 0o600);
  assert.equal(readFileSync(stateFile, "utf8").endsWith("\n"), true);
});
