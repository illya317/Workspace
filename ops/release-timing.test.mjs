import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  completeTimingState,
  createTimingState,
  parseTimingNdjson,
  summarizeTimingEvents,
  validateTimingEvent,
  validateTimingSeries,
} from "./release-timing.mjs";

const modulePath = path.resolve(import.meta.dirname, "release-timing.mjs");
const shellPath = path.resolve(import.meta.dirname, "lib/release-timing.sh");

function event({
  releaseId = "release-20260725-a1b2c3d4",
  scope = "publish",
  stage = "preflight",
  status = "passed",
  exitCode = 0,
  startedAtEpochMs = Date.parse("2020-01-01T01:00:00.000Z"),
  finishedAtEpochMs = Date.parse("2020-01-01T01:00:08.000Z"),
  startedMonotonicNs = 10_000_000_000n,
  finishedMonotonicNs = 10_123_456_789n,
} = {}) {
  const state = createTimingState({
    releaseId,
    scope,
    stage,
    nowEpochMs: startedAtEpochMs,
    monotonicNs: startedMonotonicNs,
  });
  return completeTimingState(state, {
    status,
    exitCode,
    nowEpochMs: finishedAtEpochMs,
    monotonicNs: finishedMonotonicNs,
  });
}

test("successful stages use the monotonic clock and expose no command context", () => {
  const value = event();
  assert.equal(value.durationMs, 123);
  assert.equal(value.status, "passed");
  assert.equal(value.exitCode, 0);
  assert.deepEqual(Object.keys(value).sort(), [
    "durationMs",
    "exitCode",
    "finishedAt",
    "kind",
    "releaseId",
    "schemaVersion",
    "scope",
    "stage",
    "startedAt",
    "status",
  ].sort());
  assert.equal(JSON.stringify(value).includes("command"), false);
  assert.equal(JSON.stringify(value).includes("env"), false);
});

test("failed and cancelled stages require compatible exit codes", () => {
  assert.equal(event({ status: "failed", exitCode: 7 }).status, "failed");
  assert.equal(event({ status: "cancelled", exitCode: 130 }).status, "cancelled");
  assert.throws(() => event({ status: "passed", exitCode: 7 }), /exitCode 0/);
  assert.throws(() => event({ status: "failed", exitCode: 0 }), /non-zero/);
  assert.throws(() => event({ status: "cancelled", exitCode: 7 }), /signal-derived/);
});

test("release, scope, stage, and status identifiers are strict", () => {
  assert.throws(() => event({ releaseId: "release/unsafe" }), /releaseId/);
  assert.throws(() => event({ scope: "Publish" }), /scope/);
  assert.throws(() => event({ stage: "build step" }), /stage/);
  assert.throws(() => event({ status: "success" }), /status must be/);
});

test("validation rejects future timestamps, negative durations, and extra fields", () => {
  const value = event();
  assert.throws(
    () => validateTimingEvent(value, { nowEpochMs: Date.parse("2019-12-31T00:00:00.000Z"), maxFutureSkewMs: 0 }),
    /in the future/,
  );
  assert.throws(
    () => validateTimingEvent({ ...value, durationMs: -1 }, { nowEpochMs: Date.parse(value.finishedAt) }),
    /non-negative/,
  );
  assert.throws(
    () => validateTimingEvent({ ...value, command: "secret --token" }, { nowEpochMs: Date.parse(value.finishedAt) }),
    /unsupported or missing fields/,
  );
  const state = createTimingState({
    releaseId: "release-1",
    scope: "publish",
    stage: "build",
    nowEpochMs: 1_000,
    monotonicNs: 2_000n,
  });
  assert.throws(
    () => completeTimingState(state, { status: "passed", exitCode: 0, nowEpochMs: 1_001, monotonicNs: 1_999n }),
    /negative duration/,
  );
});

test("NDJSON validation and summary aggregate one release without losing stage status", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-timing-summary-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, "timing.ndjson");
  const events = [
    event({ stage: "preflight", finishedMonotonicNs: 10_050_000_000n }),
    event({ stage: "build", status: "failed", exitCode: 9, finishedMonotonicNs: 10_250_000_000n }),
  ];
  fs.writeFileSync(input, `${events.map((item) => JSON.stringify(item)).join("\n")}\n`);

  assert.deepEqual(parseTimingNdjson(fs.readFileSync(input, "utf8")), events);
  const summary = summarizeTimingEvents(events);
  assert.equal(summary.releaseId, events[0].releaseId);
  assert.equal(summary.eventCount, 2);
  assert.equal(summary.totalDurationMs, 300);
  assert.deepEqual(summary.statusCounts, { passed: 1, failed: 1, cancelled: 0 });
  assert.deepEqual(summary.stages.map(({ stage, status }) => ({ stage, status })), [
    { stage: "preflight", status: "passed" },
    { stage: "build", status: "failed" },
  ]);

  const validation = spawnSync(process.execPath, [modulePath, "validate", "--input", input], { encoding: "utf8" });
  assert.equal(validation.status, 0, validation.stderr);
  assert.equal(JSON.parse(validation.stdout).valid, true);
  const cliSummary = spawnSync(process.execPath, [modulePath, "summary", "--input", input], { encoding: "utf8" });
  assert.equal(cliSummary.status, 0, cliSummary.stderr);
  assert.deepEqual(JSON.parse(cliSummary.stdout), summary);
});

