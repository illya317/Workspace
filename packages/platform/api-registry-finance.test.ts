import assert from "node:assert/strict";
import test from "node:test";

import { findApiContract } from "./api-registry";
import type { ApiMethod } from "./api-contract-types";

function assertFinanceContract(
  method: ApiMethod,
  apiPath: string,
  resourceKey: "finance.assets" | "finance.tax" | "finance.treasury",
  requiredAction: "read" | "create" | "update",
) {
  const contract = findApiContract(method, apiPath);
  assert.ok(contract, `${method} ${apiPath} should have an API contract`);
  assert.equal(contract.apiKind, "business");
  assert.equal(contract.access, "protected");
  assert.equal(contract.resourceKey, resourceKey);
  assert.deepEqual(contract.requiredActions, [requiredAction]);
}

test("Finance asset contracts cover the actual route methods, including policy deletion", () => {
  for (const [method, apiPath, requiredAction] of [
    ["GET", "/api/modules/finance/assets", "read"],
    ["POST", "/api/modules/finance/assets", "create"],
    ["PUT", "/api/modules/finance/assets", "update"],
    ["DELETE", "/api/modules/finance/assets/policies", "update"],
  ] as const) {
    assertFinanceContract(method, apiPath, "finance.assets", requiredAction);
  }
});

test("Finance treasury and tax contracts expose only their implemented route methods", () => {
  for (const [resourceKey, apiPath] of [
    ["finance.treasury", "/api/modules/finance/treasury"],
    ["finance.tax", "/api/modules/finance/tax"],
  ] as const) {
    for (const [method, requiredAction] of [
      ["GET", "read"],
      ["POST", "create"],
      ["PUT", "update"],
    ] as const) {
      assertFinanceContract(method, apiPath, resourceKey, requiredAction);
    }

    assertFinanceContract("GET", `${apiPath}/reference-options`, resourceKey, "read");
    assert.equal(findApiContract("PATCH", apiPath), null);
    assert.equal(findApiContract("DELETE", apiPath), null);
  }
});
