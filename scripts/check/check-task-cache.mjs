import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveWorkspaceSnapshot, SNAPSHOT_ENV_KEYS } = require("./workspace-snapshot.js");

const CACHE_VERSION = "suite-task-result-v1";
const SNAPSHOT_PATTERN = /^[0-9a-f]{64}$/;
const DEFAULT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function addHashPart(hash, label, value) {
  const bytes = Buffer.from(String(value));
  hash.update(`${label}:${bytes.length}\0`);
  hash.update(bytes);
  hash.update("\0");
}

function taskKey(task, snapshotKey, env, runtime) {
  const hash = crypto.createHash("sha256");
  addHashPart(hash, "version", CACHE_VERSION);
  addHashPart(hash, "snapshot", snapshotKey);
  addHashPart(hash, "task", task.id);
  addHashPart(hash, "command", task.command);
  addHashPart(hash, "args", JSON.stringify(task.args));
  addHashPart(hash, "severity", task.severity ?? "blocking");
  addHashPart(hash, "runtime", JSON.stringify(runtime));
  for (const name of SNAPSHOT_ENV_KEYS) addHashPart(hash, `env.${name}`, env[name] ?? "");
  return hash.digest("hex");
}

function readReceipt(file, expected) {
  try {
    const receipt = JSON.parse(fs.readFileSync(file, "utf8"));
    if (
      receipt?.schemaVersion !== 1
      || receipt?.kind !== "suite-task"
      || receipt?.key !== expected.key
      || receipt?.snapshotKey !== expected.snapshotKey
      || receipt?.taskId !== expected.taskId
      || !["passed", "warning"].includes(receipt?.status)
      || !Number.isFinite(Date.parse(receipt?.completedAt))
      || Date.now() - Date.parse(receipt.completedAt) > expected.maxAgeMs
    ) {
      return null;
    }
    return receipt;
  } catch {
    return null;
  }
}

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function validatedPendingDirectory(cwd, env) {
  const value = env.CHECK_CACHE_PENDING_DIR?.trim();
  if (!value) return null;
  const pendingRoot = path.join(cwd, ".cache", "check-results-pending");
  const resolved = path.resolve(value);
  const relative = path.relative(pendingRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolved;
}

function inactiveCache() {
  return {
    active: false,
    read() { return null; },
    write() {},
  };
}

export function createCheckTaskCache({
  cwd = process.cwd(),
  env = process.env,
  maxAgeMs = Number(env.CHECK_RESULT_CACHE_TTL_MS ?? DEFAULT_MAX_AGE_MS),
  runtime = {
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
  },
} = {}) {
  if (env.CHECK_RESULT_CACHE === "0" || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) return inactiveCache();
  const inheritedKey = env.CHECK_WORKSPACE_SNAPSHOT_KEY?.trim() ?? "";
  if (env.CHECK_LOCK !== "0" || !SNAPSHOT_PATTERN.test(inheritedKey)) return inactiveCache();

  let snapshot;
  try {
    snapshot = resolveWorkspaceSnapshot({ cwd, env });
  } catch {
    return inactiveCache();
  }
  if (!snapshot.inherited || !SNAPSHOT_PATTERN.test(snapshot.key)) return inactiveCache();

  const resultDirectory = path.join(cwd, ".cache", "check-results");
  const pendingDirectory = validatedPendingDirectory(cwd, env);
  const descriptor = (task) => {
    const key = taskKey(task, snapshot.key, env, runtime);
    return {
      key,
      snapshotKey: snapshot.key,
      taskId: task.id,
      resultFile: path.join(resultDirectory, `${key}.json`),
      pendingFile: pendingDirectory ? path.join(pendingDirectory, `${key}.json`) : null,
    };
  };

  return {
    active: true,
    read(task) {
      if (task.cacheable === false) return null;
      const expected = { ...descriptor(task), maxAgeMs };
      return readReceipt(expected.resultFile, expected);
    },
    write(task, status, durationMs) {
      if (task.cacheable === false || !pendingDirectory || !["passed", "warning"].includes(status)) return;
      const target = descriptor(task);
      try {
        atomicWriteJson(target.pendingFile, {
          schemaVersion: 1,
          kind: "suite-task",
          key: target.key,
          snapshotKey: target.snapshotKey,
          taskId: task.id,
          status,
          command: [task.command, ...task.args].join(" "),
          durationMs: Math.max(0, Math.round(durationMs)),
          completedAt: new Date().toISOString(),
        });
      } catch {
        // Cache persistence is an optimization; a passing check remains passing.
      }
    },
  };
}
