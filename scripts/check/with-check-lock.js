#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

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
const staleMs = Number(process.env.CHECK_LOCK_STALE_MS ?? 2 * 60 * 60 * 1000);
const timeoutMs = Number(process.env.CHECK_LOCK_TIMEOUT_MS ?? 30 * 60 * 1000);
const pollMs = Number(process.env.CHECK_LOCK_POLL_MS ?? 1000);

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
  const ageMs = meta?.startedAt ? Date.now() - Date.parse(meta.startedAt) : Number.POSITIVE_INFINITY;
  const staleByPid = meta?.pid ? !processIsAlive(meta.pid) : ageMs > staleMs;
  const staleByAge = ageMs > staleMs;

  if (staleByPid || staleByAge) {
    fs.rmSync(lockDir, { recursive: true, force: true });
    return true;
  }

  return false;
}

async function acquireLock() {
  if (process.env.CHECK_LOCK === "0") return false;

  fs.mkdirSync(cacheDir, { recursive: true });
  const startedWaitingAt = Date.now();
  let announcedWait = false;

  while (true) {
    try {
      fs.mkdirSync(lockDir);
      fs.writeFileSync(
        metaFile,
        JSON.stringify({
          pid: process.pid,
          command: [command, ...commandRest].join(" "),
          startedAt: new Date().toISOString(),
          host: os.hostname(),
        }, null, 2),
      );
      return true;
    } catch (error) {
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

function releaseLock(acquired) {
  if (!acquired) return;
  const meta = readLockMeta();
  if (meta?.pid === process.pid) {
    fs.rmSync(lockDir, { recursive: true, force: true });
  }
}

(async () => {
  const acquired = await acquireLock();
  let child = null;

  const handleSignal = (signal) => {
    if (child) child.kill(signal);
    releaseLock(acquired);
    process.kill(process.pid, signal);
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
  process.once("exit", () => releaseLock(acquired));

  child = spawn(command, commandRest, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("exit", (code, signal) => {
    releaseLock(acquired);
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });

  child.on("error", (error) => {
    releaseLock(acquired);
    console.error(error.message);
    process.exit(1);
  });
})();
