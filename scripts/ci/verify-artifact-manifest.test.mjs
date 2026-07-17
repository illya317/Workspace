import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  migrationSetSha256,
  sha256File,
  verifyArtifactManifest,
} from "./verify-artifact-manifest.mjs";

const COMMIT_SHA = "1".repeat(40);
const TREE_SHA = "2".repeat(40);

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-artifact-manifest-"));
  fs.mkdirSync(path.join(root, "prisma", "migrations", "001_init"), { recursive: true });
  fs.writeFileSync(path.join(root, "package-lock.json"), '{"lockfileVersion":3}\n');
  fs.writeFileSync(path.join(root, "prisma", "migrations", "migration_lock.toml"), 'provider = "postgresql"\n');
  fs.writeFileSync(path.join(root, "prisma", "migrations", "001_init", "migration.sql"), "SELECT 1;\n");
  const artifactPath = path.join(root, "workspace-standalone.tgz");
  const manifestPath = path.join(root, "workspace-standalone.manifest.json");
  fs.writeFileSync(artifactPath, "standalone bytes");
  const classification = {
    schemaVersion: 1,
    riskClass: "C3",
    e2eMode: "full",
    requiredSuites: [],
    e2eSpecs: [],
  };
  const manifest = {
    schemaVersion: 1,
    source: { commitSha: COMMIT_SHA, treeSha: TREE_SHA },
    inputs: {
      packageLockSha256: sha256File(path.join(root, "package-lock.json")),
      migrationSetSha256: migrationSetSha256(root),
    },
    artifact: {
      fileName: path.basename(artifactPath),
      sha256: sha256File(artifactPath),
      sizeBytes: fs.statSync(artifactPath).size,
    },
    build: {
      githubEventName: "workflow_dispatch",
      githubRunId: "42",
      githubRunAttempt: "2",
      riskClass: "C3",
      e2eMode: "full",
      forceFull: true,
      targetSha: COMMIT_SHA,
      requiredSuites: [],
      e2eSpecs: [],
      classification,
    },
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  return { root, artifactPath, manifestPath, manifest };
}

test("verifies artifact, repository inputs, source, and run identity", (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  const result = verifyArtifactManifest({
    repositoryRoot: value.root,
    artifactPath: value.artifactPath,
    manifestPath: value.manifestPath,
    expectedCommitSha: COMMIT_SHA,
    expectedTreeSha: TREE_SHA,
    expectedEventName: "workflow_dispatch",
    expectedRunId: "42",
    expectedRunAttempt: "2",
  });
  assert.equal(result.artifactSha256, sha256File(value.artifactPath));
  assert.equal(result.forceFull, true);
});

test("rejects a rerun attempt that does not match the selected artifact identity", (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  assert.throws(() => verifyArtifactManifest({
    repositoryRoot: value.root,
    artifactPath: value.artifactPath,
    manifestPath: value.manifestPath,
    expectedCommitSha: COMMIT_SHA,
    expectedRunId: "42",
    expectedRunAttempt: "1",
  }), /run attempt/);
});

test("rejects tampered artifact bytes", (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  fs.appendFileSync(value.artifactPath, "tamper");
  assert.throws(() => verifyArtifactManifest({
    repositoryRoot: value.root,
    artifactPath: value.artifactPath,
    manifestPath: value.manifestPath,
    expectedCommitSha: COMMIT_SHA,
  }), /SHA-256 does not match/);
});

test("rejects inconsistent embedded classification evidence", (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  value.manifest.build.classification.e2eMode = "targeted";
  fs.writeFileSync(value.manifestPath, JSON.stringify(value.manifest));
  assert.throws(() => verifyArtifactManifest({
    repositoryRoot: value.root,
    artifactPath: value.artifactPath,
    manifestPath: value.manifestPath,
    expectedCommitSha: COMMIT_SHA,
  }), /classification fields are inconsistent/);
});

test("rejects npm-shrinkwrap because package-lock is the only attested install input", (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(value.root, "npm-shrinkwrap.json"), '{"lockfileVersion":3}\n');
  assert.throws(() => verifyArtifactManifest({
    repositoryRoot: value.root,
    artifactPath: value.artifactPath,
    manifestPath: value.manifestPath,
    expectedCommitSha: COMMIT_SHA,
  }), /npm-shrinkwrap\.json is forbidden/);
});
