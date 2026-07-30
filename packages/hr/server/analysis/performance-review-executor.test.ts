import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("server-only", { namedExports: {} } as never);

const dashboardCalls: unknown[] = [];
const batchQueries: unknown[] = [];
let visibleReviewRows: Array<{ readonly id: number }> = [{ id: 70 }];
let visibleSnapshotJson = JSON.stringify({
  schemaVersion: 2,
  work: { summary: { planCount: 1 } },
  kpi: { weightedScore: 89 },
});

mock.module("../performance", {
  namedExports: {
    executeListHrPerformanceDashboardRouteCommand: async (query: unknown) => {
      dashboardCalls.push(query);
      return { ok: true, data: { reviewRows: visibleReviewRows } };
    },
  },
} as never);

mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      hrPerformanceReview: {
        findMany: async (query: unknown) => {
          batchQueries.push(query);
          return [reviewRecord({
            id: 70,
            employeeId: 1,
            employeeCode: "E001",
            employeeName: "张三",
            snapshotJson: visibleSnapshotJson,
          }), reviewRecord({
            id: 71,
            employeeId: 2,
            employeeCode: "E002",
            employeeName: "李四",
            snapshotJson: JSON.stringify({ secret: true }),
          })];
        },
      },
    },
  },
} as never);

const { loadHrPerformanceWorkspaceAnalysisRows } = await import("./performance-executor");
const { WorkspaceAnalysisRuntimeError } = await import("@workspace/platform/server/workspace-analysis-runtime");

test("loads review comments and evidence only after the original dashboard proves each ID visible", async () => {
  dashboardCalls.length = 0;
  batchQueries.length = 0;
  visibleReviewRows = [{ id: 70 }];
  visibleSnapshotJson = JSON.stringify({
    schemaVersion: 2,
    work: { summary: { planCount: 1 } },
    kpi: { weightedScore: 89 },
  });

  const details = await loadHrPerformanceWorkspaceAnalysisRows({
    sourceKey: "hr.performance-review-details",
    requesterId: 7,
    targetType: "department",
    targetId: 12,
    parameters: { cycleId: 40 },
  });
  const evidence = await loadHrPerformanceWorkspaceAnalysisRows({
    sourceKey: "hr.performance-review-evidence-values",
    requesterId: 7,
    targetType: "department",
    targetId: 12,
    parameters: { cycleId: 40 },
  });

  assert.equal(details.length, 1);
  assert.deepEqual(details[0], {
    id: 70,
    employeeId: 1,
    employeeCode: "E001",
    employeeName: "张三",
    okrCycleId: 40,
    approvalRequestId: 80,
    selfScore: 88,
    managerScore: 90,
    finalScore: 89,
    finalGrade: "A",
    archivedAt: "2026-08-05T01:00:00.000Z",
    version: 2,
    selfComment: "完成年度重点客户开发",
    managerComment: "目标完成稳定",
    hrComment: "同意归档",
    createdAt: "2026-08-05T01:00:00.000Z",
    updatedAt: "2026-08-06T02:00:00.000Z",
  });
  assert.deepEqual(evidence, [{
    rowKey: "70:$.kpi.weightedScore",
    reviewId: 70,
    employeeId: 1,
    employeeCode: "E001",
    employeeName: "张三",
    okrCycleId: 40,
    path: "$.kpi.weightedScore",
    valueKind: "number",
    textValue: "89",
    numberValue: 89,
    booleanValue: null,
  }, {
    rowKey: "70:$.schemaVersion",
    reviewId: 70,
    employeeId: 1,
    employeeCode: "E001",
    employeeName: "张三",
    okrCycleId: 40,
    path: "$.schemaVersion",
    valueKind: "number",
    textValue: "2",
    numberValue: 2,
    booleanValue: null,
  }, {
    rowKey: "70:$.work.summary.planCount",
    reviewId: 70,
    employeeId: 1,
    employeeCode: "E001",
    employeeName: "张三",
    okrCycleId: 40,
    path: "$.work.summary.planCount",
    valueKind: "number",
    textValue: "1",
    numberValue: 1,
    booleanValue: null,
  }]);
  assert.equal(JSON.stringify(details).includes("不可见"), false);
  assert.equal(JSON.stringify(evidence).includes("secret"), false);
  assert.deepEqual(dashboardCalls, [{
    userId: 7,
    view: "summary",
    cycleId: 40,
    periodType: null,
    audienceType: "department",
    audienceId: 12,
    keyword: "",
    status: "",
  }, {
    userId: 7,
    view: "summary",
    cycleId: 40,
    periodType: null,
    audienceType: "department",
    audienceId: 12,
    keyword: "",
    status: "",
  }]);
  assert.equal(batchQueries.length, 2);
  for (const query of batchQueries) {
    assert.deepEqual((query as { where: { id: { in: number[] } } }).where.id.in, [70]);
  }
});

test("skips detail storage when the original dashboard exposes no review IDs", async () => {
  dashboardCalls.length = 0;
  batchQueries.length = 0;
  visibleReviewRows = [];

  const rows = await loadHrPerformanceWorkspaceAnalysisRows({
    sourceKey: "hr.performance-review-details",
    requesterId: 7,
    targetType: "personal",
    targetId: 7,
    parameters: {},
  });

  assert.deepEqual(rows, []);
  assert.equal(dashboardCalls.length, 1);
  assert.equal(batchQueries.length, 0);
});

test("rejects more than 5000 visible review IDs before loading detail storage", async () => {
  dashboardCalls.length = 0;
  batchQueries.length = 0;
  visibleReviewRows = Array.from({ length: 5_001 }, (_, index) => ({ id: index + 1 }));

  await assert.rejects(() => loadHrPerformanceWorkspaceAnalysisRows({
    sourceKey: "hr.performance-review-details",
    requesterId: 7,
    targetType: "personal",
    targetId: 7,
    parameters: {},
  }), (error) => (
    error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_limit_exceeded"
  ));
  assert.equal(batchQueries.length, 0);
});

test("fails closed when a visible archived evidence snapshot is not valid JSON", async () => {
  visibleReviewRows = [{ id: 70 }];
  visibleSnapshotJson = "{invalid";

  await assert.rejects(() => loadHrPerformanceWorkspaceAnalysisRows({
    sourceKey: "hr.performance-review-evidence-values",
    requesterId: 7,
    targetType: "personal",
    targetId: 7,
    parameters: {},
  }), (error) => (
    error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_response_invalid"
  ));
});

function reviewRecord(input: {
  readonly id: number;
  readonly employeeId: number;
  readonly employeeCode: string;
  readonly employeeName: string;
  readonly snapshotJson: string;
}) {
  return {
    id: input.id,
    employeeId: input.employeeId,
    okrCycleId: 40,
    approvalRequestId: 80,
    selfScore: 88,
    selfComment: input.id === 70 ? "完成年度重点客户开发" : "不可见自评",
    managerScore: 90,
    managerComment: input.id === 70 ? "目标完成稳定" : "不可见上级评语",
    finalScore: 89,
    finalGrade: "A",
    hrComment: input.id === 70 ? "同意归档" : "不可见 HR 评语",
    archivedAt: new Date("2026-08-05T01:00:00.000Z"),
    version: 2,
    workEvidenceSnapshotJson: input.snapshotJson,
    createdAt: new Date("2026-08-05T01:00:00.000Z"),
    updatedAt: new Date("2026-08-06T02:00:00.000Z"),
    employee: { employeeId: input.employeeCode, name: input.employeeName },
  };
}
