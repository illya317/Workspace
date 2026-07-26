import assert from "node:assert/strict";
import test, { mock } from "node:test";

let exactRead = false;
let approve = false;
let reject = false;
const evaluations: Array<{
  action: string;
  grantMatch: { action?: string; resource?: string } | undefined;
}> = [];

mock.module("@workspace/platform/server/auth", {
  namedExports: {
    evaluatePermissionAction: async (
      _userId: number,
      _resourceKey: string,
      action: string,
      options?: { grantMatch?: { action?: string; resource?: string } },
    ) => {
      evaluations.push({ action, grantMatch: options?.grantMatch });
      if (action === "read") return exactRead;
      if (action === "approve") return approve;
      if (action === "reject") return reject;
      return false;
    },
  },
} as never);

const {
  canReadHrPerformanceContributionTarget,
  canReadHrPerformanceEmployee,
  canReadHrPerformanceSummary,
  hrPerformanceSubmissionSubmitterScope,
} = await import("./performance-access");

test("performance summary access uses exact read or explicit processing actions", async () => {
  exactRead = false;
  approve = true;
  reject = false;
  assert.equal(await canReadHrPerformanceSummary(7), true);
  assert.ok(evaluations.some((item) => (
    item.action === "read"
    && item.grantMatch?.action === "exact"
    && item.grantMatch.resource === "exact"
  )));

  exactRead = false;
  approve = false;
  reject = false;
  assert.equal(await canReadHrPerformanceSummary(7), false);
});

test("review and contribution access stays self-only without summary permission", async () => {
  exactRead = false;
  approve = false;
  reject = false;
  assert.equal(await canReadHrPerformanceEmployee(7, 7), true);
  assert.equal(await canReadHrPerformanceEmployee(7, 8), false);
  assert.equal(await canReadHrPerformanceContributionTarget(7, {
    audienceType: "personal",
    targetId: 7,
  } as never), true);
  assert.equal(await canReadHrPerformanceContributionTarget(7, {
    audienceType: "personal",
    targetId: 8,
  } as never), false);
  assert.equal(await canReadHrPerformanceContributionTarget(7, {
    audienceType: "department",
    targetId: 3,
  } as never), false);
});

test("submission listing defaults to a submitter filter and removes it only for summary view", () => {
  assert.equal(hrPerformanceSubmissionSubmitterScope("self", 7), 7);
  assert.equal(hrPerformanceSubmissionSubmitterScope("summary", 7), undefined);
});
