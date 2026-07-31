#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const {
  captureWorkspaceSnapshot,
  resolveWorkspaceSnapshot,
  workspaceSnapshotMatches,
} = require("./workspace-snapshot");
const { enforceCheckMemoryLimit } = require("./check-memory-policy");

let boundedNodeOptions;
try {
  boundedNodeOptions = enforceCheckMemoryLimit(process.env.NODE_OPTIONS);
} catch (error) {
  console.error(`Check memory policy rejected this command: ${error.message}`);
  process.exit(2);
}

const args = process.argv.slice(2);
const separatorIndex = args.indexOf("--");
const commandArgs = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : args;

if (commandArgs.length === 0) {
  console.error("Usage: node scripts/check/with-check-lock.js -- <command> [args...]");
  process.exit(2);
}

const [command, ...commandRest] = commandArgs;
const repoRoot = path.resolve(__dirname, "../..");
const cacheDir = path.join(repoRoot, ".cache");
const lockDir = path.join(cacheDir, "check.lock");
const metaFile = path.join(lockDir, "meta.json");
const resultCacheDir = path.join(cacheDir, "check-results");
const pendingResultRoot = path.join(cacheDir, "check-results-pending");
const staleMs = Number(process.env.CHECK_LOCK_STALE_MS ?? 2 * 60 * 60 * 1000);
const incompleteLockGraceMs = Number(
  process.env.CHECK_LOCK_INCOMPLETE_GRACE_MS ?? Math.min(staleMs, 30 * 1000),
);
const timeoutMs = Number(process.env.CHECK_LOCK_TIMEOUT_MS ?? 30 * 60 * 1000);
const pollMs = Number(process.env.CHECK_LOCK_POLL_MS ?? 1000);
const childTerminateGraceMs = Number(process.env.CHECK_CHILD_TERMINATE_GRACE_MS ?? 5 * 1000);

function pendingResultDirectoryFromEnvironment(workspaceSnapshot) {
  if (!workspaceSnapshot.inherited) return null;
  const value = process.env.CHECK_CACHE_PENDING_DIR?.trim();
  if (!value) return null;
  const resolved = path.resolve(value);
  const relative = path.relative(pendingResultRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("CHECK_CACHE_PENDING_DIR must stay under the workspace pending cache directory");
  }
  return resolved;
}

function createPendingResultDirectory(workspaceSnapshot) {
  if (workspaceSnapshot.inherited || process.env.CHECK_RESULT_CACHE === "0") return null;
  fs.mkdirSync(pendingResultRoot, { recursive: true });
  return fs.mkdtempSync(path.join(pendingResultRoot, `${process.pid}-`));
}

function removePendingResultDirectory(directory) {
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
}

