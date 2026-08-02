import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  runArtifactPreflight,
  runExactConfigProbe,
  inspectDependencyBoundary,
  inspectOperationsGrowth,
  inspectToolchain,
  validateArtifactPreflightReceipt,
  writeImmutableArtifactPreflightReceipt,
} from "./artifact-preflight.mjs";

const identity = {
  runId: "ci-20260802T000000Z-aaaaaaaaaaaa-11111111",
  sourceSha: "1".repeat(40),
  treeId: "2".repeat(40),
  contentDigest: "a".repeat(64),
  configurationDigest: "b".repeat(64),
  targetId: "news",
  targetMode: "shadow",
};

test("artifact preflight writes and reuses exact immutable run evidence", (t) => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-preflight-"));
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }));
  const output = path.join(repository, "evidence/result.json");
  let executions = 0;
  const options = {
    repository,
    output,
    ...identity,
    now: () => 1_000,
    verifyCandidateFn: () => ({ clean: true }),
    inspectOperationsGrowthFn: () => ({ checkedFiles: 42, defaultMaxLines: 600, legacyCapCount: 3 }),
    inspectDependencyFn: () => ({ kind: "repository-local", packageLockSha256: "c".repeat(64) }),
    inspectToolchainFn: () => ({
      node: "v24.0.0",
      nodeExecutable: "/node",
      nodeEngine: "24.x",
      nodeVersionFile: "24",
      next: "16.2.6",
      packageLockNext: "16.2.6",
      nextBinary: "/next",
      npm: "10.0.0",
      npmCli: "/npm",
    }),
    configProbeFn: () => {
      executions += 1;
      return {
        targetIdentity: "news",
        output: "standalone",
        appRoot: "apps/news",
        nextConfig: "apps/news/next.config.ts",
        outputFileTracingRoot: repository,
        outputFileTracingRootRelation: "repository",
        turbopackRoot: repository,
        turbopackRootRelation: "repository",
        generatedAppCheck: "exact-unit-passed",
      };
    },
    assertBuildSpaceFn: () => ({ diskUsagePercent: 20, totalBytes: 10, removed: [], issues: [] }),
  };
  const first = runArtifactPreflight(options);
  assert.equal(first.status, "passed");
  assert.equal(first.target.id, "news");
  assert.equal(executions, 1);
  assert.deepEqual(runArtifactPreflight(options), first);
  assert.equal(executions, 1);
  assert.equal(validateArtifactPreflightReceipt(first, identity), first);
  const verify = spawnSync(process.execPath, [
    path.resolve(import.meta.dirname, "artifact-preflight.mjs"), "verify",
    "--file", output, "--repository", "/path/that/must/not/be-read",
    "--run-id", identity.runId, "--source", identity.sourceSha, "--tree", identity.treeId,
    "--content", identity.contentDigest, "--configuration", identity.configurationDigest,
    "--target", identity.targetId, "--target-mode", identity.targetMode,
  ], { encoding: "utf8" });
  assert.equal(verify.status, 0, verify.stderr);
  assert.throws(
    () => validateArtifactPreflightReceipt(first, { ...identity, configurationDigest: "d".repeat(64) }),
    /does not match exact candidate/,
  );
  for (const mutate of [
    (receipt) => { receipt.identityDigest = "0".repeat(64); },
    (receipt) => { receipt.nextConfig.generatedAppCheck = "not-applicable"; },
    (receipt) => { receipt.disk.usagePercent = null; },
  ]) {
    const invalid = structuredClone(first);
    mutate(invalid);
    assert.throws(() => validateArtifactPreflightReceipt(invalid, identity), /does not match exact candidate/);
  }
});

test("artifact preflight receipt path rejects different immutable evidence", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-preflight-receipt-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, "receipt.json");
  writeImmutableArtifactPreflightReceipt(output, { status: "passed", value: 1 });
  writeImmutableArtifactPreflightReceipt(output, { status: "passed", value: 1 });
  assert.throws(
    () => writeImmutableArtifactPreflightReceipt(output, { status: "passed", value: 2 }),
    /different immutable evidence/,
  );
});

test("failed create aggregates every independent finding and cannot be rerun", (t) => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-preflight-failed-"));
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }));
  const output = path.join(repository, "failed.json");
  const calls = [];
  const options = {
    repository,
    output,
    ...identity,
    now: () => 2_000,
    verifyCandidateFn: () => { calls.push("candidate"); throw new Error("candidate drift"); },
    inspectOperationsGrowthFn: () => { calls.push("ops-size"); throw new Error("legacy growth"); },
    configProbeFn: () => { calls.push("config"); return {}; },
    inspectDependencyFn: () => { calls.push("dependency"); return {}; },
    inspectToolchainFn: () => { calls.push("toolchain"); return {}; },
    assertBuildSpaceFn: () => { calls.push("disk"); return {}; },
  };
  assert.throws(
    () => runArtifactPreflight(options),
    /clean-candidate-identity: candidate drift; operations-source-growth: legacy growth/,
  );
  const failed = JSON.parse(fs.readFileSync(output, "utf8"));
  assert.equal(failed.status, "failed");
  assert.deepEqual(calls, ["candidate", "ops-size", "config", "dependency", "toolchain", "disk"]);
  assert.deepEqual(
    failed.findings.filter((finding) => finding.status === "failed").map((finding) => finding.check),
    ["clean-candidate-identity", "operations-source-growth"],
  );
  assert.equal(failed.findings.length, 8);
  assert.throws(() => validateArtifactPreflightReceipt(failed, identity), /does not match exact candidate/);
  assert.throws(() => runArtifactPreflight(options), /already failed/);
});

test("exact unit runner checks only news and loads its real Next config", () => {
  const repository = path.resolve(import.meta.dirname, "../../..");
  const dependency = inspectDependencyBoundary(repository);
  const operationsGrowth = inspectOperationsGrowth(repository);
  const toolchain = inspectToolchain(repository);
  assert.ok(operationsGrowth.checkedFiles > 0);
  assert.equal(operationsGrowth.defaultMaxLines, 450);
  assert.ok(new Set(["repository-local", "trusted-sibling-symlink"]).has(dependency.kind));
  assert.equal(toolchain.nodeEngine, "24.x");
  assert.equal(toolchain.nodeVersionFile, "24");
  assert.equal(toolchain.packageLockNext, toolchain.next);
  const result = runExactConfigProbe(repository, "news");
  assert.equal(result.targetIdentity, "news");
  assert.equal(result.output, "standalone");
  assert.equal(result.generatedAppCheck, "exact-unit-passed");
  assert.equal(result.nextConfig, "apps/news/next.config.ts");
});
