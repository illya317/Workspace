import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("@workspace/platform/server/api", {
  namedExports: {
    serviceError: (error: string, status = 400) => ({ ok: false, error, status }),
    serviceOk: (data: unknown) => ({ ok: true, data }),
  },
} as never);
mock.module("@workspace/platform/server/auth", {
  namedExports: { checkHRRead: async () => true },
} as never);
mock.module("@workspace/platform/server/domain-validation", {
  namedExports: { okCommand: (data: unknown) => ({ ok: true, data }) },
} as never);
mock.module("@workspace/platform/server/prisma", {
  namedExports: { Prisma: {}, prisma: {} },
} as never);
mock.module("../performance-audience", {
  namedExports: { resolveHrPerformanceContributionTarget: async () => null },
} as never);
mock.module("../performance-access", {
  namedExports: { canReadHrPerformanceContributionTarget: async () => true },
} as never);

const contributionDetail = await import("./contribution-detail");

test("绩效贡献详情 interface 只暴露两个路由意图", () => {
  assert.deepEqual(Object.keys(contributionDetail).sort(), [
    "buildGetHrPerformanceContributionDetailRouteCommand",
    "executeGetHrPerformanceContributionDetailRouteCommand",
  ]);
});

test("绩效贡献详情 command builder 规范化范围与周期", () => {
  assert.deepEqual(
    contributionDetail.buildGetHrPerformanceContributionDetailRouteCommand({
      userId: 7,
      audienceType: "department",
      audienceId: 11,
      cycleId: 13,
    }),
    {
      ok: true,
      data: {
        userId: 7,
        audienceType: "department",
        audienceId: 11,
        cycleId: 13,
      },
    },
  );

  assert.deepEqual(
    contributionDetail.buildGetHrPerformanceContributionDetailRouteCommand({
      userId: 7,
      audienceType: "unknown",
      audienceId: 0,
      cycleId: -1,
    }),
    {
      ok: true,
      data: {
        userId: 7,
        audienceType: null,
        audienceId: null,
        cycleId: null,
      },
    },
  );
});
