import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import {
  ATTEMPT_SCHEMA,
  RECURRENCE_EXIT_CODE,
  RecurrenceError,
  beginAttempt,
  bindCandidate,
  finalizeAttempt,
  finishLane,
  patrolAttempts,
  startLane,
} from "./ci-attempt.mjs";

const execFileAsync = promisify(execFile);
const MODULE = fileURLToPath(new URL("./ci-attempt.mjs", import.meta.url));
const SHELL_LIBRARY = fileURLToPath(new URL("./ci-attempt-shell.sh", import.meta.url));
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const DIGEST_D = "d".repeat(64);

function tickingClock(start = Date.parse("2026-08-02T00:00:00.000Z")) {
  let current = start;
  return () => {
    const value = new Date(current).toISOString();
    current += 1000;
    return value;
  };
}

async function testRoot(t) {
  const actual = await mkdtemp(join(tmpdir(), "ci-attempt-"));
  t.after(async () => {
    await chmod(actual, 0o700).catch(() => {});
    await rm(actual, { recursive: true, force: true });
  });
  return actual;
}

async function newAttempt(root, runId, { commandId = "source-ci-v1", target = "workspace", lane = "source" } = {}) {
  const draft = join(root, `${runId}.draft.json`);
  const output = join(root, `${runId}.json`);
  const clock = tickingClock();
  await beginAttempt({ draft, runId, target, targetMode: "full", requiredLanes: [lane], clock });
  await bindCandidate({
    draft,
    commit: DIGEST_A,
    tree: DIGEST_B,
    contentDigest: DIGEST_C,
    configurationDigest: DIGEST_D,
  });
  await startLane({ draft, lane, commandId, clock });
  return { draft, output, clock, runId, lane };
}

async function laneLog(root, attempt, message) {
  const path = join(root, `${attempt.runId}.${attempt.lane}.log`);
  await writeFile(path, `${message}\n`, { mode: 0o600 });
  return `lane-log:${path}`;
}

test("writes an immutable passing receipt with lane timing and evidence digest", async (t) => {
  const root = await testRoot(t);
  const evidencePath = join(root, "evidence", "source-result.json");
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, '{"ok":true}\n');
  const attempt = await newAttempt(root, "run-success");
  await finishLane({
    draft: attempt.draft,
    lane: "source",
    status: "passed",
    repository: root,
    evidence: ["source-receipt:evidence/source-result.json"],
    clock: attempt.clock,
  });
  const receipt = await finalizeAttempt({
    draft: attempt.draft,
    output: attempt.output,
    historyRoot: root,
    exitCode: 0,
    clock: attempt.clock,
  });

  assert.equal(receipt.schema, ATTEMPT_SCHEMA);
  assert.equal(receipt.overall.status, "passed");
  assert.equal(receipt.lanes.source.status, "passed");
  assert.equal(receipt.lanes.source.durationMs, 1000);
  assert.match(receipt.lanes.source.commandDigest, /^[a-f0-9]{64}$/);
  assert.match(receipt.lanes.source.receiptDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(receipt.lanes.source.evidence.map(({ kind, path, sizeBytes }) => ({ kind, path, sizeBytes })), [
    { kind: "source-receipt", path: "evidence/source-result.json", sizeBytes: 12 },
  ]);
  assert.match(receipt.lanes.source.evidence[0].sha256, /^[a-f0-9]{64}$/);
  assert.match(receipt.receiptDigest, /^[a-f0-9]{64}$/);

  await assert.rejects(
    finalizeAttempt({ draft: attempt.output, output: attempt.output, historyRoot: root, exitCode: 0 }),
    /already finalized/,
  );
  assert.equal(JSON.parse(await readFile(attempt.output, "utf8")).receiptDigest, receipt.receiptDigest);
});

