import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  advancePressureState,
  calculateMemoryThresholds,
  createRestartLease,
  GIB,
  parseDuration,
  parseMemorySize,
  parseSwapUsage,
  parseTopProcessSample,
  readRestartLeases,
  recordAutomaticRestart,
  releaseRestartLease,
  RESTART_COOLDOWN_MS,
  STARTUP_GRACE_MS,
} from "./local-dev-guard.mjs";

function initialState(overrides = {}) {
  return {
    state: "healthy",
    hardConsecutive: 0,
    softConsecutive: 0,
    restartHistory: [],
    cooldownUntil: 0,
    fused: false,
    action: "none",
    ...overrides,
  };
}

function pressureInput(overrides = {}) {
  return {
    now: STARTUP_GRACE_MS + 1,
    childStartedAt: 0,
    footprintBytes: 6 * GIB,
    thresholds: calculateMemoryThresholds(8 * GIB),
    activeLeaseCount: 0,
    ...overrides,
  };
}

test("parses macOS top and swap memory units", () => {
  assert.equal(parseMemorySize("4898M"), 4898 * 1024 ** 2);
  assert.equal(parseMemorySize("6.5G"), 6.5 * GIB);
  assert.deepEqual(parseTopProcessSample("PID MEM STATE\n10306 4898M stuck\n", 10306), {
    pid: 10306,
    footprintBytes: 4898 * 1024 ** 2,
    state: "stuck",
  });
  assert.equal(parseSwapUsage("vm.swapusage: total = 10240.00M used = 9697.38M free = 542.62M"), 9697.38 * 1024 ** 2);
});

test("uses adaptive thresholds with safe floors and caps", () => {
  const eightGiB = calculateMemoryThresholds(8 * GIB);
  assert.equal(eightGiB.softBytes, 3.2 * GIB);
  assert.equal(eightGiB.hardBytes, 5.44 * GIB);
  assert.deepEqual(calculateMemoryThresholds(64 * GIB), { softBytes: 5 * GIB, hardBytes: 8 * GIB });
});

test("requires fresh consecutive hard samples after grace or a lease", () => {
  const duringGrace = advancePressureState(initialState(), pressureInput({ now: STARTUP_GRACE_MS - 1 }));
  assert.equal(duringGrace.state, "starting");
  assert.equal(duringGrace.hardConsecutive, 0);

  const first = advancePressureState(duringGrace, pressureInput());
  assert.equal(first.action, "none");
  assert.equal(first.hardConsecutive, 1);
  const leased = advancePressureState(first, pressureInput({ activeLeaseCount: 1 }));
  assert.equal(leased.state, "suppressed");
  assert.equal(leased.hardConsecutive, 0);
  const freshFirst = advancePressureState(leased, pressureInput({ now: STARTUP_GRACE_MS + 31_000 }));
  assert.equal(freshFirst.action, "none");
  const freshSecond = advancePressureState(freshFirst, pressureInput({ now: STARTUP_GRACE_MS + 62_000 }));
  assert.equal(freshSecond.action, "restart");
});

test("applies cooldown and fuses after two restarts in one hour", () => {
  const restarted = recordAutomaticRestart(initialState(), 1_000_000);
  const cooldown = advancePressureState(
    restarted,
    pressureInput({ now: 1_000_000 + RESTART_COOLDOWN_MS - 1, childStartedAt: 0 }),
  );
  assert.equal(cooldown.state, "cooldown");

  const history = [2_000_000, 2_100_000];
  const first = advancePressureState(initialState({ restartHistory: history }), pressureInput({ now: 2_200_000 }));
  const fused = advancePressureState(first, pressureInput({ now: 2_231_000 }));
  assert.equal(fused.action, "fuse");
  assert.equal(fused.fused, true);
});

test("restart suppression leases overlap, expire, and release independently", async (t) => {
  const repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-dev-guard-"));
  t.after(() => fs.rm(repositoryRoot, { recursive: true, force: true }));
  const now = Date.parse("2026-07-29T12:00:00.000Z");
  const first = await createRestartLease(repositoryRoot, {
    durationMs: parseDuration("30m"),
    reason: "browser verification",
    now,
  });
  const second = await createRestartLease(repositoryRoot, {
    durationMs: parseDuration("1h"),
    reason: "write flow",
    now,
  });
  assert.equal((await readRestartLeases(repositoryRoot, now)).length, 2);
  assert.equal(await releaseRestartLease(repositoryRoot, first.id, now), true);
  assert.deepEqual((await readRestartLeases(repositoryRoot, now)).map((lease) => lease.id), [second.id]);
  assert.equal((await readRestartLeases(repositoryRoot, now + parseDuration("2h"))).length, 0);
});
