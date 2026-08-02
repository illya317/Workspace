import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { recordDeployedBaseline } from "./deployed-baseline.mjs";

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonicalize(entry)]));
};
const digestReceipt = (receipt) => createHash("sha256")
  .update(JSON.stringify(canonicalize({ ...receipt, receiptDigest: null })))
  .digest("hex");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deployed-baseline-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = {
    commit: "a".repeat(40),
    tree: "b".repeat(40),
    contentDigest: "c".repeat(64),
  };
  const deploy = {
    schema: "workspace.deploy-attempt/v1",
    kind: "workspace-deploy-attempt",
    attemptId: "deploy-proof",
    target: "news",
    targetMode: "shadow",
    source,
    controller: { commit: "d".repeat(40), tree: "e".repeat(40), digest: "f".repeat(64) },
    command: { id: "deploy-production-v1", digest: "1".repeat(64) },
    status: "succeeded",
    exitCode: 0,
    startedAt: "2026-08-02T00:00:00.000Z",
    completedAt: "2026-08-02T00:00:01.000Z",
    durationMs: 1000,
    evidence: [],
    failure: null,
    receiptDigest: null,
  };
  deploy.receiptDigest = digestReceipt(deploy);
  const ready = {
    schemaVersion: 1,
    kind: "workspace-ready-artifact",
    status: "ready",
    runId: "ci-20260802T000000Z-aaaaaaaaaaaa-bbbbbbbb",
    target: { id: "news", mode: "shadow" },
    source: { commitSha: source.commit, treeId: source.tree, contentDigest: source.contentDigest },
  };
  const deployAttemptFile = path.join(root, "deploy.json");
  const readyFile = path.join(root, "ready.json");
  fs.writeFileSync(deployAttemptFile, JSON.stringify(deploy));
  fs.writeFileSync(readyFile, JSON.stringify(ready));
  return { root, deploy, deployAttemptFile, readyFile };
}

test("records only a successful deploy as the next release acceleration baseline", (t) => {
  const value = fixture(t);
  const baselineRoot = path.join(value.root, "baselines");
  const receipt = recordDeployedBaseline({
    root: baselineRoot,
    deployAttemptFile: value.deployAttemptFile,
    readyFile: value.readyFile,
    now: () => "2026-08-02T00:00:02.000Z",
  });
  assert.equal(receipt.source.commitSha, value.deploy.source.commit);
  assert.equal(receipt.deployAttempt.id, "deploy-proof");
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(baselineRoot, "news/shadow/current.json"), "utf8")),
    receipt,
  );
});

test("failed deploys and mismatched Ready receipts cannot advance the baseline", async (t) => {
  await t.test("failed deploy", (subtest) => {
    const value = fixture(subtest);
    const deploy = JSON.parse(fs.readFileSync(value.deployAttemptFile, "utf8"));
    deploy.status = "failed";
    deploy.exitCode = 1;
    deploy.receiptDigest = digestReceipt(deploy);
    fs.writeFileSync(value.deployAttemptFile, JSON.stringify(deploy));
    assert.throws(() => recordDeployedBaseline({
      root: path.join(value.root, "baselines"),
      deployAttemptFile: value.deployAttemptFile,
      readyFile: value.readyFile,
    }), /successful deploy attempt receipt is invalid/);
  });
  await t.test("different Ready", (subtest) => {
    const value = fixture(subtest);
    const ready = JSON.parse(fs.readFileSync(value.readyFile, "utf8"));
    ready.source.commitSha = "9".repeat(40);
    fs.writeFileSync(value.readyFile, JSON.stringify(ready));
    assert.throws(() => recordDeployedBaseline({
      root: path.join(value.root, "baselines"),
      deployAttemptFile: value.deployAttemptFile,
      readyFile: value.readyFile,
    }), /do not identify the same baseline/);
  });
});