test("timing series can require one release, scope, and exact ordered stage set", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-timing-series-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, "timing.ndjson");
  const releaseId = "release-series-1";
  const scope = "deploy.remote";
  const stages = ["migration.provision", "candidate.warmup", "public.cutover"];
  const events = stages.map((stage) => event({ releaseId, scope, stage }));
  fs.writeFileSync(input, `${events.map((item) => JSON.stringify(item)).join("\n")}\n`);

  assert.deepEqual(validateTimingSeries(events, { releaseId, scope, requiredStages: stages }), events);
  assert.throws(
    () => validateTimingSeries(events, { releaseId: "another-release", scope, requiredStages: stages }),
    /belong to releaseId/,
  );
  assert.throws(
    () => validateTimingSeries(events, { releaseId, scope: "artifact", requiredStages: stages }),
    /belong to scope/,
  );
  assert.throws(
    () => validateTimingSeries(events.slice(0, 2), { releaseId, scope, requiredStages: stages }),
    /stages must be exactly/,
  );
  const cli = spawnSync(process.execPath, [
    modulePath,
    "validate",
    "--input",
    input,
    "--release-id",
    releaseId,
    "--scope",
    scope,
    "--required-stages",
    stages.join(","),
  ], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).valid, true);
});

function runShellStage({ output, stage, exitCode, secret = "not-recorded" }) {
  return spawnSync("bash", [
    "-c",
    [
      "set +e",
      "source \"$1\"",
      "release_timing_configure \"$2\" release-shell-1 publish",
      "release_timing_run \"$3\" bash -c 'test \"$1\" = \"$2\"; exit \"$3\"' bash \"$4\" \"$4\" \"$5\"",
      "result=$?",
      "exit \"$result\"",
    ].join("\n"),
    "release-timing-test",
    shellPath,
    output,
    stage,
    secret,
    String(exitCode),
  ], { encoding: "utf8" });
}

test("shell wrapper records passed, failed, and cancelled while preserving command exit codes", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-timing-shell-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, "timing.ndjson");

  const passed = runShellStage({ output, stage: "preflight", exitCode: 0, secret: "secret-pass" });
  const failed = runShellStage({ output, stage: "build", exitCode: 7, secret: "secret-fail" });
  const cancelled = runShellStage({ output, stage: "deploy", exitCode: 130, secret: "secret-cancel" });
  assert.equal(passed.status, 0, passed.stderr);
  assert.equal(failed.status, 7, failed.stderr);
  assert.equal(cancelled.status, 130, cancelled.stderr);

  const text = fs.readFileSync(output, "utf8");
  const events = parseTimingNdjson(text);
  assert.deepEqual(events.map(({ stage, status, exitCode: recordedExitCode }) => ({
    stage,
    status,
    exitCode: recordedExitCode,
  })), [
    { stage: "preflight", status: "passed", exitCode: 0 },
    { stage: "build", status: "failed", exitCode: 7 },
    { stage: "deploy", status: "cancelled", exitCode: 130 },
  ]);
  for (const secret of ["secret-pass", "secret-fail", "secret-cancel"]) {
    assert.equal(text.includes(secret), false);
  }
});

test("shell wrapper rejects stateful shell functions instead of weakening errexit", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-timing-function-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, "timing.ndjson");
  const marker = path.join(root, "function-ran");

  const result = spawnSync("bash", [
    "-c",
    [
      "set -e",
      "source \"$1\"",
      "release_timing_configure \"$2\" release-shell-function-1 deploy",
      "stateful_stage() { touch \"$3\"; }",
      "release_timing_run build stateful_stage",
    ].join("\n"),
    "release-timing-function-test",
    shellPath,
    output,
    marker,
  ], { encoding: "utf8" });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /only accepts external commands/);
  assert.equal(fs.existsSync(marker), false);
  assert.equal(fs.existsSync(output), false);
});

test("begin and finish can time a stateful shell function without a subshell", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-timing-stateful-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, "timing.ndjson");

  const result = spawnSync("bash", [
    "-c",
    [
      "set -e",
      "source \"$1\"",
      "release_timing_configure \"$2\" release-shell-stateful-1 deploy",
      "stateful_value=before",
      "stateful_stage() { stateful_value=after; }",
      "timing_state_file=\"$(release_timing_begin build)\"",
      "stateful_stage",
      "release_timing_finish \"$timing_state_file\" passed 0",
      "test \"$stateful_value\" = after",
    ].join("\n"),
    "release-timing-stateful-test",
    shellPath,
    output,
  ], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const events = parseTimingNdjson(fs.readFileSync(output, "utf8"));
  assert.equal(events.length, 1);
  assert.equal(events[0].stage, "build");
  assert.equal(events[0].status, "passed");
});

