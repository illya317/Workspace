import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDirectUnitActionAllowed,
  assertSignedInternalRpcPromotion,
} from "./internal-rpc-deployment-guard.mjs";
import { canonicalJson, sha256 } from "./deploy-unit-provenance.mjs";

const graph = {
  units: [
    { id: "finance", runtimeDependencies: [{ unitId: "work", protocol: "signed-internal-rpc" }] },
    { id: "work", runtimeDependencies: [] },
    { id: "docs", runtimeDependencies: [] },
  ],
};
const graphSha256 = sha256(canonicalJson(graph));
const promotion = (unitIds) => {
  const body = {
    graphSha256,
    stateOverrides: unitIds.map((unitId) => ({ unitId })),
  };
  return { ...body, promotionSha256: sha256(canonicalJson(body)) };
};

test("signed RPC participants retain graph validation without blocking direct release", () => {
  assert.doesNotThrow(() => assertDirectUnitActionAllowed({ action: "activate", graph, unitId: "finance" }));
  assert.doesNotThrow(() => assertDirectUnitActionAllowed({ action: "rollback", graph, unitId: "work" }));
  assert.doesNotThrow(() => assertDirectUnitActionAllowed({ action: "activate", graph, unitId: "docs" }));
  assert.throws(
    () => assertDirectUnitActionAllowed({ action: "activate", graph, unitId: "missing" }),
    /unknown deploy unit/,
  );
});

test("profile promotion requires the complete signed RPC dependency closure", () => {
  assert.throws(() => assertSignedInternalRpcPromotion({
    graph,
    promotion: promotion(["finance"]),
  }), /not dependency-closed/);
  assert.doesNotThrow(() => assertSignedInternalRpcPromotion({
    graph,
    promotion: promotion(["finance", "work"]),
  }));
  assert.doesNotThrow(() => assertSignedInternalRpcPromotion({
    graph,
    promotion: promotion(["docs"]),
  }));
});

test("profile promotion cannot guard against a different uploaded graph", () => {
  assert.throws(() => assertSignedInternalRpcPromotion({
    graph: { units: [{ id: "docs", runtimeDependencies: [] }] },
    promotion: promotion(["docs"]),
  }), /deploy graph digest does not match/);
});

test("profile promotion guard verifies its own provenance digest", () => {
  const value = promotion(["docs"]);
  value.stateOverrides.push({ unitId: "finance" });
  assert.throws(() => assertSignedInternalRpcPromotion({ graph, promotion: value }), /promotion digest drifted/);
});
