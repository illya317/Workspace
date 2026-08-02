import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createCheckTaskCache } from "./check-task-cache.mjs";

const descriptor = {
  taskKey: "fixture",
  taskContractVersion: 2,
  inputDigest: "a".repeat(64),
  commandDigest: "b".repeat(64),
  runtimeDigest: "c".repeat(64),
  inputSummary: { kind: "files", fileCount: 1, environmentKeys: [] },
};

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "check-task-cache-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const pendingDirectory = path.join(cwd, ".cache/check-results-pending/fixture-run");
  fs.mkdirSync(pendingDirectory, { recursive: true });
  const env = {
    CHECK_LOCK: "0",
    CHECK_CACHE_PENDING_DIR: pendingDirectory,
    CHECK_SOURCE_RUN_ID: "ci-fixture",
  };
  const task = { id: "fixture", command: "node", args: ["fixture.js"] };
  const captureInput = () => descriptor;
  return { cwd, env, pendingDirectory, task, captureInput };
}

function promotePending(cwd, pendingDirectory) {
  const resultDirectory = path.join(cwd, ".cache/check-results");
  fs.cpSync(pendingDirectory, resultDirectory, { recursive: true });
}

test("writes a task-input receipt and reuses it across plans", (t) => {
  const { cwd, env, pendingDirectory, task, captureInput } = fixture(t);
  const cache = createCheckTaskCache({ cwd, env, captureInput });

  assert.equal(cache.read(task), null);
  cache.write(task, "passed", 1234);
  promotePending(cwd, pendingDirectory);

  const reused = createCheckTaskCache({
    cwd,
    env: { ...env, CHECK_SOURCE_RUN_ID: "ci-replacement" },
    captureInput,
  }).read(task);
  assert.equal(reused.status, "passed");
  assert.equal(reused.durationMs, 1234);
  assert.equal(reused.sourceRunId, "ci-fixture");
  assert.equal(Object.hasOwn(reused, "snapshotKey"), false);
});

test("failed, cancelled, skipped and disallowed warning results are never written", (t) => {
  const { cwd, env, pendingDirectory, task, captureInput } = fixture(t);
  const cache = createCheckTaskCache({ cwd, env, captureInput });
  for (const status of ["failed", "cancelled", "skipped_by_fast", "warning"]) cache.write(task, status, 1);
  assert.deepEqual(fs.readdirSync(pendingDirectory), []);

  cache.write({ ...task, reusableWarning: true }, "warning", 1);
  assert.equal(fs.existsSync(path.join(pendingDirectory, "fixture", `${descriptor.inputDigest}.json`)), true);
});

test("command/runtime drift and quarantined corrupt derived receipts become pending", (t) => {
  const { cwd, env, pendingDirectory, task, captureInput } = fixture(t);
  const cache = createCheckTaskCache({ cwd, env, captureInput });
  cache.write(task, "passed", 1);
  promotePending(cwd, pendingDirectory);

  const changedCommand = createCheckTaskCache({
    cwd,
    env,
    captureInput: () => ({ ...descriptor, commandDigest: "d".repeat(64) }),
  }).freezeTaskGraph([task]);
  assert.equal(changedCommand.tasks[0].status, "pending");

  const receiptFile = path.join(cwd, ".cache/check-results/fixture", `${descriptor.inputDigest}.json`);
  fs.writeFileSync(receiptFile, "{broken");
  const corrupt = createCheckTaskCache({ cwd, env, captureInput }).freezeTaskGraph([task]);
  assert.equal(corrupt.tasks[0].status, "pending");
  assert.equal(corrupt.tasks[0].cacheRecovery, "corrupt receipt quarantined");
  assert.equal(fs.existsSync(receiptFile), false);
  assert.equal(fs.existsSync(path.join(cwd, ".cache/check-results-quarantine")), true);
});

test("freezes reused and pending tasks before execution", (t) => {
  const { cwd, env, pendingDirectory, task, captureInput } = fixture(t);
  const cache = createCheckTaskCache({ cwd, env, captureInput });
  cache.write(task, "passed", 1);
  promotePending(cwd, pendingDirectory);
  const nextTask = { id: "next", command: "node", args: ["next.js"] };
  const graphFile = path.join(cwd, ".cache/task-graphs/plan-fixture.json");
  const graph = createCheckTaskCache({
    cwd,
    env,
    captureInput(value) {
      return value.id === "fixture" ? descriptor : { ...descriptor, taskKey: "next", inputDigest: "e".repeat(64) };
    },
  }).freezeTaskGraph([task, nextTask], { file: graphFile });
  assert.deepEqual(graph.tasks.map((item) => item.status), ["reused", "pending"]);
  assert.match(graph.graphDigest, /^[0-9a-f]{64}$/);
  assert.equal(JSON.parse(fs.readFileSync(graphFile, "utf8")).graphDigest, graph.graphDigest);
});

test("disables task receipts outside the owned check lock", (t) => {
  const { cwd, env, task, captureInput } = fixture(t);
  const cache = createCheckTaskCache({ cwd, env: { ...env, CHECK_LOCK: "1" }, captureInput });
  assert.equal(cache.active, false);
  assert.equal(cache.read(task), null);
});
