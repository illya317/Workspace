#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { patrolAttempts } from "./ci-attempt.mjs";
import { DEPLOY_RECURRENCE_EXIT_CODE, patrolDeployBlockers } from "./deploy-blocker-contract.mjs";

function value(tokens, flag) {
  const index = tokens.indexOf(flag);
  if (index < 0 || !tokens[index + 1]) throw new Error(`${flag} is required`);
  return tokens[index + 1];
}

export async function main(argv, dependencies = {}) {
  const runCiPatrol = dependencies.patrolAttempts ?? patrolAttempts;
  const runDeployPatrol = dependencies.patrolDeployBlockers ?? patrolDeployBlockers;
  const failures = [];
  let ci;
  let deploy;
  try {
    ci = await runCiPatrol({ historyRoot: value(argv, "--ci-root") });
  } catch (error) {
    failures.push({ lane: "ci", message: error.message, exitCode: error.exitCode ?? 1 });
  }
  try {
    deploy = await runDeployPatrol({ root: value(argv, "--deploy-root") });
  } catch (error) {
    failures.push({ lane: "deploy", message: error.message, exitCode: error.exitCode ?? 1 });
  }
  if (failures.length) {
    const error = new Error(`patrol failures: ${failures.map((failure) => `${failure.lane}: ${failure.message}`).join("; ")}`);
    error.exitCode = failures.some((failure) => failure.exitCode === DEPLOY_RECURRENCE_EXIT_CODE)
      ? DEPLOY_RECURRENCE_EXIT_CODE
      : Math.max(...failures.map((failure) => failure.exitCode));
    error.failures = failures;
    throw error;
  }
  const result = { ci, deploy };
  if (!dependencies.silent) process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    if (error.failures) process.stderr.write(`${JSON.stringify(error.failures)}\n`);
    process.exitCode = error.exitCode ?? 1;
  });
}
