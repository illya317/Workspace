#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const defaultRoot = path.resolve(import.meta.dirname, "../..");

const workPlanGovernanceTests = new Set([
  "packages/work/server/domain/work-okr-control-scope.test.ts",
  "packages/work/server/domain/work-okr-governance-policy.test.ts",
  "packages/work/server/domain/work-plan-governance-validation.test.ts",
  "packages/work/server/domain/work-plan-item-state.test.ts",
  "packages/work/server/domain/work-plan-maintenance-policy.test.ts",
  "packages/work/server/domain/work-report-workflow-action.test.ts",
]);

const scalabilityContractTests = new Set([
  "packages/work/server/task-approval-handlers.test.ts",
  "packages/hr/server/contracts-capacity.test.ts",
  "packages/hr/server/hr-tab-list-capacity.test.ts",
  "packages/hr/server/roster-generated-capacity.test.ts",
]);

const actionContractTests = new Set([
  "scripts/check/action-contract-route-binding.test.ts",
  "scripts/check/action-contract-runtime.test.ts",
  "scripts/check/business-action-command.test.ts",
  "scripts/check/business-action-registry-validation.test.ts",
]);

function walk(repositoryRoot, relativeDir) {
  const absoluteDir = path.join(repositoryRoot, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs.readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) return walk(repositoryRoot, relativePath);
    return entry.isFile() && /\.test\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name) ? [relativePath] : [];
  });
}

export function discoverNodeTests(repositoryRoot = defaultRoot) {
  return ["packages", "scripts", "app", "ops"]
    .flatMap((relativeDir) => walk(repositoryRoot, relativeDir))
    .sort();
}

export function selectNodeTests(allTests, suite) {
  switch (suite) {
    case "all":
      return allTests;
    case "behavior":
      return allTests.filter((file) => (
        file.startsWith("packages/")
        || file.startsWith("app/")
        || file.startsWith("scripts/runtime/")
      ));
    case "tooling":
      return allTests.filter((file) => (
        file.startsWith("ops/")
        || (file.startsWith("scripts/")
          && !file.startsWith("scripts/runtime/")
          && !actionContractTests.has(file))
      ));
    case "contract":
      return allTests.filter((file) => actionContractTests.has(file));
    case "work-plan-governance":
      return allTests.filter((file) => workPlanGovernanceTests.has(file));
    case "scalability-contract":
      return allTests.filter((file) => scalabilityContractTests.has(file));
    default:
      throw new Error(`Unknown node test suite: ${suite}`);
  }
}

export function main(
  argv = process.argv.slice(2),
  { repositoryRoot = defaultRoot, spawn = spawnSync, stdout = process.stdout, stderr = process.stderr } = {},
) {
  const suite = argv[0] ?? "all";
  const allTests = discoverNodeTests(repositoryRoot);
  let tests;
  try {
    tests = selectNodeTests(allTests, suite);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  if (tests.length === 0) {
    stderr.write(`No node:test files found for suite: ${suite}\n`);
    return 1;
  }

  stdout.write(`Running ${tests.length} node:test file(s) for suite "${suite}".\n`);

  const result = spawn(process.execPath, [
    "--experimental-test-module-mocks",
    "--conditions=react-server",
    "--import",
    "tsx",
    "--test",
    "--test-concurrency",
    process.env.TEST_CONCURRENCY ?? "1",
    ...tests,
  ], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) stderr.write(`${result.error.message}\n`);
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