test("writes failure without raw output and blocks unstarted lanes", async (t) => {
  const root = await testRoot(t);
  const draft = join(root, "run-failure.draft.json");
  const output = join(root, "run-failure.json");
  const clock = tickingClock();
  await beginAttempt({ draft, runId: "run-failure", target: "workspace", targetMode: "module", requiredLanes: ["source", "artifact-build"], clock });
  await startLane({ draft, lane: "source", commandId: "source-ci-v1", clock });
  const log = join(root, "run-failure.source.log");
  const secret = "token=DO-NOT-PERSIST-raw-secret";
  await writeFile(log, `2026-08-02T08:00:00Z typecheck failed ${secret}\n`, { mode: 0o600 });
  await finishLane({
    draft,
    lane: "source",
    status: "failed",
    repository: root,
    errorCode: "typecheck-failed",
    exitCode: 17,
    evidence: [`lane-log:${log}`],
    clock,
  });
  const receipt = await finalizeAttempt({ draft, output, historyRoot: root, exitCode: 17, clock });

  assert.equal(receipt.overall.status, "failed");
  assert.equal(receipt.lanes.source.failure.errorCode, "typecheck-failed");
  assert.equal(receipt.lanes.source.failure.exitCode, 17);
  assert.match(receipt.lanes.source.failure.fingerprint, /^[a-f0-9]{64}$/);
  assert.match(receipt.lanes.source.failure.normalizedMessageDigest, /^[a-f0-9]{64}$/);
  assert.equal(receipt.lanes["artifact-build"].status, "blocked");
  assert.match(receipt.lanes["artifact-build"].receiptDigest, /^[a-f0-9]{64}$/);
  assert.equal(receipt.lanes["artifact-build"].completedAt, "2026-08-02T00:00:03.000Z");
  assert.ok(!JSON.stringify(receipt).includes("stdout"));
  assert.ok(!JSON.stringify(receipt).includes("stderr"));
  assert.ok(!JSON.stringify(receipt).includes(secret));
  assert.equal(await readFile(log, "utf8"), `2026-08-02T08:00:00Z typecheck failed ${secret}\n`);
});

test("a passing identical lane resolves a blocker and a later recurrence raises P1", async (t) => {
  const root = await testRoot(t);

  const failed = await newAttempt(root, "run-failed");
  await finishLane({ draft: failed.draft, lane: "source", status: "failed", repository: root, evidence: [await laneLog(root, failed, "2026-08-02T01:02:03Z pid=100 loader failed at /tmp/build-a port=3100 commit abcdef123")], errorCode: "loader-failed", exitCode: 9, clock: failed.clock });
  const failedReceipt = await finalizeAttempt({ draft: failed.draft, output: failed.output, historyRoot: root, exitCode: 9, clock: failed.clock });
  const fingerprint = failedReceipt.lanes.source.failure.fingerprint;

  const fixed = await newAttempt(root, "run-fixed");
  await finishLane({ draft: fixed.draft, lane: "source", status: "passed", repository: root, clock: fixed.clock });
  const fixedReceipt = await finalizeAttempt({ draft: fixed.draft, output: fixed.output, historyRoot: root, exitCode: 0, clock: fixed.clock });
  assert.deepEqual(fixedReceipt.resolutions, [{
    fingerprint,
    failedRunId: "run-failed",
    lane: "source",
    fixedByRunId: "run-fixed",
    fixCommit: DIGEST_A,
  }]);
  assert.deepEqual(fixedReceipt.supersedesAttempts, ["run-failed"]);

  const recurred = await newAttempt(root, "run-recurred");
  await finishLane({ draft: recurred.draft, lane: "source", status: "failed", repository: root, evidence: [await laneLog(root, recurred, "2026-08-03T11:12:13Z pid=999 loader failed at /tmp/build-b port=4500 commit 1234567abc")], errorCode: "loader-failed", exitCode: 9, clock: recurred.clock });
  await assert.rejects(
    finalizeAttempt({ draft: recurred.draft, output: recurred.output, historyRoot: root, exitCode: 9, clock: recurred.clock }),
    (error) => error instanceof RecurrenceError && error.exitCode === RECURRENCE_EXIT_CODE,
  );
  const recurrenceReceipt = JSON.parse(await readFile(recurred.output, "utf8"));
  assert.deepEqual(recurrenceReceipt.recurrentFingerprints, [{ fingerprint, lane: "source" }]);
  assert.equal(recurrenceReceipt.overall.exitCode, RECURRENCE_EXIT_CODE);
  await assert.rejects(patrolAttempts({ historyRoot: root }), RecurrenceError);
});

