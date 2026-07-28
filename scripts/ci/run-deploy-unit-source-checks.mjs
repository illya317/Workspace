#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveDeployGraph } from "../deploy/deploy-graph";
import { discoverNodeTests, runNodeTestFiles } from "../testing/run-node-tests.mjs";

const UNIT_PATTERN = /^[a-z][a-z0-9-]*$/;

export const DEPLOY_UNIT_PROTOCOL_TESTS = [
  "ops/deploy-unit-contract.test.mjs",
  "ops/deploy-unit-provenance.test.mjs",
  "ops/deploy-unit-release.test.mjs",
  "ops/gateway-generation.test.mjs",
  "ops/local-deploy-unit-identity.test.mjs",
  "ops/local-release-gate-receipt.test.mjs",
  "ops/publish-contract.test.mjs",
  "scripts/ci/run-deploy-unit-source-checks.test.mjs",
  "scripts/ci/run-local-unit-ci.test.mjs",
  "scripts/deploy/deploy-graph.test.ts",
  "scripts/deploy/deploy-unit-app-generator.test.ts",
  "scripts/deploy/deploy-unit-contract.test.ts",
  "scripts/testing/deploy-unit-e2e-plan.test.ts",
];

function matchesSourceRoot(file, sourceRoot) {
  return sourceRoot.endsWith("/") ? file.startsWith(sourceRoot) : file === sourceRoot;
}

export function createDeployUnitSourcePlan({ allTests, unit, protocolTests = DEPLOY_UNIT_PROTOCOL_TESTS }) {
  const missingProtocolTests = protocolTests.filter((file) => !allTests.includes(file));
  if (missingProtocolTests.length > 0) {
    throw new Error(`deploy unit protocol tests are missing: ${missingProtocolTests.join(", ")}`);
  }
  const nodeTests = allTests.filter((file) => (
    protocolTests.includes(file)
    || unit.privateSourceRoots.some((sourceRoot) => matchesSourceRoot(file, sourceRoot))
  ));
  if (nodeTests.length === 0) throw new Error(`deploy unit ${unit.id} has no scoped node tests`);
  return {
    lintTargets: [...unit.privateSourceRoots],
    nodeTests,
  };
}

function runCommand(command, args, { cwd, env, stderr }) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) stderr.write(`${result.error.message}\n`);
  return result.status ?? 1;
}

export function runDeployUnitSourceChecks(unitId, {
  repositoryRoot = path.resolve(import.meta.dirname, "../.."),
  env = process.env,
  stderr = process.stderr,
  stdout = process.stdout,
  graph = resolveDeployGraph(),
  allTests = discoverNodeTests(repositoryRoot),
  protocolTests = DEPLOY_UNIT_PROTOCOL_TESTS,
  prepareCache = (directory) => mkdirSync(directory, { recursive: true }),
  run = runCommand,
  runTests = runNodeTestFiles,
} = {}) {
  if (!UNIT_PATTERN.test(unitId ?? "")) throw new Error("deploy unit id is invalid");
  const unit = graph.units.find((candidate) => candidate.id === unitId);
  if (!unit) throw new Error(`unknown deploy unit: ${unitId}`);
  const plan = createDeployUnitSourcePlan({ allTests, unit, protocolTests });
  const cacheFile = path.join(".cache", "eslint", "units", `${unitId}.eslintcache`);
  prepareCache(path.join(repositoryRoot, path.dirname(cacheFile)));

  stdout.write(`Running scoped lint for deploy unit "${unitId}" across ${plan.lintTargets.length} source root(s).\n`);
  const lintStatus = run(path.join(repositoryRoot, "node_modules", ".bin", "eslint"), [
    "--cache",
    "--cache-strategy",
    "content",
    "--cache-location",
    cacheFile,
    "--max-warnings=0",
    ...plan.lintTargets,
  ], { cwd: repositoryRoot, env, stderr });
  if (lintStatus !== 0) return lintStatus;

  stdout.write(`Running ${plan.nodeTests.length} scoped node:test file(s) for deploy unit "${unitId}".\n`);
  return runTests(plan.nodeTests, {
    repositoryRoot,
    env,
    stderr,
    stdout,
    suiteLabel: `deploy-unit:${unitId}`,
  });
}

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== "--unit" || !UNIT_PATTERN.test(argv[1] ?? "")) {
    throw new Error("usage: run-deploy-unit-source-checks.mjs --unit <id>");
  }
  return argv[1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runDeployUnitSourceChecks(parseArguments(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
