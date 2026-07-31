import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { migrationSetSha256, sha256File, verifyArtifactManifest } from "./verify-artifact-manifest.mjs";

const TREE_ID = "2".repeat(40);
const CONTENT_DIGEST = "3".repeat(64);

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-artifact-manifest-"));
  fs.mkdirSync(path.join(root, "prisma/migrations/001_init"), { recursive: true });
  fs.writeFileSync(path.join(root, "package-lock.json"), '{"lockfileVersion":3}\n');
  fs.writeFileSync(path.join(root, "prisma/migrations/001_init/migration.sql"), "SELECT 1;\n");
  const artifactPath = path.join(root, "workspace-standalone.tgz");
  const manifestPath = path.join(root, "workspace-standalone.manifest.json");
  fs.writeFileSync(artifactPath, "standalone bytes");
  const manifest = {
    schemaVersion: 2,
    source: { commitSha: "1".repeat(40), treeSha: TREE_ID, contentDigest: CONTENT_DIGEST },
    inputs: {
      packageLockSha256: sha256File(path.join(root, "package-lock.json")),
      migrationSetSha256: migrationSetSha256(root),
    },
    artifact: {
      fileName: path.basename(artifactPath),
      sha256: sha256File(artifactPath),
      sizeBytes: fs.statSync(artifactPath).size,
    },
    build: { buildId: CONTENT_DIGEST, githubEventName: null, githubRunId: null, githubRunAttempt: null },
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  return { root, artifactPath, manifestPath };
}

test("verifies artifact by candidate content rather than commit SHA", (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  const result = verifyArtifactManifest({
    repositoryRoot: value.root,
    artifactPath: value.artifactPath,
    manifestPath: value.manifestPath,
    expectedTreeId: TREE_ID,
    expectedContentDigest: CONTENT_DIGEST,
  });
  assert.equal(result.contentDigest, CONTENT_DIGEST);
});

test("rejects tampered artifact bytes and a different content digest", (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  fs.appendFileSync(value.artifactPath, "tamper");
  assert.throws(() => verifyArtifactManifest({
    repositoryRoot: value.root,
    artifactPath: value.artifactPath,
    manifestPath: value.manifestPath,
    expectedTreeId: TREE_ID,
    expectedContentDigest: CONTENT_DIGEST,
  }), /artifact SHA-256/);
});
