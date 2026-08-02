import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildUnitDeployBindings, verifyUnitProductionSemanticSnapshot } from "./unit-preflight.mjs";
import { recordDeployPreflightEvidence, verifyDeployPreflightReady } from "./preflight.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const sha = (value) => value.repeat(40);
const digest = (value) => value.repeat(64);
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);

async function fixture(context) {
  const root = await mkdtemp(join(tmpdir(), "workspace-unit-preflight-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const artifactFile = join(root, "artifact.tgz");
  const manifestFile = join(root, "manifest.json");
  const metadataFile = join(root, "metadata.json");
  const deployGraphFile = join(root, "graph.json");
  const deployToolBundleManifest = join(root, "bundle.json");
  const snapshotFile = join(root, "snapshot.json");
  await writeFile(artifactFile, "artifact");
  const manifest = { unit: { id: "finance" }, build: { buildId: "next-build", deploymentId: "finance-v1" } };
  await writeFile(manifestFile, JSON.stringify(manifest));
  const ready = {
    status: "ready", runId: "ci-unit", source: { commitSha: sha("1"), treeId: sha("2"), contentDigest: digest("a") },
    configurationDigest: digest("b"), target: { id: "finance", mode: "activate" },
    artifact: { sha256: hash("artifact"), manifestSha256: hash(JSON.stringify(manifest)) },
  };
  const controllerReady = { receiptDigest: digest("c"), controller: { sourceSha: sha("3"), treeId: sha("4"), controlDigest: digest("d") } };
  await writeFile(metadataFile, JSON.stringify({ releaseReady: ready, controllerReady }));
  await writeFile(deployGraphFile, "graph");
  await writeFile(deployToolBundleManifest, "bundle");
  const body = {
    schema: "workspace.unit-production-semantic-snapshot/v1", currentTargetDigest: digest("e"),
    deployedReceiptDigest: digest("f"), gatewayManifestDigest: digest("1"),
    tenantManifestDigest: digest("2"), unitId: "finance", unitStateDigest: digest("3"),
  };
  await writeFile(snapshotFile, JSON.stringify({ ...body, semanticDigest: hash(canonical(body)) }));
  return {
    root, artifactFile, manifestFile, metadataFile, deployGraphFile, deployToolBundleManifest, snapshotFile,
    sourceSha: ready.source.commitSha, sourceTree: ready.source.treeId, contentDigest: ready.source.contentDigest,
    unitId: "finance", mode: "activate", operation: "deploy", executionMode: "local",
    serverIdentityDigest: digest("4"), remoteRootDigest: digest("5"),
  };
}

test("strict Unit bindings cover exact Ready, controller, inputs, and semantic snapshot", async (context) => {
  const input = await fixture(context);
  const bindings = await buildUnitDeployBindings(input, { strict: true });
  assert.equal(bindings.candidate.summary.artifact.buildId, "next-build");
  assert.equal(bindings.candidate.summary.artifact.deploymentId, "finance-v1");
  assert.equal(bindings.deployInput.summary.target, "finance");
  assert.equal(bindings.productionSnapshot.summary.semanticDigest,
    verifyUnitProductionSemanticSnapshot(JSON.parse(await readFile(input.snapshotFile, "utf8"))).semanticDigest);
  await writeFile(input.artifactFile, "drift");
  await assert.rejects(buildUnitDeployBindings(input, { strict: true }), /Application Ready inputs drifted/);
});

test("external Unit evidence signs failed attempt only and passed Ready verifies", async (context) => {
  const input = await fixture(context);
  const bindings = await buildUnitDeployBindings(input, { strict: true });
  const evidenceRoot = join(input.root, "evidence");
  const logs = join(evidenceRoot, "logs");
  await mkdir(logs, { recursive: true, mode: 0o700 });
  const failedLog = join(logs, "failed.log");
  await writeFile(failedLog, "status=failed check=input.local\n", { mode: 0o600 });
  await chmod(failedLog, 0o600);
  const failed = await recordDeployPreflightEvidence({
    root: evidenceRoot, attemptId: "unit-failed", bindings,
    checks: [{ key: "input.local", commandId: "unit-input-v1", inputDigest: digest("6"), status: "failed", exitCode: 1, dependencies: [], log: failedLog }],
  });
  assert.equal(failed.readyFile, null);
  assert.equal(JSON.parse(await readFile(failed.attemptFile, "utf8")).status, "failed");

  const passedLog = join(logs, "passed.log");
  await writeFile(passedLog, "status=passed check=input.local\n", { mode: 0o600 });
  await chmod(passedLog, 0o600);
  const passed = await recordDeployPreflightEvidence({
    root: evidenceRoot, attemptId: "unit-passed", bindings,
    checks: [{ key: "input.local", commandId: "unit-input-v1", inputDigest: digest("7"), status: "passed", exitCode: 0, dependencies: [], log: passedLog }],
  });
  const ready = await verifyDeployPreflightReady({ file: passed.readyFile, attemptFile: passed.attemptFile });
  assert.equal(ready.status, "ready");
});
