import { spawn } from "node:child_process";
import os from "node:os";

import {
  advancePressureState,
  appendLocalDevEvent,
  calculateMemoryThresholds,
  findVerifiedPortListener,
  readLocalDevStatus,
  readRestartLeases,
  recordAutomaticRestart,
  RESTART_PENDING_MS,
  SAMPLE_INTERVAL_MS,
  sampleMacProcess,
  writeLocalDevStatus,
} from "./local-dev-guard.mjs";

function delay(ms, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function signalChildTree(child, signal) {
  try {
    if (process.platform !== "win32") process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ESRCH") throw error;
  }
}

async function terminateChildTree(child, childExit) {
  signalChildTree(child, "SIGTERM");
  const exited = await Promise.race([
    childExit.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 15_000)),
  ]);
  if (!exited) {
    signalChildTree(child, "SIGKILL");
    await childExit;
  }
}

async function writeStatus(repositoryRoot, context, extra = {}) {
  await writeLocalDevStatus(repositoryRoot, {
    supervisorPid: process.pid,
    generation: context.generation,
    nextCliPid: context.child.pid,
    serverPid: context.serverPid,
    childStartedAt: new Date(context.childStartedAt).toISOString(),
    thresholds: context.thresholds,
    activeLeases: context.activeLeases,
    ...extra,
  });
}

export async function pendingRestartStillAllowed(repositoryRoot, controller, context) {
  const deadline = Date.now() + RESTART_PENDING_MS;
  while (Date.now() < deadline) {
    if (!(await delay(Math.min(1000, deadline - Date.now()), controller.signal))) return false;
    const leases = await readRestartLeases(repositoryRoot);
    if (leases.length > 0) {
      context.activeLeases = leases;
      context.guardState = { ...context.guardState, state: "suppressed", hardConsecutive: 0, softConsecutive: 0 };
      await appendLocalDevEvent(repositoryRoot, {
        type: "restart_cancelled",
        generation: context.generation,
        reason: "active_lease",
      });
      await writeStatus(repositoryRoot, context, { state: "suppressed", sample: context.lastSample });
      return false;
    }
  }
  return true;
}

async function monitorChild({ repositoryRoot, port, context, controller, requestRestart }) {
  let firstProbe = true;
  let priorState = "starting";

  while (!controller.signal.aborted) {
    const waited = await delay(firstProbe ? 2_000 : SAMPLE_INTERVAL_MS, controller.signal);
    if (!waited) return;
    firstProbe = false;

    try {
      context.serverPid = await findVerifiedPortListener(port, context.child.pid);
      context.activeLeases = await readRestartLeases(repositoryRoot);
      if (!context.serverPid) {
        await writeStatus(repositoryRoot, context, { state: "starting", sample: null });
        continue;
      }

      const sample = await sampleMacProcess(context.serverPid);
      if (!sample) {
        await writeStatus(repositoryRoot, context, { state: "unsupported", sample: null });
        continue;
      }
      context.lastSample = { ...sample, sampledAt: new Date().toISOString() };
      context.guardState = advancePressureState(context.guardState, {
        now: Date.now(),
        childStartedAt: context.childStartedAt,
        footprintBytes: sample.footprintBytes,
        thresholds: context.thresholds,
        activeLeaseCount: context.activeLeases.length,
      });

      if (context.guardState.state !== priorState) {
        await appendLocalDevEvent(repositoryRoot, {
          type: "state_changed",
          generation: context.generation,
          from: priorState,
          to: context.guardState.state,
          footprintBytes: sample.footprintBytes,
        });
        priorState = context.guardState.state;
      }
      await writeStatus(repositoryRoot, context, {
        state: context.guardState.state,
        sample: context.lastSample,
        restartHistory: context.guardState.restartHistory,
        cooldownUntil: context.guardState.cooldownUntil
          ? new Date(context.guardState.cooldownUntil).toISOString()
          : null,
      });

      if (context.guardState.action === "fuse") {
        await appendLocalDevEvent(repositoryRoot, { type: "fused", generation: context.generation });
        continue;
      }
      if (context.guardState.action !== "restart") continue;

      await appendLocalDevEvent(repositoryRoot, {
        type: "restart_scheduled",
        generation: context.generation,
        footprintBytes: sample.footprintBytes,
      });
      if (!(await pendingRestartStillAllowed(repositoryRoot, controller, context))) continue;
      requestRestart({ reason: "sustained_hard_memory_pressure", sample: context.lastSample });
      return;
    } catch (error) {
      await writeStatus(repositoryRoot, context, {
        state: "degraded",
        sample: context.lastSample,
        monitorError: error instanceof Error ? error.message : String(error),
      }).catch(() => {});
    }
  }
}

