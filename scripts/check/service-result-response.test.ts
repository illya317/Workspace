import assert from "node:assert/strict";
import test from "node:test";

import { serviceError, serviceResponse } from "../../packages/platform/server/api";
import { toServiceErrorResponse } from "../../packages/platform/server/api";

const impactDetails = {
  code: "MUTATION_IMPACT_REQUIRED",
  impact: { operation: "archive", affectedCount: 3 },
};

test("service errors preserve structured response details", async () => {
  const result = serviceError("需要确认变更影响", 409, impactDetails);

  assert.deepEqual(result, {
    ok: false,
    error: "需要确认变更影响",
    status: 409,
    details: impactDetails,
  });

  const response = serviceResponse(result);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "需要确认变更影响",
    ...impactDetails,
  });
});

test("domain command responses forward structured service error details", async () => {
  const response = toServiceErrorResponse({
    error: "需要确认变更影响",
    status: 409,
    details: impactDetails,
  });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: "需要确认变更影响",
    ...impactDetails,
  });
});