test("different target or command does not resolve an unrelated blocker", async (t) => {
  const root = await testRoot(t);
  const failed = await newAttempt(root, "run-a", { commandId: "source-ci-v1", target: "workspace" });
  await finishLane({ draft: failed.draft, lane: "source", status: "failed", repository: root, evidence: [await laneLog(root, failed, "lint failed")], errorCode: "lint-failed", exitCode: 3, clock: failed.clock });
  await finalizeAttempt({ draft: failed.draft, output: failed.output, historyRoot: root, exitCode: 3, clock: failed.clock });

  const changedCommand = await newAttempt(root, "run-b", { commandId: "source-ci-v2", target: "workspace" });
  await finishLane({ draft: changedCommand.draft, lane: "source", status: "passed", repository: root, clock: changedCommand.clock });
  const changedReceipt = await finalizeAttempt({ draft: changedCommand.draft, output: changedCommand.output, historyRoot: root, exitCode: 0, clock: changedCommand.clock });
  assert.deepEqual(changedReceipt.resolutions, []);

  const changedTarget = await newAttempt(root, "run-c", { commandId: "source-ci-v1", target: "settings" });
  await finishLane({ draft: changedTarget.draft, lane: "source", status: "passed", repository: root, clock: changedTarget.clock });
  const targetReceipt = await finalizeAttempt({ draft: changedTarget.draft, output: changedTarget.output, historyRoot: root, exitCode: 0, clock: changedTarget.clock });
  assert.deepEqual(targetReceipt.resolutions, []);
});

test("CLI rejects raw message fields and never persists their value", async (t) => {
  const root = await testRoot(t);
  const draft = join(root, "secret.draft.json");
  const secret = "DO-NOT-PERSIST-this-is-sensitive";
  await assert.rejects(
    execFileAsync(process.execPath, [MODULE, "begin", "--draft", draft, "--run-id", "run-secret", "--target", "workspace", "--target-mode", "full", "--message", secret]),
    (error) => {
      assert.equal(error.code, 2);
      assert.ok(!error.stderr.includes(secret));
      return true;
    },
  );
  await assert.rejects(readFile(draft, "utf8"), /ENOENT/);
});

test("begin refuses to overwrite an existing run draft", async (t) => {
  const root = await testRoot(t);
  const draft = join(root, "same-run.draft.json");
  await beginAttempt({ draft, runId: "same-run", target: "workspace", targetMode: "full", requiredLanes: ["source"] });
  const before = await readFile(draft, "utf8");
  await assert.rejects(
    beginAttempt({ draft, runId: "same-run", target: "other-target", targetMode: "full", requiredLanes: ["source"] }),
    /EEXIST/,
  );
  assert.equal(await readFile(draft, "utf8"), before);
});

test("shell EXIT trap persists an unexpected CI failure path", async (t) => {
  const root = await testRoot(t);
  await assert.rejects(
    execFileAsync("bash", ["-c", '. "$LIB"; release_ci_attempt_begin "$ROOT" run-trap workspace full source; release_ci_attempt_lane_start source source-ci-v1; exit 23'], {
      env: { ...process.env, LIB: SHELL_LIBRARY, ROOT: root },
    }),
    (error) => error.code === 23,
  );
  const receipt = JSON.parse(await readFile(join(root, ".cache/release-attempts/workspace/full/run-trap.json"), "utf8"));
  assert.equal(receipt.overall.exitCode, 23);
  assert.equal(receipt.lanes.source.status, "failed");
  assert.equal(receipt.lanes.source.failure.errorCode, "unexpected-exit");
});