function promotePendingResults(directory) {
  if (!directory || !fs.existsSync(directory)) return;
  fs.mkdirSync(resultCacheDir, { recursive: true });
  const entries = [];
  const visit = (current, prefix = "") => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const relative = path.join(prefix, entry.name);
      if (entry.isDirectory()) visit(path.join(current, entry.name), relative);
      else if (entry.isFile()) entries.push(relative);
    }
  };
  visit(directory);

  for (const relative of entries) {
    const normalized = relative.replaceAll(path.sep, "/");
    const taskReceiptMatch = normalized.match(/^([a-z0-9][a-z0-9._-]*)\/([0-9a-f]{64})\.json$/);
    const structureMatch = normalized.match(/^structure-reports\/([0-9a-f]{64})\.json$/);
    if (!taskReceiptMatch && !structureMatch) continue;
    const source = path.join(directory, relative);
    try {
      const receipt = JSON.parse(fs.readFileSync(source, "utf8"));
      const validTaskReceipt = taskReceiptMatch
        && receipt?.schemaVersion === 2
        && receipt?.kind === "workspace-check-task-receipt"
        && receipt?.taskKey === taskReceiptMatch[1]
        && receipt?.inputDigest === taskReceiptMatch[2]
        && ["passed", "warning"].includes(receipt?.status)
        && /^[0-9a-f]{64}$/.test(receipt?.receiptDigest ?? "");
      const validStructureReport = structureMatch
        && receipt?.schemaVersion === 1
        && receipt?.snapshotKey === structureMatch[1]
        && receipt?.report
        && typeof receipt.report === "object";
      if (!validTaskReceipt && !validStructureReport) continue;
      const destination = path.join(resultCacheDir, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.rmSync(destination, { force: true });
      fs.renameSync(source, destination);
    } catch (error) {
      console.error(`Check result cache promotion skipped for ${normalized}: ${error.message}`);
    }
  }
  removePendingResultDirectory(directory);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

function readLockMeta() {
  try {
    return JSON.parse(fs.readFileSync(metaFile, "utf8"));
  } catch {
    return null;
  }
}

function removeLockIfStale() {
  const meta = readLockMeta();
  if (Number.isInteger(meta?.pid) && meta.pid > 0) {
    if (processIsAlive(meta.pid)) return false;
    fs.rmSync(lockDir, { recursive: true, force: true });
    return true;
  }

  let lockTimestamp = Number.isFinite(Date.parse(meta?.startedAt))
    ? Date.parse(meta.startedAt)
    : null;
  if (lockTimestamp === null) {
    try {
      lockTimestamp = fs.statSync(lockDir).mtimeMs;
    } catch (error) {
      if (error?.code === "ENOENT") return true;
      return false;
    }
  }
  if (Date.now() - lockTimestamp > incompleteLockGraceMs) {
    fs.rmSync(lockDir, { recursive: true, force: true });
    return true;
  }

  return false;
}

async function acquireLock() {
  if (process.env.CHECK_LOCK === "0") return { acquired: false, waited: false, waitMs: 0 };

  fs.mkdirSync(cacheDir, { recursive: true });
  const startedWaitingAt = Date.now();
  let announcedWait = false;

  while (true) {
    let createdLockDirectory = false;
    try {
      fs.mkdirSync(lockDir);
      createdLockDirectory = true;
      fs.writeFileSync(
        metaFile,
        JSON.stringify({
          pid: process.pid,
          command: [command, ...commandRest].join(" "),
          receiptScope: "task-input",
          startedAt: new Date().toISOString(),
          host: os.hostname(),
        }, null, 2),
      );
      return { acquired: true, waited: announcedWait, waitMs: Date.now() - startedWaitingAt };
    } catch (error) {
      if (createdLockDirectory) {
        fs.rmSync(lockDir, { recursive: true, force: true });
        throw error;
      }
      if (error.code !== "EEXIST") throw error;

      if (removeLockIfStale()) continue;

      if (timeoutMs === 0 || Date.now() - startedWaitingAt > timeoutMs) {
        const meta = readLockMeta();
        const running = meta?.command ? `: ${meta.command}` : "";
        console.error(`Another check is already running${running}`);
        process.exit(75);
      }

      if (!announcedWait) {
        const meta = readLockMeta();
        const running = meta?.command ? `: ${meta.command}` : "";
        console.error(`Waiting for project check lock${running}`);
        announcedWait = true;
      }

      await sleep(Math.max(100, pollMs));
    }
  }
}

function releaseLock(lock) {
  if (!lock?.acquired) return;
  const meta = readLockMeta();
  if (meta?.pid === process.pid) {
    fs.rmSync(lockDir, { recursive: true, force: true });
  }
}

function signalChildTree(child, signal) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    const terminated = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    if (terminated.status !== 0) child.kill(signal);
    return;
  }
  try {
    process.kill(-child.pid, signal);
    return;
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
  child.kill(signal);
}

