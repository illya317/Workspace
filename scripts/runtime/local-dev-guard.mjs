import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const GIB = 1024 ** 3;
export const DEFAULT_LEASE_DURATION_MS = 30 * 60 * 1000;
export const MAX_LEASE_DURATION_MS = 2 * 60 * 60 * 1000;
export const STARTUP_GRACE_MS = 3 * 60 * 1000;
export const SAMPLE_INTERVAL_MS = 30 * 1000;
export const RESTART_PENDING_MS = 15 * 1000;
export const RESTART_COOLDOWN_MS = 15 * 60 * 1000;
export const RESTART_WINDOW_MS = 60 * 60 * 1000;
export const MAX_RESTARTS_PER_WINDOW = 2;

export function runtimePaths(repositoryRoot) {
  const runtimeDir = path.join(repositoryRoot, ".cache/runtime");
  return {
    runtimeDir,
    statusPath: path.join(runtimeDir, "local-dev-status.json"),
    eventsPath: path.join(runtimeDir, "local-dev-events.ndjson"),
    leasesPath: path.join(runtimeDir, "local-dev-restart-leases.json"),
    leaseLockPath: path.join(runtimeDir, "local-dev-restart-leases.lock"),
  };
}

export function calculateMemoryThresholds(totalMemoryBytes = os.totalmem()) {
  return {
    softBytes: Math.min(5 * GIB, Math.max(3 * GIB, totalMemoryBytes * 0.4)),
    hardBytes: Math.min(8 * GIB, Math.max(5 * GIB, totalMemoryBytes * 0.68)),
  };
}

export function parseDuration(value = "30m") {
  const match = /^(\d+)(s|m|h)$/.exec(value.trim().toLowerCase());
  if (!match) throw new Error("Duration must use s, m, or h, for example 30m or 1h.");

  const amount = Number.parseInt(match[1], 10);
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000 }[match[2]];
  const durationMs = amount * multiplier;
  if (durationMs <= 0 || durationMs > MAX_LEASE_DURATION_MS) {
    throw new Error("Duration must be greater than zero and no longer than 2h.");
  }
  return durationMs;
}

function assertLeaseDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_LEASE_DURATION_MS) {
    throw new Error("Lease duration must be greater than zero and no longer than 2h.");
  }
}

export function parseMemorySize(value) {
  const match = /^(\d+(?:\.\d+)?)([KMGT])?B?$/i.exec(value.trim());
  if (!match) throw new Error(`Unsupported memory size: ${value}`);
  const power = { K: 1, M: 2, G: 3, T: 4 }[match[2]?.toUpperCase()] ?? 0;
  return Number.parseFloat(match[1]) * 1024 ** power;
}

export function parseTopProcessSample(output, expectedPid) {
  const row = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith(`${expectedPid} `));
  if (!row) throw new Error(`top did not return process ${expectedPid}`);

  const [, memory, ...stateParts] = row.split(/\s+/);
  return {
    pid: expectedPid,
    footprintBytes: parseMemorySize(memory),
    state: stateParts.join(" "),
  };
}

export function parseSwapUsage(output) {
  const match = /used\s*=\s*([\d.]+[KMGT]?)/i.exec(output);
  return match ? parseMemorySize(match[1]) : null;
}

export function advancePressureState(previous, input) {
  const restartHistory = (previous.restartHistory ?? []).filter(
    (timestamp) => input.now - timestamp < RESTART_WINDOW_MS,
  );
  const base = { ...previous, restartHistory };

  if (previous.fused) {
    return { ...base, state: "fused", hardConsecutive: 0, softConsecutive: 0, action: "none" };
  }
  if (input.activeLeaseCount > 0) {
    return {
      ...base,
      state: input.footprintBytes >= input.thresholds.hardBytes ? "suppressed" : "healthy",
      hardConsecutive: 0,
      softConsecutive: 0,
      action: "none",
    };
  }
  if (input.now - input.childStartedAt < STARTUP_GRACE_MS) {
    return { ...base, state: "starting", hardConsecutive: 0, softConsecutive: 0, action: "none" };
  }
  if (input.now < (previous.cooldownUntil ?? 0)) {
    return { ...base, state: "cooldown", hardConsecutive: 0, softConsecutive: 0, action: "none" };
  }

  const hardConsecutive =
    input.footprintBytes >= input.thresholds.hardBytes ? (previous.hardConsecutive ?? 0) + 1 : 0;
  const softConsecutive =
    input.footprintBytes >= input.thresholds.softBytes ? (previous.softConsecutive ?? 0) + 1 : 0;

  if (hardConsecutive >= 2) {
    if (restartHistory.length >= MAX_RESTARTS_PER_WINDOW) {
      return {
        ...base,
        state: "fused",
        fused: true,
        hardConsecutive,
        softConsecutive,
        action: "fuse",
      };
    }
    return { ...base, state: "restart_pending", hardConsecutive, softConsecutive, action: "restart" };
  }
  if (softConsecutive >= 4) {
    return { ...base, state: "suspect", hardConsecutive, softConsecutive, action: "none" };
  }
  return { ...base, state: "healthy", hardConsecutive, softConsecutive, action: "none" };
}

