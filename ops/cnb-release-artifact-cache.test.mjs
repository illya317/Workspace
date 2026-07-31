import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const tool = path.join(import.meta.dirname, "cnb-release-artifact-cache.sh");
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
const sourceTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
const contentDigest = createHash("sha256").update(`candidate:${sourceTree}`).digest("hex");

function run(command, paths) {
  return spawnSync("bash", [tool, command], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      RELEASE_SOURCE_SHA: sourceSha,
      RELEASE_SOURCE_TREE: sourceTree,
      RELEASE_CONTENT_DIGEST: contentDigest,
      CNB_RELEASE_ARTIFACT_CACHE_ROOT: paths.cache,
      CNB_RELEASE_ARTIFACT_HIT_MARKER: paths.marker,
      STANDALONE_ARTIFACT_PATH: paths.artifact,
      STANDALONE_MANIFEST_PATH: paths.manifest,
      STANDALONE_DEPLOY_GRAPH_PATH: paths.graph,
      CNB_RELEASE_GATE_RECEIPT_FILE: paths.receipt,
    },
  });
}

test("CNB artifact cache restores only exact candidate content and verified bytes", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "workspace-cnb-artifact-cache-"));
  const paths = {
    cache: path.join(root, "cache"),
    marker: path.join(root, "cache-hit"),
    artifact: path.join(root, "workspace-standalone.tgz"),
    manifest: path.join(root, "workspace-standalone.manifest.json"),
    receipt: path.join(root, "release-validation.json"),
    graph: path.join(root, "deploy-graph.json"),
  };
  try {
    const artifact = Buffer.from("verified immutable artifact");
    writeFileSync(paths.artifact, artifact);
    const graph = execFileSync(process.execPath, [
      "--conditions=react-server",
      "--import", "tsx",
      "scripts/deploy/check-deploy-graph.ts",
      "--json",
    ], { cwd: repositoryRoot });
    writeFileSync(paths.graph, graph);
    const graphDigest = execFileSync(process.execPath, [
      "ops/gateway-generation.mjs",
      "graph-digest",
      "--graph", paths.graph,
    ], { cwd: repositoryRoot, encoding: "utf8" }).trim();
    writeFileSync(paths.manifest, `${JSON.stringify({
      schemaVersion: 2,
      source: { commitSha: sourceSha, treeSha: sourceTree, contentDigest },
      artifact: {
        sha256: createHash("sha256").update(artifact).digest("hex"),
        sizeBytes: artifact.length,
      },
      build: { buildId: contentDigest },
      inputs: { deployGraphSha256: graphDigest },
    })}\n`);
    writeFileSync(paths.receipt, `${JSON.stringify({
      schemaVersion: 3,
      kind: "workspace-release-validation",
      status: "passed",
      command: "ops/publish.sh validate",
      runner: "local",
      treeId: sourceTree,
      contentDigest,
      scope: "full-repository",
      checks: [
        "full-source-ci-once",
        "artifact-compile-once",
        "artifact-content-identity",
      ],
      completedAt: "2026-07-30T00:00:00.000Z",
    })}\n`);
    const stored = run("store", paths);
    assert.equal(stored.status, 0, stored.stderr);
    rmSync(paths.artifact);
    rmSync(paths.manifest);
    rmSync(paths.receipt);
    rmSync(paths.graph);
    const restored = run("restore", paths);
    assert.equal(restored.status, 0, restored.stderr);
    assert.equal(readFileSync(paths.artifact, "utf8"), "verified immutable artifact");
    assert.ok(statSync(paths.marker).isFile());

    writeFileSync(paths.artifact, "corrupt");
    const cacheArtifact = path.join(paths.cache, "monolith", contentDigest, "workspace-standalone.tgz");
    writeFileSync(cacheArtifact, "corrupt");
    const rejected = run("restore", paths);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stdout, /cache miss/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
