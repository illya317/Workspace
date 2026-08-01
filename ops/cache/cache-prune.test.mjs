import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadCachePolicy } from "./cache-policy.mjs";
import { assertBuildSpace, pinDeployedArtifact, pruneCaches, readArtifactPins } from "./cache-prune.mjs";

function fixture() {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-cache-policy-"));
  const policy = loadCachePolicy({ env: {} });
  return { repositoryRoot, policy };
}

function writeOld(file, now, ageMs, content = "fixture") {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  const date = new Date(now - ageMs);
  fs.utimesSync(file, date, date);
}

test("prune applies class retention without traversing outside governed roots", () => {
  const { repositoryRoot, policy } = fixture();
  const now = Date.now();
  const oldReceipt = path.join(repositoryRoot, ".cache/release-check-results/task/input.json");
  const currentReceipt = path.join(repositoryRoot, ".cache/release-check-results/task/current.json");
  writeOld(oldReceipt, now, 31 * 24 * 60 * 60 * 1000);
  writeOld(currentReceipt, now, 1_000);
  const report = pruneCaches({
    repositoryRoot,
    policy,
    now: () => now,
    statfs: () => ({ blocks: 100n, bavail: 50n }),
  });
  assert.equal(fs.existsSync(oldReceipt), false);
  assert.equal(fs.existsSync(currentReceipt), true);
  assert.equal(report.removed.some((entry) => entry.reason === "retention"), true);
});

test("deployed artifact pins rotate production and rollback and survive pruning", () => {
  const { repositoryRoot, policy } = fixture();
  const now = Date.now();
  const digests = ["a".repeat(64), "b".repeat(64), "c".repeat(64)];
  for (const digest of digests) {
    const artifact = path.join(repositoryRoot, `.cache/release-artifacts/monolith/${digest}/artifact.tgz`);
    writeOld(artifact, now, 72 * 60 * 60 * 1000);
    const directory = path.dirname(artifact);
    const date = new Date(now - 72 * 60 * 60 * 1000);
    fs.utimesSync(directory, date, date);
  }
  pinDeployedArtifact({ repositoryRoot, policy, targetId: "monolith", contentDigest: digests[0] });
  pinDeployedArtifact({ repositoryRoot, policy, targetId: "monolith", contentDigest: digests[1] });
  const pins = readArtifactPins(repositoryRoot, policy).targets.monolith;
  assert.equal(pins.production, digests[1]);
  assert.equal(pins.rollback, digests[0]);
  pruneCaches({ repositoryRoot, policy, now: () => now, statfs: () => ({ blocks: 100n, bavail: 50n }) });
  assert.equal(fs.existsSync(path.join(repositoryRoot, `.cache/release-artifacts/monolith/${digests[0]}`)), true);
  assert.equal(fs.existsSync(path.join(repositoryRoot, `.cache/release-artifacts/monolith/${digests[1]}`)), true);
  assert.equal(fs.existsSync(path.join(repositoryRoot, `.cache/release-artifacts/monolith/${digests[2]}`)), false);
});

test("build space guard fails only after policy pruning cannot lower the disk watermark", () => {
  const { repositoryRoot, policy } = fixture();
  assert.throws(
    () => assertBuildSpace({ repositoryRoot, policy, statfs: () => ({ blocks: 100n, bavail: 10n }) }),
    /stop-build watermark/,
  );
});

test("prune retains and reports inaccessible cache paths without blocking prepare", () => {
  const { repositoryRoot, policy } = fixture();
  const inaccessible = path.join(repositoryRoot, ".local-release-worktrees/probe");
  fs.mkdirSync(inaccessible, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(inaccessible, "evidence"), "fixture");
  fs.chmodSync(inaccessible, 0o000);
  try {
    const report = pruneCaches({
      repositoryRoot,
      policy,
      statfs: () => ({ blocks: 100n, bavail: 50n }),
    });
    assert.equal(report.removed.some((entry) => entry.path.includes("probe")), false);
    assert.equal(report.issues.some((issue) => issue.path.includes("probe") && issue.code === "EACCES"), true);
  } finally {
    fs.chmodSync(inaccessible, 0o700);
    fs.rmSync(repositoryRoot, { recursive: true, force: true });
  }
});
