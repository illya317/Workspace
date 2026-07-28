import assert from "node:assert/strict";
import test from "node:test";

import type { DeployGraph } from "../deploy/deploy-graph";
import type { ModuleImpactMap } from "./module-impact-map";
import { createDeployUnitE2ePlan } from "./deploy-unit-e2e-plan";

function graph(): DeployGraph {
  return {
    schemaVersion: 1,
    lifecycle: {} as DeployGraph["lifecycle"],
    sharedImpactModules: [],
    contributorEdges: [],
    units: [{
      id: "hr",
      checks: {
        e2eSuites: ["module-readiness"],
        typecheckScopes: ["hr", "app-hr"],
        unmatchedChangePolicy: "fail-closed",
      },
    } as DeployGraph["units"][number]],
  };
}

function impactMap(): ModuleImpactMap {
  return {
    schemaVersion: 1,
    policies: { unmatchedModulePath: "C3", unmappedWritePath: "C3" },
    modules: [],
    rules: [],
    suites: [{
      id: "module-readiness",
      tier: "nightly",
      kind: "playwright",
      selection: { grep: "@module-readiness" },
      specs: ["e2e/module-readiness.spec.ts"],
      covers: ["HR readiness"],
    }],
  };
}

test("unit E2E plan always includes runtime smoke and declared browser suites", () => {
  assert.deepEqual(createDeployUnitE2ePlan("hr", graph(), impactMap()), {
    schemaVersion: 1,
    kind: "workspace-deploy-unit-e2e-plan",
    unitId: "hr",
    suiteIds: ["deploy-unit-runtime", "module-readiness"],
    grepPattern: "@deploy-unit-runtime|@module-readiness",
    specs: ["e2e/deploy-unit-runtime.spec.ts", "e2e/module-readiness.spec.ts"],
  });
});

test("unit E2E plan fails closed on unknown units or suites", () => {
  assert.throws(() => createDeployUnitE2ePlan("finance", graph(), impactMap()), /unknown deploy unit/);
  const invalidGraph = graph();
  invalidGraph.units[0].checks.e2eSuites = ["missing-suite"];
  assert.throws(() => createDeployUnitE2ePlan("hr", invalidGraph, impactMap()), /unknown E2E suite/);
});
