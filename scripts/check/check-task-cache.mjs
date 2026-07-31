import fs from "node:fs";
import path from "node:path";

import {
  captureCheckTaskInput,
  taskGraphDigest,
  taskReceiptDigest,
} from "./check-task-inputs.mjs";

const RECEIPT_KIND = "workspace-check-task-receipt";
const GRAPH_KIND = "workspace-check-task-graph";
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

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

function receiptFile(root, descriptor) {
  return path.join(root, descriptor.taskKey, `${descriptor.inputDigest}.json`);
}

function markReceiptUsed(file, receipt) {
  try { fs.utimesSync(file, new Date(), new Date()); } catch { /* LRU metadata is best effort. */ }
  return { state: "reusable", receipt };
}

function inspectReceipt(file, expected, task) {
  if (!fs.existsSync(file)) return { state: "missing", receipt: null };
  let receipt;
  try {
    receipt = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { state: "corrupt", receipt: null };
  }
  const { receiptDigest, ...unsigned } = receipt ?? {};
  if (
    receipt?.schemaVersion !== 2
    || receipt?.kind !== RECEIPT_KIND
    || receipt?.taskKey !== expected.taskKey
    || receipt?.taskContractVersion !== expected.taskContractVersion
    || receipt?.inputDigest !== expected.inputDigest
    || !DIGEST_PATTERN.test(receipt?.receiptDigest ?? "")
    || receiptDigest !== taskReceiptDigest(unsigned)
    || !Number.isFinite(Date.parse(receipt?.completedAt))
  ) return { state: "corrupt", receipt: null };
  if (receipt.commandDigest !== expected.commandDigest || receipt.runtimeDigest !== expected.runtimeDigest) {
    return { state: "stale", receipt: null };
  }
  if (receipt.status === "passed") return markReceiptUsed(file, receipt);
  if (receipt.status === "warning" && task.reusableWarning === true) return markReceiptUsed(file, receipt);
  return { state: "stale", receipt: null };
}

function inactiveCache() {
  return {
    active: false,
    describe() { throw new Error("task receipt cache is inactive"); },
    inspect() { return { state: "missing", receipt: null }; },
    read() { return null; },
    write() {},
    freezeTaskGraph() { return null; },
  };
}

export function createCheckTaskCache({
  cwd = process.cwd(),
  env = process.env,
  runtime = { node: process.versions.node, platform: process.platform, arch: process.arch },
  captureInput = captureCheckTaskInput,
} = {}) {
  if (env.CHECK_RESULT_CACHE === "0" || env.CHECK_LOCK !== "0") return inactiveCache();
  const resultDirectory = path.join(cwd, ".cache", "check-results");
  const pendingDirectory = validatedPendingDirectory(cwd, env);
  const descriptors = new Map();
  const describe = (task) => {
    if (!descriptors.has(task.id)) descriptors.set(task.id, captureInput(task, { cwd, env, runtime }));
    return descriptors.get(task.id);
  };

  return {
    active: true,
    describe,
    inspect(task) {
      if (task.cacheable === false) return { state: "missing", receipt: null };
      const descriptor = describe(task);
      return inspectReceipt(receiptFile(resultDirectory, descriptor), descriptor, task);
    },
    read(task) {
      const inspected = this.inspect(task);
      return inspected.state === "reusable" ? inspected.receipt : null;
    },
    write(task, status, durationMs) {
      if (
        task.cacheable === false
        || !pendingDirectory
        || (status !== "passed" && !(status === "warning" && task.reusableWarning === true))
      ) return;
      const descriptor = describe(task);
      const unsigned = {
        schemaVersion: 2,
        kind: RECEIPT_KIND,
        taskKey: descriptor.taskKey,
        taskContractVersion: descriptor.taskContractVersion,
        inputDigest: descriptor.inputDigest,
        commandDigest: descriptor.commandDigest,
        runtimeDigest: descriptor.runtimeDigest,
        status,
        sourcePlanId: env.CHECK_SOURCE_PLAN_ID?.trim() || null,
        durationMs: Math.max(0, Math.round(durationMs)),
        completedAt: new Date().toISOString(),
      };
      try {
        atomicWriteJson(receiptFile(pendingDirectory, descriptor), {
          ...unsigned,
          receiptDigest: taskReceiptDigest(unsigned),
        });
      } catch {
        // Receipt persistence is an optimization; a passing check remains passing.
      }
    },
    freezeTaskGraph(tasks, { file, mode = "standard", sourcePlanId = env.CHECK_SOURCE_PLAN_ID?.trim() || null } = {}) {
      const graphTasks = tasks.map((task) => {
        let descriptor;
        try {
          descriptor = describe(task);
        } catch (error) {
          return { taskKey: task.id, status: "blocked", reason: error instanceof Error ? error.message : String(error) };
        }
        if (mode === "fast") return { ...descriptor, status: "skipped_by_fast" };
        const inspected = task.cacheable === false
          ? { state: "missing", receipt: null }
          : inspectReceipt(receiptFile(resultDirectory, descriptor), descriptor, task);
        if (inspected.state === "corrupt") return { ...descriptor, status: "blocked", reason: "matching task receipt is corrupt" };
        if (inspected.state === "reusable") {
          return { ...descriptor, status: "reused", sourcePlanId: inspected.receipt.sourcePlanId, receiptDigest: inspected.receipt.receiptDigest };
        }
        return { ...descriptor, status: "pending" };
      });
      const unsigned = {
        schemaVersion: 1,
        kind: GRAPH_KIND,
        sourcePlanId,
        mode,
        tasks: graphTasks,
      };
      const graph = { ...unsigned, graphDigest: taskGraphDigest(unsigned) };
      if (file) {
        if (fs.existsSync(file)) {
          const existing = JSON.parse(fs.readFileSync(file, "utf8"));
          if (existing.graphDigest !== graph.graphDigest) throw new Error("frozen check task graph differs from the current task inputs");
        } else atomicWriteJson(file, graph);
      }
      return graph;
    },
  };
}