async function waitForPortRelease(isPortAvailable) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await isPortAvailable()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Port 3000 was not released after stopping the previous Next process tree.");
}

export async function superviseNextDev({ repositoryRoot, nextCliPath, port, isPortAvailable }) {
  const previousStatus = await readLocalDevStatus(repositoryRoot).catch(() => null);
  const thresholds = calculateMemoryThresholds(os.totalmem());
  let generation = Number.isInteger(previousStatus?.generation) ? previousStatus.generation : 0;
  let activeChild = null;
  let activeChildExit = null;
  let shutdownSignal = null;
  let guardState = {
    state: "starting",
    hardConsecutive: 0,
    softConsecutive: 0,
    restartHistory: [],
    cooldownUntil: 0,
    fused: false,
    action: "none",
  };

  const forwardSignal = (signal) => {
    shutdownSignal = signal;
    if (activeChild) signalChildTree(activeChild, signal);
  };
  const onSigint = () => forwardSignal("SIGINT");
  const onSigterm = () => forwardSignal("SIGTERM");
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  try {
    while (true) {
      if (shutdownSignal) return { code: null, signal: shutdownSignal };
      generation += 1;
      const child = spawn(process.execPath, [nextCliPath, "dev", "--port", String(port)], {
        cwd: repositoryRoot,
        env: { ...process.env, PORT: String(port) },
        stdio: "inherit",
        detached: process.platform !== "win32",
      });
      activeChild = child;
      const childExit = waitForChild(child);
      activeChildExit = childExit;
      const childStartedAt = Date.now();
      const controller = new AbortController();
      let resolveRestart;
      const restartRequested = new Promise((resolve) => {
        resolveRestart = resolve;
      });
      const context = {
        generation,
        child,
        childStartedAt,
        serverPid: null,
        thresholds,
        activeLeases: await readRestartLeases(repositoryRoot),
        lastSample: null,
        guardState,
      };
      await writeStatus(repositoryRoot, context, { state: "starting", sample: null });
      await appendLocalDevEvent(repositoryRoot, { type: "started", generation, nextCliPid: child.pid });

      const monitorPromise = monitorChild({
        repositoryRoot,
        port,
        context,
        controller,
        requestRestart: resolveRestart,
      });
      const outcome = await Promise.race([
        childExit.then((result) => ({ type: "exit", result })),
        restartRequested.then((details) => ({ type: "restart", details })),
      ]);
      controller.abort();
      await monitorPromise;
      guardState = context.guardState;

      if (outcome.type === "exit") {
        await writeStatus(repositoryRoot, context, {
          state: shutdownSignal ? "stopped" : "exited",
          sample: context.lastSample,
          exit: outcome.result,
        });
        activeChild = null;
        activeChildExit = null;
        return outcome.result;
      }

      if (shutdownSignal) {
        await terminateChildTree(child, childExit);
        await writeStatus(repositoryRoot, context, {
          state: "stopped",
          sample: context.lastSample,
          exit: { code: null, signal: shutdownSignal },
        });
        activeChild = null;
        activeChildExit = null;
        return { code: null, signal: shutdownSignal };
      }

      await appendLocalDevEvent(repositoryRoot, {
        type: "restarting",
        generation,
        reason: outcome.details.reason,
        sample: outcome.details.sample,
      });
      await writeStatus(repositoryRoot, context, {
        state: "restarting",
        sample: context.lastSample,
        restartReason: outcome.details.reason,
      });
      await terminateChildTree(child, childExit);
      await waitForPortRelease(isPortAvailable);
      guardState = recordAutomaticRestart(guardState, Date.now());
      activeChild = null;
      activeChildExit = null;
    }
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    if (activeChild && activeChildExit && !activeChild.killed) {
      await terminateChildTree(activeChild, activeChildExit).catch(() => {});
    }
  }
}
