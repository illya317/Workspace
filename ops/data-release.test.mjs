import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadManifests, validateManifest, validateReceipt } from "./data-release.mjs";

function fixture(root) {
  mkdirSync(path.join(root, "prisma/migrations/20260725013000_fixture"), { recursive: true });
  writeFileSync(path.join(root, "prisma/migrations/20260725013000_fixture/migration.sql"), "-- workspace:migration-mode=expand\nSELECT 1;\n");
  mkdirSync(path.join(root, "scripts/data"), { recursive: true });
  writeFileSync(path.join(root, "scripts/data/fixture.mjs"), "export {};\n");
  return {
    schemaVersion: 1,
    id: "2026-07-25-fixture-v1",
    title: "Fixture",
    description: "Fixture data release",
    mode: "maintenance",
    requiredForProduction: true,
    sourceCompleteness: "complete",
    requiredMigrations: ["20260725013000_fixture"],
    operations: [{ id: "fixture", description: "fixture", script: "scripts/data/fixture.mjs", args: ["{sourceRoot}/source.xlsx"], sourceIds: ["source"] }],
    sources: [{ id: "source", label: "source", locationHint: "private:source.xlsx", stagedPath: "source.xlsx", sha256: "a".repeat(64) }],
    checks: [{ id: "count", sql: "SELECT count(*)::text FROM fixture", expected: "1" }],
  };
}

test("data release manifests bind migrations, scripts, sources and read-only checks", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-data-release-"));
  const manifest = fixture(root);
  assert.equal(validateManifest(manifest, { repositoryRoot: root }).id, manifest.id);
  assert.throws(() => validateManifest({ ...manifest, checks: [{ ...manifest.checks[0], sql: "DELETE FROM fixture" }] }, { repositoryRoot: root }), /SELECT\/CTE/);
});

test("data release receipt cannot cross target or manifest revision", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-data-release-"));
  const directory = path.join(root, "ops/data-releases");
  mkdirSync(directory, { recursive: true });
  const manifest = fixture(root);
  writeFileSync(path.join(directory, `${manifest.id}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  const [loaded] = loadManifests({ manifestDir: directory, repositoryRoot: root });
  const receipt = { schemaVersion: 1, kind: "workspace-data-release-receipt", releaseId: loaded.id, manifestSha256: loaded.manifestSha256, target: "local", appliedAt: "2026-07-25T00:00:00.000Z", checks: [{ id: "count", actual: "1" }] };
  assert.equal(validateReceipt(receipt, loaded, "local"), receipt);
  assert.throws(() => validateReceipt(receipt, loaded, "production"), /target/);
  assert.throws(() => validateReceipt({ ...receipt, manifestSha256: "b".repeat(64) }, loaded, "local"), /another manifest revision/);
});

test("production cannot accept a manifest with incomplete canonical sources", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-data-release-"));
  const manifest = fixture(root);
  assert.equal(validateManifest({ ...manifest, sourceCompleteness: "incomplete" }, { repositoryRoot: root }).sourceCompleteness, "incomplete");
  assert.throws(() => validateManifest({ ...manifest, sourceCompleteness: "unknown" }, { repositoryRoot: root }), /sourceCompleteness/);
});

test("production deploy is independent from private data releases", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const deploy = readFileSync(path.join(root, "ops/deploy.sh"), "utf8");
  const build = readFileSync(path.join(root, "ops/build-standalone-artifact.sh"), "utf8");
  const publish = readFileSync(path.join(root, "ops/publish-cnb.sh"), "utf8");
  assert.doesNotMatch(deploy, /data-release\.mjs|apply-data-release\.mjs|data-release-gate/);
  assert.match(build, /copy_data_release_files/);
  assert.match(build, /apply-data-release\.mjs/);
  assert.match(build, /data-release-transfer\.mjs/);
  assert.doesNotMatch(build, /cp -R ops\/data-releases/);
  assert.doesNotMatch(publish, /data:release:check|--data-release/);
});
