import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertControlPlaneReceipt,
  createControlPlaneReceipt,
  digestLifecycleSourceToolSet,
  digestLifecycleToolSet,
  normalizeControlPlaneReceipt,
  readControlPlaneReceipt,
  writeControlPlaneReceipt,
} from "./control-plane-receipt.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-control-plane-"));
  const resourceManifestFile = path.join(root, "resource-defs.json");
  const tenantManifestFile = path.join(root, "tenant-config-manifest.json");
  const lifecycleRoot = path.join(root, "release");
  const lifecycleSourceRoot = path.join(root, "source");
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
    const sourceRelativePath = relativePath === "seed-resources-runtime.mjs"
      ? "scripts/seed-resources-runtime.mjs"
      : relativePath;
    const sourceFile = path.join(lifecycleSourceRoot, sourceRelativePath);
    mkdirSync(path.dirname(sourceFile), { recursive: true });
    writeFileSync(sourceFile, `${relativePath}\n`);
  }
  writeFileSync(resourceManifestFile, "{\"resources\":[]}\n");
  const files = [
    { path: "manifest.json", size: 2, sha256: sha256("{}") },
    { path: "config/tenant/profile.json", size: 2, sha256: sha256("{}") },
  ];
  const digest = sha256(Buffer.from(files.map((file) => `${file.path}\0${file.size}\0${file.sha256}\n`).join("")));
  writeFileSync(tenantManifestFile, `${JSON.stringify({ schemaVersion: 2, kind: "workspace-tenant-config", digest, managedDirectories: [], files })}\n`);
  return { root, resourceManifestFile, tenantManifestFile, lifecycleRoot, lifecycleSourceRoot };
}

function create(fixtureValue) {
  return createControlPlaneReceipt({
    target: "production",
    sourceSha: "a".repeat(40),
    sourceTree: "b".repeat(40),
    migrationSetSha256: "c".repeat(64),
    ...fixtureValue,
    completedAt: "2026-07-25T00:00:00.000Z",
  });
}

test("receipt binds the exact lifecycle inputs and ordered passed operations", () => {
  const files = fixture();
  const receipt = create(files);
  assert.equal(receipt.inputs.migrationSetSha256, "c".repeat(64));
  assert.equal(receipt.inputs.lifecycleToolSetSha256, digestLifecycleToolSet(files.lifecycleRoot));
  assert.equal(digestLifecycleSourceToolSet(files.lifecycleSourceRoot), digestLifecycleToolSet(files.lifecycleRoot));
  assert.equal(receipt.operations.at(0)?.id, "tenant-config-verified");
  assert.equal(receipt.operations.at(-1)?.id, "database-runtime-parity");
  assert.throws(
    () => normalizeControlPlaneReceipt({ ...receipt, operations: [...receipt.operations].reverse() }),
    /exact ordered passed set/,
  );
});

test("application assertion rejects stale migrations, resources, or tenant config", () => {
  const files = fixture();
  const receiptFile = path.join(files.root, "control-plane-release.json");
  writeControlPlaneReceipt(receiptFile, create(files));
  assert.equal(assertControlPlaneReceipt({
    file: receiptFile,
    target: "production",
    migrationSetSha256: "c".repeat(64),
    ...files,
  }).target, "production");

  writeFileSync(files.resourceManifestFile, "{\"resources\":[\"drift\"]}\n");
  assert.throws(() => assertControlPlaneReceipt({
    file: receiptFile,
    target: "production",
    migrationSetSha256: "c".repeat(64),
    ...files,
  }), /resourceManifestSha256 mismatch/);
});

test("receipt write is atomic, private, and readable", () => {
  const files = fixture();
  const receiptFile = path.join(files.root, "control-plane-release.json");
  const receipt = create(files);
  writeControlPlaneReceipt(receiptFile, receipt);
  assert.deepEqual(readControlPlaneReceipt(receiptFile), receipt);
  assert.equal(statSync(receiptFile).mode & 0o777, 0o600);
  assert.equal(readFileSync(receiptFile, "utf8").endsWith("\n"), true);
});
