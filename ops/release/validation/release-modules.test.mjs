import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { captureCandidateIdentity } from "../candidate/identity.mjs";
import {
  createArtifactReceipt,
  createSourceValidationReceipt,
  validateArtifactReceipt,
  validateSourceValidationReceipt,
} from "../contracts/release-receipt.mjs";
import { diagnoseSlowRelease } from "../diagnostics/slow-flow.mjs";
import { runFullSourceValidation } from "./full-source-validation.mjs";
import { taskGraphDigest, taskReceiptDigest } from "../contracts/task-proof-contract.mjs";

test("candidate identity is content based and ignores commit metadata", () => {
  const first = captureCandidateIdentity({ repositoryRoot: process.cwd(), revision: "HEAD" });
  const second = captureCandidateIdentity({ repositoryRoot: process.cwd(), revision: "HEAD^{tree}" });
  assert.equal(first.contentDigest, second.contentDigest);
  assert.equal(first.treeId, second.treeId);
});

test("CI receipts bind candidate content without a commit or base SHA gate", () => {
  const identity = captureCandidateIdentity({ repositoryRoot: process.cwd(), revision: "HEAD" });
  const runId = "ci-20260801T000000Z-aaaaaaaaaaaa-11111111";
  const validation = createSourceValidationReceipt({ ...identity, targetId: "monolith", runId, runner: "local" });
  const artifact = createArtifactReceipt({ ...identity, targetId: "monolith", runner: "local" });
  assert.equal(validateSourceValidationReceipt(validation, { ...identity, targetId: "monolith", runId }), validation);
  assert.equal(validateArtifactReceipt(artifact, { ...identity, targetId: "monolith" }), artifact);
  assert.equal(Object.hasOwn(validation, "baseSha"), false);
  assert.equal(Object.hasOwn(artifact, "baseSha"), false);
});

test("full source validation binds a frozen task graph to one CI run", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "release-validation-"));
  const resultFile = path.join(directory, "result.json");
  const taskGraphFile = path.join(directory, "task-graph.json");
  const contentDigest = "a".repeat(64);
  const runId = "ci-20260801T000000Z-aaaaaaaaaaaa-11111111";
  const descriptor = (taskKey) => ({
    taskKey,
    taskContractVersion: 2,
    inputDigest: taskKey === "reused" ? "1".repeat(64) : "2".repeat(64),
    commandDigest: "3".repeat(64),
    runtimeDigest: "4".repeat(64),
  });
  const writeReceipt = (task, sourceRunId) => {
    const unsigned = {
      schemaVersion: 2,
      kind: "workspace-check-task-receipt",
      ...task,
      status: "passed",
      sourceRunId,
      durationMs: 10,
      completedAt: new Date(1_000).toISOString(),
    };
    const file = path.join(directory, ".cache/check-results", task.taskKey, `${task.inputDigest}.json`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ ...unsigned, receiptDigest: taskReceiptDigest(unsigned) }));
    return taskReceiptDigest(unsigned);
  };
  const writeGraph = (sourceRunId, { includeReceipts = true } = {}) => {
    const reused = descriptor("reused");
    const pending = descriptor("pending");
    const reusedReceiptDigest = includeReceipts ? writeReceipt(reused, "ci-history") : null;
    if (includeReceipts) writeReceipt(pending, sourceRunId);
    const unsigned = {
      schemaVersion: 1,
      kind: "workspace-check-task-graph",
      sourceRunId,
      mode: "standard",
      tasks: [
        { ...reused, status: "reused", sourceRunId: "ci-history", receiptDigest: reusedReceiptDigest },
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
    writeGraph(runId);
    return { status: 0, signal: null, error: null };
  };
  const first = runFullSourceValidation({
    cwd: directory,
    contentDigest,
    runId,
    targetId: "finance",
    taskGraphFile,
    resultFile,
    execute,
    now: () => 1_000,
  });
  assert.equal(first.status, "passed");
  assert.equal(first.sourceRunId, runId);
  assert.deepEqual(first.validationTarget, { kind: "unit", id: "finance" });
  assert.equal(first.taskCounts.reused, 1);
  assert.equal(first.taskCounts.pending, 1);
  assert.equal(executions, 1);
  assert.equal(executionOptions.env.CHECK_SUITE_COLLECT_FAILURES, "1");
  assert.equal(executionOptions.env.CHECK_SOURCE_RUN_ID, runId);
  assert.equal(executionOptions.env.CHECK_TASK_GRAPH_FILE, taskGraphFile);
  assert.equal(executionOptions.env.RELEASE_VALIDATION_TARGET_ID, "finance");
  assert.throws(
    () => runFullSourceValidation({ cwd: directory, contentDigest, runId, targetId: "finance", taskGraphFile, resultFile, execute }),
    /already produced a source result/,
  );

  const failedFile = path.join(directory, "failed.json");
  const failedRunId = "ci-20260801T000001Z-bbbbbbbbbbbb-22222222";
  writeGraph(failedRunId, { includeReceipts: false });
  runFullSourceValidation({
    contentDigest,
    runId: failedRunId,
    targetId: "monolith",
    taskGraphFile,
    resultFile: failedFile,
    execute: () => ({ status: 2, signal: null, error: null }), cwd: directory,
    now: () => 3_000,
  });
  assert.throws(
    () => runFullSourceValidation({ cwd: directory, contentDigest, runId: failedRunId, targetId: "monolith", taskGraphFile, resultFile: failedFile, execute }),
    /already produced a source result/,
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
