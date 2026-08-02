#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  DeployBlockerError, assertDeployRetry, classifyDeployBlocker, inspectDeployBlockers,
  patrolDeployBlockers, recordDeployAttempt, resolveSystemicDeployBlocker,
} from "./deploy-blocker-contract.mjs";
import { recordDeployAdmission } from "./deploy-admission-contract.mjs";
import {
  consumeDeployRetryFenceReceipt, createDeployRetryFenceReceipt,
  verifyConsumedDeployRetryFence, verifyDeployRetryFenceReceipt,
} from "./deploy-retry-fence-contract.mjs";

function fail(message) {
  throw new Error(message);
}
function parse(tokens) {
  const values = new Map();
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (!flag?.startsWith("--") || value == null) fail(`invalid argument near ${flag ?? "end"}`);
    const key = flag.slice(2);
    if (values.has(key)) fail(`duplicate argument ${flag}`);
    values.set(key, value);
  }
  return values;
}

function required(values, key) {
  const value = values.get(key);
  if (value == null) fail(`--${key} is required`);
  return value;
}

function integer(values, key) {
  const value = Number(required(values, key));
  if (!Number.isInteger(value)) fail(`--${key} must be an integer`);
  return value;
}

function csv(values, key) {
  return (values.get(key) ?? "").split(",").filter(Boolean);
}

const LOCKED_MUTATIONS = new Set([
  "record-admission", "record", "classify", "resolve", "assert-clear", "consume-clear",
]);

function rerunMutationWithLedgerLock(argv) {
  const [command, ...tokens] = argv;
  if (!LOCKED_MUTATIONS.has(command)) return null;
  const values = parse(tokens);
  const root = path.resolve(required(values, "root"));
  mkdirSync(root, { recursive: true });
  const lockFile = path.join(root, ".deploy-singleflight.lock");
  const inheritedFd = process.env.WORKSPACE_DEPLOY_LEDGER_LOCK_FD;
  if (inheritedFd != null) {
    if (!/^[1-9][0-9]*$/.test(inheritedFd) || Number(inheritedFd) <= 2) fail("deploy ledger lock fd is invalid");
    if (realpathSync(`/proc/self/fd/${inheritedFd}`) !== realpathSync(lockFile)) fail("deploy ledger lock fd path mismatch");
    const inheritedNumber = Number(inheritedFd);
    const stdio = Array.from({ length: inheritedNumber + 1 }, (_, index) => (index < 3 ? "inherit" : "ignore"));
    stdio[inheritedNumber] = inheritedNumber;
    const acquired = spawnSync("flock", ["-x", inheritedFd], { stdio });
    if (acquired.error) throw acquired.error;
    if (acquired.status !== 0) fail("deploy ledger inherited lock acquisition failed");
    return null;
  }
  const lockScript = [
    'lock_file="$1"', "shift", 'exec {ledger_fd}>> "$lock_file"', 'flock -x "$ledger_fd"',
    'export WORKSPACE_DEPLOY_LEDGER_LOCK_FD="$ledger_fd"', 'exec "$@"',
  ].join("; ");
  const child = spawnSync("bash", [
    "-c", lockScript, "deploy-ledger-lock", lockFile,
    process.execPath, fileURLToPath(import.meta.url), ...argv,
  ], {
    stdio: "inherit",
    env: process.env,
  });
  if (child.error) throw child.error;
  return child.status ?? 1;
}

