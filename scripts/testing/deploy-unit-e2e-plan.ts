#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { resolveDeployGraph, type DeployGraph } from "../deploy/deploy-graph";
import { loadModuleImpactMap, type ModuleImpactMap } from "./module-impact-map";

const UNIT_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const RUNTIME_SUITE = {
  id: "deploy-unit-runtime",
  grep: "@deploy-unit-runtime",
  specs: ["e2e/deploy-unit-runtime.spec.ts"],
};

export function createDeployUnitE2ePlan(
  unitId: string,
  graph: DeployGraph = resolveDeployGraph(),
  impactMap: ModuleImpactMap = loadModuleImpactMap(),
) {
  if (!UNIT_ID_PATTERN.test(unitId)) throw new Error(`deploy unit id is invalid: ${unitId}`);
  const unit = graph.units.find((candidate) => candidate.id === unitId);
  if (!unit) throw new Error(`unknown deploy unit: ${unitId}`);

  const suitesById = new Map(impactMap.suites.map((suite) => [suite.id, suite]));
  const selectedSuites = unit.checks.e2eSuites.map((suiteId) => {
    const suite = suitesById.get(suiteId);
    if (!suite) throw new Error(`${unitId} references unknown E2E suite: ${suiteId}`);
    return suite;
  });
  const grepTags = [RUNTIME_SUITE.grep, ...selectedSuites.map((suite) => suite.selection.grep)];
  return {
    schemaVersion: 1 as const,
    kind: "workspace-deploy-unit-e2e-plan" as const,
    unitId,
    suiteIds: [RUNTIME_SUITE.id, ...selectedSuites.map((suite) => suite.id)],
    grepPattern: [...new Set(grepTags)].join("|"),
    specs: [...new Set([
      ...RUNTIME_SUITE.specs,
      ...selectedSuites.flatMap((suite) => suite.specs),
    ])].sort(),
  };
}

function parseArguments(argv: string[]) {
  if (argv.length !== 2 || argv[0] !== "--unit" || !argv[1]) {
    throw new Error("usage: deploy-unit-e2e-plan.ts --unit <id>");
  }
  return argv[1];
}

export function main(argv = process.argv.slice(2)) {
  const plan = createDeployUnitE2ePlan(parseArguments(argv));
  process.stdout.write(`${JSON.stringify(plan)}\n`);
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
