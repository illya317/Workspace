import assert from "node:assert/strict";
import test from "node:test";

import { DEPLOY_UNIT_CATALOG } from "@workspace/platform/deploy-unit-catalog";

import { resolveDeployGraph } from "./deploy-graph";

test("runtime deploy-unit catalog stays aligned with the canonical deploy graph", () => {
  const graphProjection = resolveDeployGraph().units.map((unit) => ({
    id: unit.id,
    kind: unit.kind,
    maturity: unit.maturity,
    registryPackages: unit.registryPackages,
    runtimeDependencies: unit.runtimeDependencies,
  }));

  assert.deepEqual(DEPLOY_UNIT_CATALOG, graphProjection);
});
