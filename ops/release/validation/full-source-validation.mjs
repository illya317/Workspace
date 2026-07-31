#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { taskGraphDigest, taskReceiptDigest } from "../../../scripts/check/check-task-inputs.mjs";

const COMMAND = [
  "node",
  ["scripts/check/with-check-lock.js", "--", "node", "scripts/check/run-check-suite.mjs", "release-source"],
];

function atomicWrite(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}

function previousResult(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

function validateTaskReceiptProof(cwd, task) {
  const file = path.join(cwd, ".cache", "check-results", task.taskKey, `${task.inputDigest}.json`);
  const receipt = previousResult(file);
  if (!receipt) throw new Error(`successful validate is missing task receipt: ${task.taskKey}`);
  const { receiptDigest, ...unsigned } = receipt;
  if (
    receipt?.schemaVersion !== 2
    || receipt?.kind !== "workspace-check-task-receipt"
    || receipt.taskKey !== task.taskKey
    || receipt.taskContractVersion !== task.taskContractVersion
    || receipt.inputDigest !== task.inputDigest
    || receipt.commandDigest !== task.commandDigest
    || receipt.runtimeDigest !== task.runtimeDigest
    || !["passed", "warning"].includes(receipt.status)
    || receiptDigest !== taskReceiptDigest(unsigned)
  ) throw new Error(`successful validate has an invalid task receipt: ${task.taskKey}`);
  if (task.status === "reused" && task.receiptDigest !== receipt.receiptDigest) {
    throw new Error(`reused task receipt changed after graph freeze: ${task.taskKey}`);
  }
  return receipt;
}

export function validateFrozenTaskGraph({ cwd, taskGraphFile, planId, statusCode }) {
  const taskGraph = previousResult(taskGraphFile);
  if (
    taskGraph?.schemaVersion !== 1
    || taskGraph?.kind !== "workspace-check-task-graph"
    || !["standard", "fast"].includes(taskGraph?.mode)
    || !Array.isArray(taskGraph?.tasks)
    || !/^[0-9a-f]{64}$/.test(taskGraph?.graphDigest ?? "")
  ) {
    throw new Error("validate did not freeze a valid task graph before running checks");
  }
  const { graphDigest, ...unsigned } = taskGraph;
  if (graphDigest !== taskGraphDigest(unsigned)) throw new Error("frozen task graph digest is invalid");
  if (taskGraph.sourcePlanId !== planId) throw new Error("frozen task graph belongs to another Plan");
  const allowed = new Set(["reused", "pending", "blocked", "skipped_by_fast"]);
  for (const task of taskGraph.tasks) {
    if (!allowed.has(task.status)) throw new Error(`frozen task graph has invalid status: ${task.taskKey}`);
    if (["reused", "pending"].includes(task.status)) {
      if (!/^[a-z0-9][a-z0-9._-]*$/.test(task.taskKey ?? "")) throw new Error("frozen task key is invalid");
      for (const key of ["inputDigest", "commandDigest", "runtimeDigest"]) {
        if (!/^[0-9a-f]{64}$/.test(task[key] ?? "")) throw new Error(`frozen task ${task.taskKey} has invalid ${key}`);
      }
    }
  }
  if (statusCode === 0) {
    if (taskGraph.tasks.some((task) => task.status === "blocked")) {
      throw new Error("successful validate cannot contain blocked tasks");
    }
    if (taskGraph.mode === "standard" && taskGraph.tasks.some((task) => task.status === "skipped_by_fast")) {
      throw new Error("standard validate cannot contain fast-skipped tasks");
    }
    for (const task of taskGraph.tasks) {
      if (["reused", "pending"].includes(task.status)) validateTaskReceiptProof(cwd, task);
    }
  }
  return taskGraph;
}

export function runFullSourceValidation({
  cwd = process.cwd(),
  contentDigest,
  planId,
  taskGraphFile,
  resultFile,
  env = process.env,
  execute = (command, args, options) => spawnSync(command, args, { ...options, stdio: "inherit" }),
  now = () => Date.now(),
} = {}) {
  if (!/^[0-9a-f]{64}$/.test(contentDigest ?? "")) throw new Error("contentDigest must be SHA-256");
  if (!/^plan-[A-Za-z0-9-]+$/.test(planId ?? "")) throw new Error("planId is required");
  if (!taskGraphFile) throw new Error("taskGraphFile is required");
  if (!resultFile) throw new Error("resultFile is required");
  const previous = previousResult(resultFile);
  if (previous) throw new Error("this Plan already consumed its one-shot validate result");
  const startedAtMs = now();
  const result = execute(COMMAND[0], COMMAND[1], {
    cwd,
    env: {
      ...env,
      CHECK_SUITE_COLLECT_FAILURES: "1",
      CHECK_SOURCE_PLAN_ID: planId,
      CHECK_TASK_GRAPH_FILE: taskGraphFile,
    },
  });
  const completedAtMs = now();
  const statusCode = result.error || result.signal || result.status === null ? 1 : result.status;
  const taskGraph = validateFrozenTaskGraph({ cwd, taskGraphFile, planId, statusCode });
  const taskCounts = Object.fromEntries(["reused", "pending", "blocked", "skipped_by_fast"].map((status) => [
    status,
    taskGraph.tasks.filter((task) => task.status === status).length,
  ]));
  const receipt = {
    schemaVersion: 2,
    kind: "workspace-full-source-validation-result",
    contentDigest,
    sourcePlanId: planId,
    taskGraphDigest: taskGraph.graphDigest,
    taskCounts,
    command: [COMMAND[0], ...COMMAND[1]].join(" "),
    status: statusCode === 0 ? "passed" : "failed",
    exitCode: statusCode,
    startedAt: new Date(startedAtMs).toISOString(),
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: Math.max(0, completedAtMs - startedAtMs),
  };
  atomicWrite(resultFile, receipt);
  return receipt;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--content") options.contentDigest = argv[++index];
    else if (key === "--plan-id") options.planId = argv[++index];
    else if (key === "--task-graph") options.taskGraphFile = argv[++index];
    else if (key === "--result-file") options.resultFile = argv[++index];
    else throw new Error(`unknown argument: ${key}`);
  }
  return options;
}

export function main(argv = process.argv.slice(2)) {
  const result = runFullSourceValidation(parseArgs(argv));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
