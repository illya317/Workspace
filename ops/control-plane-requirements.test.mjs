import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createControlPlaneRequirements,
  digestMigrationSet,
  readControlPlaneRequirements,
  writeControlPlaneRequirements,
} from "./control-plane-requirements.mjs";

const lifecycleSourceFiles = [
  "node_modules/prisma/package.json",
  "ops/prisma-genesis-cutover.mjs",
  "scripts/check/check-permission-action-grants.mjs",
  "scripts/check/check-prisma-deploy-status.js",
  "scripts/ci/check-migration-policy.mjs",
  "scripts/lib/agent-workforce-specs.mjs",
  "scripts/migrate/sqlite-to-postgresql.mjs",
  "scripts/provision-agent-workforce.mjs",
  "scripts/seed-resources-runtime.mjs",
];

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-control-plane-requirements-"));
  for (const relativePath of lifecycleSourceFiles) {
    const file = path.join(root, relativePath);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${relativePath}\n`);
  }
  mkdirSync(path.join(root, "prisma", "migrations", "20260101000000_one"), { recursive: true });
  writeFileSync(path.join(root, "prisma", "migrations", "migration_lock.toml"), "provider = \"postgresql\"\n");
  writeFileSync(path.join(root, "prisma", "migrations", "20260101000000_one", "migration.sql"), "SELECT 1;\n");
  const resourceManifestFile = path.join(root, "resource-defs.json");
  writeFileSync(resourceManifestFile, "{\"resources\":[]}\n");
  return { root, resourceManifestFile };
}

test("requirements bind exact source migration, resource, and lifecycle inputs", () => {
  const files = fixture();
  const requirements = createControlPlaneRequirements({
    repositoryRoot: files.root,
    resourceManifestFile: files.resourceManifestFile,
    sourceSha: "a".repeat(40),
    sourceTree: "b".repeat(40),
    createdAt: "2026-07-25T00:00:00.000Z",
  });
  assert.equal(requirements.inputs.migrationSetSha256, digestMigrationSet(files.root));
  assert.equal(Object.keys(requirements.inputs).length, 3);
  writeFileSync(path.join(files.root, "prisma", "migrations", "20260101000000_one", "migration.sql"), "SELECT 2;\n");
  assert.notEqual(digestMigrationSet(files.root), requirements.inputs.migrationSetSha256);
});

test("requirements write is atomic, private, and readable", () => {
  const files = fixture();
  const requirements = createControlPlaneRequirements({
    repositoryRoot: files.root,
    resourceManifestFile: files.resourceManifestFile,
    sourceSha: "a".repeat(40),
    sourceTree: "b".repeat(40),
    createdAt: "2026-07-25T00:00:00.000Z",
  });
  const output = path.join(files.root, "nested", "requirements.json");
  writeControlPlaneRequirements(output, requirements);
  assert.deepEqual(readControlPlaneRequirements(output), requirements);
  assert.equal(statSync(output).mode & 0o777, 0o600);
  assert.equal(readFileSync(output, "utf8").endsWith("\n"), true);
});