test("active timing preserves stateful shell mutations and restores the caller ERR settings", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-timing-active-pass-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, "timing.ndjson");

  const result = spawnSync("bash", [
    "-c",
    [
      "set -euo pipefail",
      "source \"$1\"",
      "release_timing_configure \"$2\" release-shell-active-pass-1 artifact",
      "cleanup_active() { local exit_code=$?; release_timing_active_finalize_on_exit \"$exit_code\" || true; return \"$exit_code\"; }",
      "trap cleanup_active EXIT",
      "run_active_stage() {",
      "  local stage=\"$1\"",
      "  shift",
      "  if ! release_timing_active_begin \"$stage\"; then \"$@\"; return; fi",
      "  \"$@\"",
      "  release_timing_active_passed",
      "}",
      "stateful_value=before",
      "stateful_stage() { stateful_value=after; }",
      "run_active_stage runtime.dependencies stateful_stage",
      "test \"$stateful_value\" = after",
      "test -z \"$(trap -p ERR)\"",
      "case \"$-\" in *E*) exit 91 ;; esac",
    ].join("\n"),
    "release-timing-active-pass-test",
    shellPath,
    output,
  ], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const events = parseTimingNdjson(fs.readFileSync(output, "utf8"));
  assert.deepEqual(events.map(({ stage, status, exitCode }) => ({ stage, status, exitCode })), [
    { stage: "runtime.dependencies", status: "passed", exitCode: 0 },
  ]);
});

test("active timing records a stateful stage failure without weakening errexit", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-timing-active-fail-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, "timing.ndjson");
  const enteredMarker = path.join(root, "entered");
  const unreachableMarker = path.join(root, "unreachable");

  const result = spawnSync("bash", [
    "-c",
    [
      "set -euo pipefail",
      "source \"$1\"",
      "release_timing_configure \"$2\" release-shell-active-fail-1 deploy",
      "cleanup_active() { local exit_code=$?; release_timing_active_finalize_on_exit \"$exit_code\" || true; return \"$exit_code\"; }",
      "trap cleanup_active EXIT",
      "run_active_stage() {",
      "  local stage=\"$1\"",
      "  shift",
      "  if ! release_timing_active_begin \"$stage\"; then \"$@\"; return; fi",
      "  \"$@\"",
      "  release_timing_active_passed",
      "}",
      "entered_marker=\"$3\"",
      "unreachable_marker=\"$4\"",
      "stateful_stage() { printf entered > \"$entered_marker\"; return 23; }",
      "run_active_stage artifact.verify stateful_stage",
      "printf unreachable > \"$unreachable_marker\"",
    ].join("\n"),
    "release-timing-active-fail-test",
    shellPath,
    output,
    enteredMarker,
    unreachableMarker,
  ], { encoding: "utf8" });

  assert.equal(result.status, 23, result.stderr);
  assert.equal(fs.existsSync(enteredMarker), true);
  assert.equal(fs.existsSync(unreachableMarker), false);
  const events = parseTimingNdjson(fs.readFileSync(output, "utf8"));
  assert.deepEqual(events.map(({ stage, status, exitCode }) => ({ stage, status, exitCode })), [
    { stage: "artifact.verify", status: "failed", exitCode: 23 },
  ]);
});

test("EXIT cleanup records an explicit exit from a stateful stage exactly once", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-timing-active-exit-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const output = path.join(root, "timing.ndjson");
  const stateRoot = path.join(root, "state");
  const unreachableMarker = path.join(root, "unreachable");
  fs.mkdirSync(stateRoot);

  const result = spawnSync("bash", [
    "-c",
    [
      "set -euo pipefail",
      "source \"$1\"",
      "release_timing_configure \"$2\" release-shell-active-exit-1 deploy",
      "cleanup_active() { local exit_code=$?; release_timing_active_finalize_on_exit \"$exit_code\" || true; return \"$exit_code\"; }",
      "trap cleanup_active EXIT",
      "run_active_stage() {",
      "  local stage=\"$1\"",
      "  shift",
      "  if ! release_timing_active_begin \"$stage\"; then \"$@\"; return; fi",
      "  \"$@\"",
      "  release_timing_active_passed",
      "}",
      "unreachable_marker=\"$3\"",
      "stateful_stage() { exit 23; }",
      "run_active_stage transport.connect stateful_stage",
      "printf unreachable > \"$unreachable_marker\"",
    ].join("\n"),
    "release-timing-active-exit-test",
    shellPath,
    output,
    unreachableMarker,
  ], {
    encoding: "utf8",
    env: { ...process.env, TMPDIR: stateRoot },
  });

  assert.equal(result.status, 23, result.stderr);
  assert.equal(fs.existsSync(unreachableMarker), false);
  const events = parseTimingNdjson(fs.readFileSync(output, "utf8"));
  assert.deepEqual(events.map(({ stage, status, exitCode }) => ({ stage, status, exitCode })), [
    { stage: "transport.connect", status: "failed", exitCode: 23 },
  ]);
  assert.deepEqual(fs.readdirSync(stateRoot), []);
});
