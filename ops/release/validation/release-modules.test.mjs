import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { captureCandidateIdentity } from "../candidate/identity.mjs";
import {
  createArtifactReceipt,
  createCandidateReceipt,
  createSourceValidationReceipt,
  validateArtifactReceipt,
  validateCandidateReceipt,
  validateSourceValidationReceipt,
} from "../contracts/release-receipt.mjs";
import { diagnoseSlowRelease } from "../diagnostics/slow-flow.mjs";
import { runFullSourceValidation } from "./full-source-validation.mjs";
import { taskGraphDigest, taskReceiptDigest } from "../../../scripts/check/check-task-inputs.mjs";

test("candidate identity is content based and ignores commit metadata", () => {
  const first = captureCandidateIdentity({ repositoryRoot: process.cwd(), revision: "HEAD" });
  const second = captureCandidateIdentity({ repositoryRoot: process.cwd(), revision: "HEAD^{tree}" });
  assert.equal(first.contentDigest, second.contentDigest);
  assert.equal(first.treeId, second.treeId);
});

test("release receipts bind candidate content without a commit or base SHA gate", () => {
  const identity = captureCandidateIdentity({ repositoryRoot: process.cwd(), revision: "HEAD" });
  const candidate = createCandidateReceipt(identity);
  const validation = createSourceValidationReceipt({ ...identity, runner: "local" });
  const artifact = createArtifactReceipt({ ...identity, targetId: "monolith", runner: "local" });
  assert.equal(validateCandidateReceipt(candidate, identity), candidate);
  assert.equal(validateSourceValidationReceipt(validation, identity), validation);
  assert.equal(validateArtifactReceipt(artifact, { ...identity, targetId: "monolith" }), artifact);
  assert.equal(Object.hasOwn(candidate, "sourceSha"), false);
  assert.equal(Object.hasOwn(validation, "baseSha"), false);
  assert.equal(Object.hasOwn(artifact, "baseSha"), false);
});

test("full source validation binds a frozen task graph and is one-shot per Plan", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "release-validation-"));
  const resultFile = path.join(directory, "result.json");
  const taskGraphFile = path.join(directory, "task-graph.json");
  const contentDigest = "a".repeat(64);
  const planId = "plan-fixture";
  const descriptor = (taskKey) => ({
    taskKey,
    taskContractVersion: 2,
    inputDigest: taskKey === "reused" ? "1".repeat(64) : "2".repeat(64),
    commandDigest: "3".repeat(64),
    runtimeDigest: "4".repeat(64),
  });
  const writeReceipt = (task, sourcePlanId) => {
    const unsigned = {
      schemaVersion: 2,
      kind: "workspace-check-task-receipt",
      ...task,
      status: "passed",
      sourcePlanId,
      durationMs: 10,
      completedAt: new Date(1_000).toISOString(),
    };
    const file = path.join(directory, ".cache/check-results", task.taskKey, `${task.inputDigest}.json`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ ...unsigned, receiptDigest: taskReceiptDigest(unsigned) }));
    return taskReceiptDigest(unsigned);
  };
  const writeGraph = (sourcePlanId, { includeReceipts = true } = {}) => {
    const reused = descriptor("reused");
    const pending = descriptor("pending");
    const reusedReceiptDigest = includeReceipts ? writeReceipt(reused, "plan-history") : null;
    if (includeReceipts) writeReceipt(pending, sourcePlanId);
    const unsigned = {
      schemaVersion: 1,
      kind: "workspace-check-task-graph",
      sourcePlanId,
      mode: "standard",
      tasks: [
        { ...reused, status: "reused", sourcePlanId: "plan-history", receiptDigest: reusedReceiptDigest },
        { ...pending, status: "pending" },
      ],
    };
    writeFileSync(taskGraphFile, JSON.stringify({ ...unsigned, graphDigest: taskGraphDigest(unsigned) }));
  };
  let executions = 0;
  let executionOptions;
  const execute = (_command, _args, options) => {
    executions += 1;
    executionOptions = options;
    writeGraph(planId);
    return { status: 0, signal: null, error: null };
  };
  const first = runFullSourceValidation({ cwd: directory, contentDigest, planId, taskGraphFile, resultFile, execute, now: () => 1_000 });
  assert.equal(first.status, "passed");
  assert.equal(first.sourcePlanId, planId);
  assert.equal(first.taskCounts.reused, 1);
  assert.equal(first.taskCounts.pending, 1);
  assert.equal(executions, 1);
  assert.equal(executionOptions.env.CHECK_SUITE_COLLECT_FAILURES, "1");
  assert.equal(executionOptions.env.CHECK_SOURCE_PLAN_ID, planId);
  assert.equal(executionOptions.env.CHECK_TASK_GRAPH_FILE, taskGraphFile);
  assert.throws(
    () => runFullSourceValidation({ cwd: directory, contentDigest, planId, taskGraphFile, resultFile, execute }),
    /already consumed/,
  );

  const failedFile = path.join(directory, "failed.json");
  writeGraph("plan-failed", { includeReceipts: false });
  runFullSourceValidation({
    contentDigest,
    planId: "plan-failed",
    taskGraphFile,
    resultFile: failedFile,
    execute: () => ({ status: 2, signal: null, error: null }), cwd: directory,
    now: () => 3_000,
  });
  assert.throws(
    () => runFullSourceValidation({ cwd: directory, contentDigest, planId: "plan-failed", taskGraphFile, resultFile: failedFile, execute }),
    /already consumed/,
  );
});

test("slow release thresholds only diagnose and never block", () => {
  const report = diagnoseSlowRelease([
    { stage: "full-source-ci", durationMs: 901_000 },
    { stage: "full-source-ci", durationMs: 10 },
    { stage: "artifact-cache", durationMs: 5, cache: "miss" },
    { stage: "artifact-cache", durationMs: 5, cache: "miss" },
  ]);
  assert.equal(report.blocking, false);
  assert.deepEqual(report.diagnostics.map((item) => item.code).sort(), [
    "repeated-cache-miss",
    "repeated-expensive-stage",
    "slow-stage",
  ]);
});
