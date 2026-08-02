import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createReleaseExecutionPlan } from "./release-execution-plan.mjs";

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonicalize(entry)]));
};
const digest = (value) => createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");

function commit(root, message) {
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", message], { cwd: root });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-execution-plan-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  fs.mkdirSync(path.join(root, "app/(modules)/news"), { recursive: true });
  fs.writeFileSync(path.join(root, ".gitignore"), ".cache/\n");
  fs.writeFileSync(path.join(root, "app/(modules)/news/page.tsx"), "baseline\n");
  const baseline = commit(root, "baseline");
  const baselineRoot = path.join(root, ".cache/release-baselines");
  const receipt = {
    schemaVersion: 1,
    kind: "workspace-deployed-release-baseline",
    target: { id: "news", mode: "shadow" },
    source: { commitSha: baseline, treeId: "a".repeat(40), contentDigest: "b".repeat(64) },
    deployAttempt: { id: "deploy-baseline", receiptDigest: "c".repeat(64) },
    ready: { runId: "ci-baseline", receiptDigest: "d".repeat(64) },
    deployedAt: "2026-08-02T00:00:00.000Z",
    recordedAt: "2026-08-02T00:00:01.000Z",
  };
  fs.mkdirSync(path.join(baselineRoot, "news/shadow"), { recursive: true });
  fs.writeFileSync(path.join(baselineRoot, "news/shadow/current.json"), JSON.stringify({
    ...receipt,
    receiptDigest: digest(receipt),
  }));
  const graph = { units: [{ id: "news", privateSourceRoots: ["app/(modules)/news/"] }] };
  return { root, baselineRoot, baseline, graph };
}

test("a private unit delta is the only plan allowed to parallelize source and artifact", (t) => {
  const value = fixture(t);
  fs.writeFileSync(path.join(value.root, "app/(modules)/news/page.tsx"), "copy changed\n");
  const source = commit(value.root, "copy");
  const plan = createReleaseExecutionPlan({
    repository: value.root, baselineRoot: value.baselineRoot, source,
    target: "news", targetMode: "shadow", graph: value.graph,
  });
  assert.equal(plan.sourceArtifactStrategy, "parallel");
  assert.equal(plan.reason, "private-unit-delta");
  assert.deepEqual(plan.changedFiles, ["app/(modules)/news/page.tsx"]);
  assert.deepEqual(plan.controllerChangedFiles, []);
});

test("controller-only drift is audited without downgrading a private unit delta", (t) => {
  const value = fixture(t);
  fs.mkdirSync(path.join(value.root, "ops"), { recursive: true });
  fs.writeFileSync(path.join(value.root, "ops/publish.sh"), "controller changed\n");
  fs.writeFileSync(path.join(value.root, "app/(modules)/news/page.tsx"), "copy changed\n");
  const source = commit(value.root, "controller and copy");
  const plan = createReleaseExecutionPlan({ repository: value.root, baselineRoot: value.baselineRoot, source, target: "news", targetMode: "shadow", graph: value.graph });
  assert.equal(plan.sourceArtifactStrategy, "parallel");
  assert.deepEqual(plan.changedFiles, ["app/(modules)/news/page.tsx"]);
  assert.deepEqual(plan.controllerChangedFiles, ["ops/publish.sh"]);
});

test("shared changes, missing baseline, and monolith remain serial", async (t) => {
  await t.test("shared", (subtest) => {
    const value = fixture(subtest);
    fs.mkdirSync(path.join(value.root, "packages/platform"), { recursive: true });
    fs.writeFileSync(path.join(value.root, "packages/platform/shared.ts"), "shared\n");
    const source = commit(value.root, "shared");
    const plan = createReleaseExecutionPlan({
      repository: value.root, baselineRoot: value.baselineRoot, source,
      target: "news", targetMode: "shadow", graph: value.graph,
    });
    assert.equal(plan.sourceArtifactStrategy, "serial");
    assert.equal(plan.reason, "shared-or-unknown-delta");
  });
  await t.test("missing baseline", (subtest) => {
    const value = fixture(subtest);
    const source = value.baseline;
    const plan = createReleaseExecutionPlan({
      repository: value.root, baselineRoot: path.join(value.root, "missing-baseline"), source,
      target: "news", targetMode: "shadow", graph: value.graph,
    });
    assert.equal(plan.sourceArtifactStrategy, "serial");
    assert.equal(plan.reason, "deployed-baseline-missing");
  });
  await t.test("monolith", (subtest) => {
    const value = fixture(subtest);
    const plan = createReleaseExecutionPlan({
      repository: value.root, baselineRoot: value.baselineRoot, source: value.baseline,
      target: "monolith", targetMode: "activate", graph: value.graph,
    });
    assert.equal(plan.sourceArtifactStrategy, "serial");
    assert.equal(plan.reason, "monolith-resource-boundary");
  });
});
