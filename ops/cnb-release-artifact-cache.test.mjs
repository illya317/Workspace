import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
      CNB_RELEASE_ARTIFACT_RECEIPT_FILE: paths.receipt,
    },
  });
}

test("CNB artifact cache restores only exact candidate content and verified bytes", () => {
  const runtimeTmp = path.join(repositoryRoot, ".cache/runtime-tmp");
  mkdirSync(runtimeTmp, { recursive: true });
  const root = mkdtempSync(path.join(runtimeTmp, "workspace-cnb-artifact-cache-"));
  const paths = {
    cache: path.join(root, "cache"),
    marker: path.join(root, "cache-hit"),
    artifact: path.join(root, "workspace-standalone.tgz"),
    manifest: path.join(root, "workspace-standalone.manifest.json"),
    receipt: path.join(root, "release-validation.json"),
    graph: path.join(root, "deploy-graph.json"),
  };
  const relativePaths = Object.fromEntries(
    Object.entries(paths).map(([key, value]) => [key, path.relative(repositoryRoot, value)]),
  );
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
      schemaVersion: 1,
      kind: "workspace-release-artifact",
      status: "built",
      command: "ops/publish.sh ci",
      runner: "local",
      treeId: sourceTree,
      contentDigest,
      targetId: "monolith",
      checks: [
        "artifact-compile-or-exact-cache-restore",
        "artifact-content-identity",
      ],
      completedAt: "2026-07-30T00:00:00.000Z",
    })}\n`);
    const stored = run("store", relativePaths);
    assert.equal(stored.status, 0, stored.stderr);
    rmSync(paths.artifact);
    rmSync(paths.manifest);
    rmSync(paths.receipt);
    rmSync(paths.graph);
    const restored = run("restore", relativePaths);
    assert.equal(restored.status, 0, restored.stderr);
    assert.equal(readFileSync(paths.artifact, "utf8"), "verified immutable artifact");
    assert.ok(statSync(paths.marker).isFile());

    writeFileSync(paths.artifact, "corrupt");
    const cacheArtifact = path.join(paths.cache, "monolith", contentDigest, "workspace-standalone.tgz");
    writeFileSync(cacheArtifact, "corrupt");
    const rejected = run("restore", relativePaths);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stdout, /cache miss/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