test("shell capture preserves console output and stores a hashed lane log without receipt secrets", async (t) => {
  const root = await testRoot(t);
  const secret = "token=lane-log-secret";
  await assert.rejects(
    execFileAsync("bash", ["-c", '. "$LIB"; release_ci_attempt_begin "$ROOT" run-log workspace full source; release_ci_attempt_lane_start source source-ci-v1; set +e; release_ci_attempt_capture source -- bash -c \'echo "$SECRET"; exit 7\'; status=$?; set -e; release_ci_attempt_lane_fail source source-ci-failed "$status"; exit "$status"'], {
      env: { ...process.env, LIB: SHELL_LIBRARY, ROOT: root, SECRET: secret },
    }),
    (error) => error.code === 7 && error.stdout.includes(secret),
  );
  const receiptFile = join(root, ".cache/release-attempts/workspace/full/run-log.json");
  const receipt = JSON.parse(await readFile(receiptFile, "utf8"));
  const serialized = JSON.stringify(receipt);
  assert.ok(!serialized.includes(secret));
  assert.match(receipt.lanes.source.failure.normalizedMessageDigest, /^[a-f0-9]{64}$/);
  assert.equal(receipt.lanes.source.evidence[0].kind, "lane-log");
  assert.match(receipt.lanes.source.evidence[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(await readFile(join(root, receipt.lanes.source.evidence[0].path), "utf8"), `${secret}\n`);
});

test("patrol fails closed when an immutable receipt digest is tampered", async (t) => {
  const root = await testRoot(t);
  const attempt = await newAttempt(root, "run-tamper");
  await finishLane({ draft: attempt.draft, lane: "source", status: "passed", repository: root, clock: attempt.clock });
  await finalizeAttempt({ draft: attempt.draft, output: attempt.output, historyRoot: root, exitCode: 0, clock: attempt.clock });
  await chmod(attempt.output, 0o600);
  const receipt = JSON.parse(await readFile(attempt.output, "utf8"));
  receipt.target = "tampered";
  await writeFile(attempt.output, `${JSON.stringify(receipt, null, 2)}\n`);
  await assert.rejects(patrolAttempts({ historyRoot: root }), /receipt digest mismatch/);
});

test("different artifact exit-1 messages do not recur or resolve each other", async (t) => {
  const root = await testRoot(t);
  const first = await newAttempt(root, "artifact-a", { lane: "artifact-build", commandId: "artifact-build-v1" });
  await finishLane({ draft: first.draft, lane: first.lane, status: "failed", repository: root, evidence: [await laneLog(root, first, "artifact manifest is missing")], errorCode: "artifact-build-failed", exitCode: 1, clock: first.clock });
  const firstReceipt = await finalizeAttempt({ draft: first.draft, output: first.output, historyRoot: root, exitCode: 1, clock: first.clock });

  const fixed = await newAttempt(root, "artifact-fixed", { lane: "artifact-build", commandId: "artifact-build-v1" });
  await finishLane({ draft: fixed.draft, lane: fixed.lane, status: "passed", repository: root, clock: fixed.clock });
  await finalizeAttempt({ draft: fixed.draft, output: fixed.output, historyRoot: root, exitCode: 0, clock: fixed.clock });

  const different = await newAttempt(root, "artifact-b", { lane: "artifact-build", commandId: "artifact-build-v1" });
  await finishLane({ draft: different.draft, lane: different.lane, status: "failed", repository: root, evidence: [await laneLog(root, different, "artifact contains a broken symlink")], errorCode: "artifact-build-failed", exitCode: 1, clock: different.clock });
  const differentReceipt = await finalizeAttempt({ draft: different.draft, output: different.output, historyRoot: root, exitCode: 1, clock: different.clock });
  assert.notEqual(differentReceipt.lanes["artifact-build"].failure.fingerprint, firstReceipt.lanes["artifact-build"].failure.fingerprint);
  assert.deepEqual(differentReceipt.recurrentFingerprints, []);
  assert.deepEqual(differentReceipt.resolutions, []);
});
