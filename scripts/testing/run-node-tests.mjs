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
  "packages/work/ui/works/WorkReportPeriods.test.ts",
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

const clientReactTests = new Set([
  "packages/core/ui/internal/data/DataSurface.display.test.tsx",
  "packages/core/ui/internal/data/DataTable.disclosure.test.tsx",
  "packages/core/ui/internal/form/FormStyles.test.ts",
  "packages/finance/ui/assets/asset-location.test.ts",
  "packages/finance/ui/tax/tax-ui-sections.test.ts",
  "packages/settings/ui/admin/tabs/SourceCodeAnalysisSection.test.ts",
  "packages/settings/ui/settings/NotificationPublishingWorkbench.test.ts",
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

function jsonStringArray(value, label) {
  if (!value) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be a JSON string array`);
  }
  return parsed;
}

export function selectAffectedNodeTests(allTests, { changedFiles = [], affectedModules = [] } = {}) {
  const normalizedChanges = [...new Set(changedFiles)].sort();
  const packageIds = new Set(affectedModules);
  for (const file of normalizedChanges) {
    const packageMatch = file.match(/^packages\/([^/]+)\//);
    if (packageMatch) packageIds.add(packageMatch[1]);
  }
  const fullTestClosure = normalizedChanges.some((file) => (
    [".node-version", "package.json", "package-lock.json"].includes(file)
    || file.startsWith("scripts/testing/run-node-tests.")
  ));
  if (fullTestClosure) return allTests;
  const fullPackageClosure = normalizedChanges.some((file) => (
    file.startsWith("packages/core/")
    || file.startsWith("packages/platform/")
    || file.startsWith("prisma/")
    || file === "app/layout.tsx"
    || file === "app/error.tsx"
    || file === "app/globals.css"
  ));

  return allTests.filter((file) => {
    if (normalizedChanges.includes(file)) return true;
    const packageMatch = file.match(/^packages\/([^/]+)\//);
    if (fullPackageClosure && (packageMatch || file.startsWith("app/"))) return true;
    if (packageMatch && packageIds.has(packageMatch[1])) return true;
    if (file.startsWith("ops/") && normalizedChanges.some((changed) => changed.startsWith("ops/"))) return true;
    if (file.startsWith("app/") && normalizedChanges.some((changed) => changed.startsWith("app/"))) return true;
    const scriptArea = file.match(/^scripts\/([^/]+)\//)?.[1];
    return Boolean(scriptArea && normalizedChanges.some((changed) => changed.startsWith(`scripts/${scriptArea}/`)));
  });
}

export function selectNodeTests(allTests, suite, context = {}) {
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
    case "affected":
      return selectAffectedNodeTests(allTests, context);
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
    tests = selectNodeTests(allTests, suite, {
      changedFiles: jsonStringArray(process.env.WORKSPACE_CHANGED_FILES_JSON, "WORKSPACE_CHANGED_FILES_JSON"),
      affectedModules: jsonStringArray(process.env.WORKSPACE_AFFECTED_MODULES_JSON, "WORKSPACE_AFFECTED_MODULES_JSON"),
    });
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  if (tests.length === 0 && suite === "affected") {
    stdout.write("No affected node:test files; skipped.\n");
    return 0;
  }
  if (tests.length === 0) {
    stderr.write(`No node:test files found for suite: ${suite}\n`);
    return 1;
  }

  stdout.write(`Running ${tests.length} node:test file(s) for suite "${suite}".\n`);

  const testEnvironment = {
    ...process.env,
    WORKSPACE_CONFIG_DIR: process.env.WORKSPACE_CONFIG_DIR?.trim()
      || path.join(repositoryRoot, "scripts/check/fixtures/tenant-workspace"),
  };

  const serverTests = tests.filter((file) => !clientReactTests.has(file));
  const browserReactTests = tests.filter((file) => clientReactTests.has(file));
  for (const [selectedTests, conditions] of [
    [serverTests, ["--conditions=react-server"]],
    [browserReactTests, []],
  ]) {
    if (selectedTests.length === 0) continue;
    const result = spawn(process.execPath, [
      "--experimental-test-module-mocks",
      ...conditions,
      "--import",
      "tsx",
      "--test",
      "--test-concurrency",
      process.env.TEST_CONCURRENCY ?? "1",
      ...selectedTests,
    ], {
      cwd: repositoryRoot,
      env: testEnvironment,
      stdio: "inherit",
    });
    if (result.error) stderr.write(`${result.error.message}\n`);
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
