import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  assertDeployUnitArchiveBuildIdentity,
  deployUnitRuntimeVersion,
  normalizeDeployUnitBuildIdentity,
} from "./deploy-unit-build-identity.mjs";
import { normalizeRuntimeTree } from "../artifact/runtime-tree-permissions.mjs";
import { inspectArchive } from "../readiness/artifact-inspection.mjs";
import {
  artifactRehearsalExpectation,
  validateArtifactRehearsal,
} from "../readiness/rehearse-artifact.mjs";

const build = { buildId: "build-TfctsWXpff2fKS", deploymentId: "news-36b3ffa73f17" };

function archiveFixture(t, buildId = build.buildId, normalized = true) {
  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-unit-build-identity-"));
  const root = path.join(workRoot, "root");
  fs.mkdirSync(root);
  t.after(() => fs.rmSync(workRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, ".next"));
  fs.writeFileSync(path.join(root, ".server-entry"), "server.js\n");
  fs.writeFileSync(path.join(root, "server.js"), "'use strict';\n");
  fs.writeFileSync(path.join(root, ".next/BUILD_ID"), `${buildId}\n`);
  fs.writeFileSync(path.join(root, ".next/routes-manifest.json"), '{"basePath":"/workspace"}\n');
  fs.writeFileSync(path.join(root, ".deploy-unit-contract.json"), "{}\n");
  fs.writeFileSync(path.join(root, ".control-plane-requirements.json"), "{}\n");
  if (normalized) normalizeRuntimeTree(root);
  else {
    fs.chmodSync(root, 0o700);
    fs.chmodSync(path.join(root, "server.js"), 0o600);
  }
  const artifact = path.join(workRoot, "news.tgz");
  const packed = spawnSync("tar", ["-czf", artifact, "."], { cwd: root, encoding: "utf8" });
  assert.equal(packed.status, 0, packed.stderr);
  return artifact;
}

test("build and deployment identities are independently required", () => {
  assert.deepEqual(normalizeDeployUnitBuildIdentity(build), build);
  assert.deepEqual(assertDeployUnitArchiveBuildIdentity(build, build.buildId), build);
  assert.equal(deployUnitRuntimeVersion(build), build.deploymentId);
  assert.throws(
    () => assertDeployUnitArchiveBuildIdentity(build, "build-other"),
    /archive BUILD_ID differs from manifest build id/,
  );
  assert.throws(() => normalizeDeployUnitBuildIdentity({ ...build, deploymentId: "bad id" }), /deployment id is invalid/);
});

test("static archive inspection accepts exact BUILD_ID and rejects mismatch", (t) => {
  const manifest = { build: { ...build, serverEntry: "server.js" } };
  assert.equal(inspectArchive({ artifact: archiveFixture(t), manifest, target: "news" }).buildId, build.buildId);
  assert.throws(
    () => inspectArchive({ artifact: archiveFixture(t, "build-other"), manifest, target: "news" }),
    /archive BUILD_ID differs from manifest build id/,
  );
  assert.throws(
    () => inspectArchive({ artifact: archiveFixture(t, build.buildId, false), manifest, target: "news" }),
    /directory is not isolated-user traversable|file is not isolated-user readable/,
  );
});

test("rehearsal and runtime version use deploymentId, not Next BUILD_ID", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-unit-rehearsal-identity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const artifact = path.join(root, "news.tgz");
  const manifestFile = path.join(root, "manifest.json");
  fs.writeFileSync(artifact, "artifact\n");
  fs.writeFileSync(manifestFile, JSON.stringify({
    build: { ...build, basePath: "/workspace" },
    runtime: { healthPath: "/api/internal/health", versionPath: "/api/settings/version" },
    artifact: { sha256: createHash("sha256").update(fs.readFileSync(artifact)).digest("hex") },
  }));
  const options = {
    artifact,
    manifest: manifestFile,
    source: "1".repeat(40),
    tree: "2".repeat(40),
    content: "a".repeat(64),
    configuration: "b".repeat(64),
    target: "news",
    targetMode: "shadow",
  };
  const expected = artifactRehearsalExpectation(options);
  assert.equal(expected.runtime.version, build.deploymentId);
  const receipt = { ...expected, completedAt: "2026-08-02T00:00:00.000Z" };
  assert.equal(validateArtifactRehearsal(receipt, options), receipt);
  assert.throws(
    () => validateArtifactRehearsal({ ...receipt, runtime: { ...receipt.runtime, version: build.buildId } }, options),
    /does not match the exact source/,
  );
});
