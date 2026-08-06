import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { okCommand } from "@workspace/platform/server/domain-validation";

mock.module("./position-report-override-validation", {
  namedExports: {
    resolveEdpPositionAssignment: async () => okCommand({
      reportingCompanyId: 9,
      departmentId: 800,
      positionReportOverrideId: 14,
      isFunctionalPosition: true,
    }),
  },
});
mock.module("../edp-report-to", {
  namedExports: {
    resolveDefaultEdpReportToPositionId: async () => 3326,
    validateEdpReportToPosition: async () => okCommand(null),
  },
});

const { normalizeTargetAssignment } = await import("./employee-lifecycle-validation");

test("new assignments resolve the configured special-report anchor and supervisor", async () => {
  const result = await normalizeTargetAssignment(7, {
    reportingCompanyId: 9,
    departmentId: 800,
    positionId: 3347,
    allocationWeight: "100",
  }, "2026-08-06");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.positionReportOverrideId, 14);
  assert.equal(result.data.reportToPositionId, 3326);
});