export function recordAutomaticRestart(state, now) {
  return {
    ...state,
    state: "cooldown",
    hardConsecutive: 0,
    softConsecutive: 0,
    restartHistory: [...(state.restartHistory ?? []), now],
    cooldownUntil: now + RESTART_COOLDOWN_MS,
    action: "none",
  };
}

async function atomicWriteJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporaryPath, filePath);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function readLocalDevStatus(repositoryRoot) {
  return readJson(runtimePaths(repositoryRoot).statusPath, null);
}

export async function writeLocalDevStatus(repositoryRoot, status) {
  await atomicWriteJson(runtimePaths(repositoryRoot).statusPath, {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    ...status,
  });
}

export async function appendLocalDevEvent(repositoryRoot, event) {
  const { eventsPath } = runtimePaths(repositoryRoot);
  await fs.mkdir(path.dirname(eventsPath), { recursive: true });
  let prior = "";
  try {
    prior = await fs.readFile(eventsPath, "utf8");
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  const lines = prior.split(/\r?\n/).filter(Boolean).slice(-199);
  lines.push(JSON.stringify({ at: new Date().toISOString(), ...event }));
  await fs.writeFile(eventsPath, `${lines.join("\n")}\n`, { mode: 0o600 });
}

function activeLeases(document, now) {
  return (document?.leases ?? []).filter((lease) => Date.parse(lease.expiresAt) > now);
}

async function acquireLeaseLock(repositoryRoot) {
  const { leaseLockPath } = runtimePaths(repositoryRoot);
  await fs.mkdir(path.dirname(leaseLockPath), { recursive: true });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await fs.mkdir(leaseLockPath);
      return async () => fs.rm(leaseLockPath, { recursive: true, force: true });
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") throw error;
      const stat = await fs.stat(leaseLockPath).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > 10_000) {
        await fs.rm(leaseLockPath, { recursive: true, force: true });
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error("Timed out waiting for the local dev guard lease lock.");
}

async function mutateLeases(repositoryRoot, mutate, now = Date.now()) {
  const release = await acquireLeaseLock(repositoryRoot);
  try {
    const { leasesPath } = runtimePaths(repositoryRoot);
    const document = await readJson(leasesPath, { schemaVersion: 1, leases: [] });
    const result = mutate(activeLeases(document, now));
    await atomicWriteJson(leasesPath, { schemaVersion: 1, leases: result.leases });
    return result.value;
  } finally {
    await release();
  }
}

export async function readRestartLeases(repositoryRoot, now = Date.now()) {
  const document = await readJson(runtimePaths(repositoryRoot).leasesPath, { schemaVersion: 1, leases: [] });
  return activeLeases(document, now);
}

export async function createRestartLease(repositoryRoot, { durationMs, reason = "agent operation", now = Date.now() }) {
  assertLeaseDuration(durationMs);
  return mutateLeases(
    repositoryRoot,
    (leases) => {
      const lease = {
        id: randomUUID(),
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + durationMs).toISOString(),
        reason: reason.trim().slice(0, 200) || "agent operation",
      };
      return { leases: [...leases, lease], value: lease };
    },
    now,
  );
}

export async function releaseRestartLease(repositoryRoot, leaseId, now = Date.now()) {
  return mutateLeases(
    repositoryRoot,
    (leases) => {
      const next = leases.filter((lease) => lease.id !== leaseId);
      return { leases: next, value: next.length !== leases.length };
    },
    now,
  );
}

export async function extendRestartLease(repositoryRoot, leaseId, durationMs, now = Date.now()) {
  assertLeaseDuration(durationMs);
  return mutateLeases(
    repositoryRoot,
    (leases) => {
      let extended = null;
      const next = leases.map((lease) => {
        if (lease.id !== leaseId) return lease;
        extended = { ...lease, expiresAt: new Date(now + durationMs).toISOString() };
        return extended;
      });
      return { leases: next, value: extended };
    },
    now,
  );
}

export async function sampleMacProcess(pid) {
  if (process.platform !== "darwin") return null;
  const [{ stdout: topOutput }, { stdout: swapOutput }] = await Promise.all([
    execFileAsync("top", ["-l", "1", "-pid", String(pid), "-stats", "pid,mem,state"], {
      env: { ...process.env, LC_ALL: "C" },
      maxBuffer: 1024 * 1024,
    }),
    execFileAsync("sysctl", ["vm.swapusage"], { maxBuffer: 1024 * 1024 }),
  ]);
  return { ...parseTopProcessSample(topOutput, pid), swapUsedBytes: parseSwapUsage(swapOutput) };
}

export async function findVerifiedPortListener(port, ancestorPid) {
  const { stdout } = await execFileAsync("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"], {
    maxBuffer: 1024 * 1024,
  }).catch((error) => {
    if (error && typeof error === "object" && "code" in error && error.code === 1) return { stdout: "" };
    throw error;
  });
  const candidates = stdout
    .split(/\s+/)
    .map((value) => Number.parseInt(value, 10))
    .filter(Number.isInteger);

  for (const candidate of candidates) {
    let current = candidate;
    for (let depth = 0; depth < 64 && current > 1; depth += 1) {
      if (current === ancestorPid) return candidate;
      const { stdout: parentOutput } = await execFileAsync("ps", ["-o", "ppid=", "-p", String(current)], {
        maxBuffer: 1024 * 1024,
      });
      current = Number.parseInt(parentOutput.trim(), 10);
    }
  }
  return null;
}
