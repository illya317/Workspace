#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync, spawn } = require("node:child_process");

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
const staleMs = Number(process.env.CHECK_LOCK_STALE_MS ?? 2 * 60 * 60 * 1000);
const timeoutMs = Number(process.env.CHECK_LOCK_TIMEOUT_MS ?? 30 * 60 * 1000);
const pollMs = Number(process.env.CHECK_LOCK_POLL_MS ?? 1000);
const coreUiDesktopRequestPath = "/Users/koito/Desktop/UI/core-ui-change-request.md";

function runGit(args, options = {}) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: options.encoding ?? "utf8",
    maxBuffer: options.maxBuffer ?? 200 * 1024 * 1024,
  });
}

function splitNull(text) {
  return text.split("\0").filter(Boolean);
}

function isArchGateCommand() {
  return command === "tsx" && commandRest.length === 1 && commandRest[0] === "scripts/arch/gate.ts";
}

function shouldIncludeSnapshotFile(file) {
  return !(
    file.startsWith(".cache/") ||
    file.startsWith(".next/") ||
    file.startsWith(".planning/") ||
    file.startsWith("node_modules/") ||
    file === ".DS_Store" ||
    file.endsWith("/.DS_Store")
  );
}

function addHashPart(hash, label, value) {
  hash.update(`${label}:${Buffer.byteLength(value)}\0`);
  hash.update(value);
  hash.update("\0");
}

function createArchGateCacheDescriptor() {
  if (!isArchGateCommand()) return null;
  if (process.env.CHECK_RESULT_CACHE === "0") return null;

  try {
    const hash = crypto.createHash("sha256");
    const headTree = runGit(["rev-parse", "HEAD^{tree}"]).trim();
    const diff = runGit([
      "diff",
      "--no-ext-diff",
      "--binary",
      "HEAD",
      "--",
      ".",
      ":(exclude).cache",
      ":(exclude).next",
      ":(exclude).planning",
      ":(exclude)node_modules",
    ]);
    const untrackedFiles = splitNull(runGit(["ls-files", "--others", "--exclude-standard", "-z"]))
      .filter(shouldIncludeSnapshotFile)
      .sort();

    addHashPart(hash, "kind", "arch-gate-v1");
    addHashPart(hash, "node", process.versions.node);
    addHashPart(hash, "command", [command, ...commandRest].join("\0"));
    addHashPart(hash, "headTree", headTree);
    addHashPart(hash, "workingTreeDiff", diff);
    addHashPart(hash, "env.CORE_UI_CHANGE", process.env.CORE_UI_CHANGE === "1" ? "1" : "0");
    addHashPart(hash, "coreUiDesktopRequest", fs.existsSync(coreUiDesktopRequestPath) ? "exists" : "missing");

    for (const file of untrackedFiles) {
      const absPath = path.join(repoRoot, file);
      if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) continue;
      hash.update(`untracked:${file}:`);
      hash.update(fs.readFileSync(absPath));
      hash.update("\0");
    }

    const key = hash.digest("hex");
    return {
      key,
      file: path.join(resultCacheDir, `${key}.json`),
      command: [command, ...commandRest].join(" "),
    };
  } catch (error) {
    console.error(`Check result cache disabled: failed to calculate arch snapshot (${error.message})`);
    return null;
  }
}

function readSuccessfulCachedResult(cacheDescriptor) {
  if (!cacheDescriptor) return null;
  try {
    const cached = JSON.parse(fs.readFileSync(cacheDescriptor.file, "utf8"));
    if (cached?.status === "passed" && cached?.key === cacheDescriptor.key) return cached;
  } catch {
    return null;
  }
  return null;
}

function printCachedResult(cacheDescriptor, cached) {
  const completedAt = cached.completedAt ? ` from ${cached.completedAt}` : "";
  console.log(`✓ Reusing cached arch:gate result${completedAt}`);
  console.log(`  snapshot: ${cacheDescriptor.key.slice(0, 16)}`);
}

function writeSuccessfulCachedResult(cacheDescriptor) {
  if (!cacheDescriptor) return;
  try {
    fs.mkdirSync(resultCacheDir, { recursive: true });
    fs.writeFileSync(
      cacheDescriptor.file,
      JSON.stringify({
        key: cacheDescriptor.key,
        status: "passed",
        command: cacheDescriptor.command,
        completedAt: new Date().toISOString(),
        host: os.hostname(),
      }, null, 2),
    );
  } catch (error) {
    console.error(`Check result cache write skipped: ${error.message}`);
  }
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
  const ageMs = meta?.startedAt ? Date.now() - Date.parse(meta.startedAt) : Number.POSITIVE_INFINITY;
  const staleByPid = meta?.pid ? !processIsAlive(meta.pid) : ageMs > staleMs;
  const staleByAge = ageMs > staleMs;

  if (staleByPid || staleByAge) {
    fs.rmSync(lockDir, { recursive: true, force: true });
    return true;
  }

  return false;
}

async function acquireLock(cacheDescriptor) {
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
          cacheKey: cacheDescriptor?.key ?? null,
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
        const sameSnapshot = cacheDescriptor?.key && meta?.cacheKey === cacheDescriptor.key
          ? " (same snapshot; will reuse result if it passes)"
          : "";
        console.error(`Waiting for project check lock${running}${sameSnapshot}`);
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
  const cacheDescriptor = createArchGateCacheDescriptor();
  const cachedBeforeLock = readSuccessfulCachedResult(cacheDescriptor);
  if (cachedBeforeLock) {
    printCachedResult(cacheDescriptor, cachedBeforeLock);
    process.exit(0);
  }

  const acquired = await acquireLock(cacheDescriptor);
  const cachedAfterLock = readSuccessfulCachedResult(cacheDescriptor);
  if (cachedAfterLock) {
    releaseLock(acquired);
    printCachedResult(cacheDescriptor, cachedAfterLock);
    process.exit(0);
  }

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
    if (!signal && code === 0) writeSuccessfulCachedResult(cacheDescriptor);
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
