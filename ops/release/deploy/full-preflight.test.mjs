import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildFullDeployBindings, verifyProductionSemanticSnapshot } from "./full-preflight.mjs";

const sha = (character) => character.repeat(40);
const digest = (character) => character.repeat(64);
const hash = (value) => createHash("sha256").update(value).digest("hex");
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function fixture(context) {
  const root = await mkdtemp(join(tmpdir(), "workspace-full-preflight-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const artifactFile = join(root, "artifact.tgz");
  const manifestFile = join(root, "manifest.json");
  const metadataFile = join(root, "metadata.json");
  const deployGraphFile = join(root, "graph.json");
  const bundleRoot = join(root, "bundle");
  const deployToolBundleManifest = join(bundleRoot, "deploy-tool-bundle-manifest.json");
  const snapshotFile = join(root, "snapshot.json");
  await mkdir(bundleRoot);
  await writeFile(artifactFile, "exact-artifact");
  const artifactSha = hash("exact-artifact");
  const manifest = { build: { buildId: "next-real-build", deploymentId: "deploy-version" } };
  await writeFile(manifestFile, JSON.stringify(manifest));
  const manifestSha = hash(JSON.stringify(manifest));
  const ready = {
    status: "ready", runId: "ci-20260802T120000Z-example",
    source: { commitSha: sha("1"), treeId: sha("2"), contentDigest: digest("a") },
    configurationDigest: digest("b"), target: { id: "monolith", mode: "activate" },
    artifact: { sha256: artifactSha, manifestSha256: manifestSha },
    runtime: { buildId: "next-real-build" },
  };
  const controllerReady = {
    receiptDigest: digest("c"),
    controller: { sourceSha: sha("3"), treeId: sha("4"), controlDigest: digest("d") },
  };
  await writeFile(metadataFile, JSON.stringify({ releaseReady: ready, controllerReady }));
  await writeFile(deployGraphFile, "exact-graph");
  await writeFile(deployToolBundleManifest, "exact-tool-bundle");
  const snapshotBody = {
    schema: "workspace.production-semantic-snapshot/v1",
    controllerReceiptDigest: digest("e"), currentTargetDigest: digest("f"),
    deployedReceiptDigest: digest("1"), gatewayRouteMapDigest: digest("2"),
    tenantManifestDigest: digest("3"),
  };
  const snapshot = { ...snapshotBody, semanticDigest: hash(canonicalJson(snapshotBody)) };
  await writeFile(snapshotFile, JSON.stringify(snapshot));
  return {
    root, artifactFile, manifestFile, metadataFile, deployGraphFile, deployToolBundleManifest, snapshotFile,
    sourceSha: ready.source.commitSha, sourceTree: ready.source.treeId, contentDigest: ready.source.contentDigest,
    migrationSetDigest: digest("4"), serverIdentityDigest: digest("5"), remoteRootDigest: digest("6"),
    executionMode: "combined", runtimeMode: "hardened",
  };
}

test("strict Full bindings cover exact candidate, controller, deploy inputs, and production snapshot", async (context) => {
  const input = await fixture(context);
  const bindings = await buildFullDeployBindings(input, { strict: true });
  assert.equal(bindings.candidate.summary.artifact.buildId, "next-real-build");
  assert.equal(bindings.candidate.summary.artifact.deploymentId, "deploy-version");
  assert.equal(bindings.controller.summary.deployToolBundleManifestDigest, hash("exact-tool-bundle"));
  assert.equal(bindings.deployInput.summary.deployGraphDigest, hash("exact-graph"));
  assert.equal(bindings.productionSnapshot.summary.semanticDigest,
    verifyProductionSemanticSnapshot(JSON.parse(await readFile(input.snapshotFile, "utf8"))).semanticDigest);

  await writeFile(input.artifactFile, "drifted-artifact");
  await assert.rejects(buildFullDeployBindings(input, { strict: true }), /Application Ready inputs drifted/);
});

test("semantic snapshot comparison material rejects a changed production digest", async (context) => {
  const input = await fixture(context);
  const snapshot = JSON.parse(await readFile(input.snapshotFile, "utf8"));
  assert.equal(verifyProductionSemanticSnapshot(snapshot), snapshot);
  snapshot.currentTargetDigest = digest("9");
  assert.throws(() => verifyProductionSemanticSnapshot(snapshot), /snapshot digest mismatch/);
});

test("backup retention cleanup runs only after successful deployment acceptance", async () => {
  const deploy = await readFile(new URL("../../deploy.sh", import.meta.url), "utf8");
  const controlPlane = deploy.slice(deploy.indexOf('if [ "$DEPLOY_EXECUTION_MODE" = "control-plane-only" ]'), deploy.indexOf("else", deploy.indexOf('if [ "$DEPLOY_EXECUTION_MODE" = "control-plane-only" ]')));
  const application = deploy.slice(deploy.indexOf("else", deploy.indexOf('if [ "$DEPLOY_EXECUTION_MODE" = "control-plane-only" ]')), deploy.lastIndexOf("fi"));
  assert.ok(controlPlane.indexOf("lifecycle.verify") < controlPlane.indexOf("backup.cleanup"));
  assert.ok(application.indexOf("health.final") < application.indexOf("backup.cleanup"));
});