async function main(argv) {
  const [command, ...tokens] = argv;
  const values = parse(tokens);
  const common = { root: required(values, "root") };
  let result;
  if (command === "record-admission") {
    result = await recordDeployAdmission({
      ...common,
      repository: required(values, "repository"),
      attemptId: required(values, "attempt-id"),
      target: required(values, "target"),
      targetMode: required(values, "target-mode"),
      source: {
        commit: values.get("source-commit") ?? "",
        tree: values.get("source-tree") ?? "",
        contentDigest: values.get("source-content") ?? "",
      },
      controller: { commit: values.get("controller-commit") ?? "" },
      startedAt: required(values, "started-at"),
      completedAt: required(values, "completed-at"),
      status: required(values, "status"),
      failureCodes: csv(values, "failure-codes"),
      blockedCodes: csv(values, "blocked-codes"),
      log: required(values, "log"),
    });
  } else if (command === "record") {
    result = await recordDeployAttempt({
      ...common,
      repository: required(values, "repository"),
      attemptId: required(values, "attempt-id"),
      target: required(values, "target"),
      targetMode: required(values, "target-mode"),
      source: {
        commit: required(values, "source-commit"),
        tree: required(values, "source-tree"),
        contentDigest: required(values, "source-content"),
      },
      controller: {
        commit: required(values, "controller-commit"),
        tree: required(values, "controller-tree"),
        digest: required(values, "controller-digest"),
      },
      commandId: required(values, "command-id"),
      startedAt: required(values, "started-at"),
      completedAt: required(values, "completed-at"),
      status: required(values, "status"),
      exitCode: integer(values, "exit-code"),
      log: required(values, "log"),
    });
  } else if (command === "classify") {
    result = await classifyDeployBlocker({
      ...common,
      fingerprint: required(values, "fingerprint"),
      classification: required(values, "classification"),
      reasonCode: required(values, "reason-code"),
      decisionId: required(values, "decision-id"),
    });
  } else if (command === "resolve") {
    const repository = required(values, "repository");
    result = await resolveSystemicDeployBlocker({
      ...common,
      repository,
      gateRepository: values.get("gate-repository") ?? repository,
      fingerprint: required(values, "fingerprint"),
      resolutionId: required(values, "resolution-id"),
      fixingCommit: required(values, "fixing-commit"),
      gate: required(values, "gate"),
      fixturePath: required(values, "fixture"),
      gateReceipt: required(values, "gate-receipt"),
    });
  } else if (["assert-clear", "verify-clear", "consume-clear", "verify-consumed"].includes(command)) {
    const retry = {
      ...common,
      repository: required(values, "repository"),
      target: required(values, "target"),
      targetMode: required(values, "target-mode"),
      sourceContentDigest: required(values, "source-content"),
      sourceCommit: required(values, "source-commit"),
      controllerCommit: required(values, "controller-commit"),
      attemptId: required(values, "attempt-id"),
    };
    result = await assertDeployRetry(retry);
    const groups = await inspectDeployBlockers({
      root: retry.root, target: retry.target, targetMode: retry.targetMode,
    });
    const receipt = required(values, "receipt");
    const fenceOptions = { ...retry, groups, file: receipt };
    if (command === "assert-clear") result.retryFence = await createDeployRetryFenceReceipt(fenceOptions);
    else if (command === "verify-clear") result.retryFence = await verifyDeployRetryFenceReceipt(fenceOptions);
    else if (command === "consume-clear") {
      result.retryFence = await consumeDeployRetryFenceReceipt({
        ...fenceOptions, parentPid: integer(values, "parent-pid"),
      });
    } else {
      result.retryFence = await verifyConsumedDeployRetryFence({
        ...fenceOptions, parentPid: integer(values, "parent-pid"),
      });
    }
  } else if (command === "status") {
    result = await inspectDeployBlockers({ ...common, target: values.get("target"), targetMode: values.get("target-mode") });
  } else if (command === "patrol") {
    result = await patrolDeployBlockers(common);
  } else {
    fail("expected record-admission, record, classify, resolve, assert-clear, verify-clear, consume-clear, verify-consumed, status, or patrol");
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function runCli(argv) {
  const lockedStatus = rerunMutationWithLedgerLock(argv);
  if (lockedStatus != null) {
    process.exitCode = lockedStatus;
    return;
  }
  await main(argv);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    if (error instanceof DeployBlockerError) {
      process.stderr.write(`${JSON.stringify(error.blockers)}\n`);
      process.exitCode = error.exitCode;
    } else process.exitCode = 1;
  });
}
