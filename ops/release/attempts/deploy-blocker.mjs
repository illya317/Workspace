#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import {
  DeployBlockerError, assertDeployRetry, classifyDeployBlocker, inspectDeployBlockers,
  patrolDeployBlockers, recordDeployAttempt, resolveSystemicDeployBlocker,
} from "./deploy-blocker-contract.mjs";

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

async function main(argv) {
  const [command, ...tokens] = argv;
  const values = parse(tokens);
  const common = { root: required(values, "root") };
  let result;
  if (command === "record") {
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
    result = await resolveSystemicDeployBlocker({
      ...common,
      repository: required(values, "repository"),
      fingerprint: required(values, "fingerprint"),
      resolutionId: required(values, "resolution-id"),
      fixingCommit: required(values, "fixing-commit"),
      gate: required(values, "gate"),
      fixturePath: required(values, "fixture"),
      gateReceipt: required(values, "gate-receipt"),
    });
  } else if (command === "assert-clear") {
    result = await assertDeployRetry({
      ...common,
      repository: required(values, "repository"),
      target: required(values, "target"),
      targetMode: required(values, "target-mode"),
      sourceContentDigest: required(values, "source-content"),
      sourceCommit: required(values, "source-commit"),
      controllerCommit: required(values, "controller-commit"),
    });
  } else if (command === "status") {
    result = await inspectDeployBlockers({ ...common, target: values.get("target"), targetMode: values.get("target-mode") });
  } else if (command === "patrol") {
    result = await patrolDeployBlockers(common);
  } else {
    fail("expected record, classify, resolve, assert-clear, status, or patrol");
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    if (error instanceof DeployBlockerError) {
      process.stderr.write(`${JSON.stringify(error.blockers)}\n`);
      process.exitCode = error.exitCode;
    } else process.exitCode = 1;
  });
}