(async () => {
  let workspaceSnapshot = resolveWorkspaceSnapshot({ cwd: repoRoot });
  const inheritedPendingResultDirectory = pendingResultDirectoryFromEnvironment(workspaceSnapshot);
  const lock = await acquireLock();
  if (lock.waited && !workspaceSnapshot.inherited) {
    workspaceSnapshot = captureWorkspaceSnapshot({ cwd: repoRoot });
  }

  let child = null;
  let pendingSignal = null;
  let childTerminationTimer = null;
  let pendingResultDirectory = inheritedPendingResultDirectory;
  try {
    pendingResultDirectory ??= createPendingResultDirectory(workspaceSnapshot);
  } catch (error) {
    releaseLock(lock);
    throw error;
  }
  const removeOwnedPendingResults = () => {
    if (!workspaceSnapshot.inherited) removePendingResultDirectory(pendingResultDirectory);
  };

  const handleSignal = (signal) => {
    if (pendingSignal) return;
    pendingSignal = signal;
    if (!child) {
      removeOwnedPendingResults();
      releaseLock(lock);
      process.kill(process.pid, signal);
      return;
    }
    signalChildTree(child, signal);
    childTerminationTimer = setTimeout(() => {
      try {
        signalChildTree(child, "SIGKILL");
      } catch (error) {
        if (error?.code !== "ESRCH") console.error(`Failed to terminate child check: ${error.message}`);
      }
    }, Math.max(0, childTerminateGraceMs));
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
  if (process.platform !== "win32") process.once("SIGHUP", handleSignal);
  process.once("exit", () => {
    removeOwnedPendingResults();
    releaseLock(lock);
  });

  const childEnvironment = {
    ...process.env,
    CHECK_LOCK: "0",
    CHECK_WORKSPACE_SNAPSHOT_KEY: workspaceSnapshot.key,
    NODE_OPTIONS: boundedNodeOptions,
  };
  const checkLockOwnerPid = lock.acquired ? String(process.pid) : process.env.CHECK_LOCK_OWNER_PID;
  if (checkLockOwnerPid) childEnvironment.CHECK_LOCK_OWNER_PID = checkLockOwnerPid;
  else delete childEnvironment.CHECK_LOCK_OWNER_PID;
  if (pendingResultDirectory) childEnvironment.CHECK_CACHE_PENDING_DIR = pendingResultDirectory;
  else delete childEnvironment.CHECK_CACHE_PENDING_DIR;

  child = spawn(command, commandRest, {
    cwd: repoRoot,
    env: childEnvironment,
    stdio: "inherit",
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
  });

  child.on("exit", (code, signal) => {
    if (childTerminationTimer) clearTimeout(childTerminationTimer);
    if (pendingSignal) {
      removeOwnedPendingResults();
      releaseLock(lock);
      process.kill(process.pid, pendingSignal);
      return;
    }
    if (signal) {
      removeOwnedPendingResults();
      releaseLock(lock);
      process.kill(process.pid, signal);
      return;
    }
    if (code !== 0) {
      if (!workspaceSnapshot.inherited) {
        try {
          const completedSnapshot = captureWorkspaceSnapshot({ cwd: repoRoot });
          if (workspaceSnapshotMatches(workspaceSnapshot, completedSnapshot)) {
            promotePendingResults(pendingResultDirectory);
            console.error("Preserved successful task-input receipts after the aggregate failure.");
          } else {
            removeOwnedPendingResults();
          }
        } catch {
          removeOwnedPendingResults();
        }
      }
      releaseLock(lock);
      process.exit(code ?? 1);
    }

    if (!workspaceSnapshot.inherited) {
      let completedSnapshot;
      try {
        completedSnapshot = captureWorkspaceSnapshot({ cwd: repoRoot });
      } catch (error) {
        removeOwnedPendingResults();
        releaseLock(lock);
        console.error(`Workspace snapshot verification failed after check: ${error.message}`);
        process.exit(1);
        return;
      }
      if (!workspaceSnapshotMatches(workspaceSnapshot, completedSnapshot)) {
        removeOwnedPendingResults();
        releaseLock(lock);
        console.error("Workspace snapshot changed while the check was running; rejecting the result and cache receipts.");
        process.exit(1);
        return;
      }
      promotePendingResults(pendingResultDirectory);
    }

    releaseLock(lock);
    process.exit(0);
  });

  child.on("error", (error) => {
    removeOwnedPendingResults();
    releaseLock(lock);
    console.error(error.message);
    process.exit(1);
  });
})();
