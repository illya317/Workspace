import assert from "node:assert/strict";
import test from "node:test";

import { resolveDeployGraph } from "./deploy-graph";
import { canonicalJson, resolveDeployUnitContract, sha256Json } from "./deploy-unit-contract";

const graph = resolveDeployGraph();

test("unit contract derives build, public routes, checks, and control-plane floor", () => {
  const finance = resolveDeployUnitContract("finance", graph);
  assert.deepEqual(finance.moduleKeys, ["finance"]);
  assert.deepEqual(finance.moduleLabels, ["财务管理"]);
  assert.equal(finance.build.appRoot, "apps/finance");
  assert.equal(finance.build.basePath, "/workspace");
  assert.equal(finance.build.assetPrefix, "/workspace-static/finance");
  assert.equal(finance.runtime.slots.blue.port, 3201);
  assert.equal(finance.runtime.slots.green.port, 3301);
  assert.ok(finance.routes.pagePrefixes.includes("/workspace/finance"));
  assert.ok(finance.routes.apiPrefixes.includes("/workspace/api/modules/finance/ledger"));
  assert.equal(finance.controlPlane.policy, "require-existing");
  assert.deepEqual(finance.compiler.typecheckScopes, ["app-finance", "finance"]);
});

test("every candidate contract is free of cross-unit source contributors", () => {
  for (const unit of graph.units) {
    const contract = resolveDeployUnitContract(unit.id, graph);
    assert.deepEqual(contract.readiness.contributorBlockers, []);
  }
});

test("canonical graph digest is stable across object key insertion order", () => {
  assert.equal(canonicalJson({ b: 2, a: { d: 4, c: 3 } }), canonicalJson({ a: { c: 3, d: 4 }, b: 2 }));
  assert.equal(sha256Json({ b: 2, a: 1 }), sha256Json({ a: 1, b: 2 }));
});

test("unknown unit fails closed", () => {
  assert.throws(() => resolveDeployUnitContract("missing", graph), /Unknown deploy unit/);
});
