import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";
import {
  WorkspaceAnalysisRuntimeError,
  type WorkspaceAnalysisSourceLoadRequest,
} from "@workspace/platform/server/workspace-analysis-runtime";

import { WORK_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-sources";

mock.module("server-only", { namedExports: {} } as never);

const calls: Record<string, unknown>[] = [];
mock.module("./workspace-analysis-source-access", {
  namedExports: {
    buildWorkWorkspaceAnalysisSourceCatalog: () => createWorkspaceAnalysisSourceCatalog(WORK_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS),
    canDiscoverWorkWorkspaceAnalysisSource: async () => true,
  },
} as never);
mock.module("./department-collaboration-route-command", {
  namedExports: { executeListDepartmentCollaborationsCommand: async () => ({ ok: true, data: { collaborations: [] } }) },
} as never);
mock.module("./work-kpi-route-command", {
  namedExports: {
    executeListKpiDefinitionsCommand: async () => ({ ok: true, data: { definitions: [] } }),
  },
} as never);
mock.module("./work-plan-route-command", {
  namedExports: { executeListWorkPlansCommand: async () => ({ ok: true, data: { plans: [] } }) },
} as never);
mock.module("./works", { namedExports: { getWorkItems: async () => [] } } as never);
mock.module("./projects", { namedExports: {
  listProjectGantt: async () => ({ projects: [], tasks: [] }),
  listProjects: async () => ({ projects: [], total: 0 }),
} } as never);
mock.module("./project-members", { namedExports: { listProjectMembers: async () => ({ entries: [], total: 0 }) } } as never);
mock.module("./meetings", { namedExports: {
  getMeetingDetail: async () => ({ ok: false, error: "unused" }),
  listMeetings: async () => ({ ok: true, data: { meetings: [] } }),
} } as never);
mock.module("./work-task-route-command", {
  namedExports: {
    executeAssignedDepartmentWorkItemsRouteCommand: async () => ({ ok: false, error: "unused" }),
    executeWorkPeriodCollectionRouteCommand: async () => ({ ok: false, error: "unused" }),
    executeWorkReportCollectionRouteCommand: async (input: Record<string, unknown>) => {
      calls.push(input);
      return { ok: true, data: reportCollectionFixture() };
    },
  },
} as never);

const { loadWorkWorkspaceAnalysisSource } = await import("./workspace-analysis-source-executor");

test("Work report sources flatten only saved viewer-visible facts with report and space identity", async () => {
  calls.length = 0;
  const parameters = { periodType: "monthly", periodStart: "2026-07-01" } as const;
  const reports = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.reports",
    targetType: "department",
    targetId: 999,
    parameters,
    fields: ["id", "targetType", "targetId", "spaceName", "spaceSubtitle", "periodType", "reportStage", "submittedBy"],
    pageSize: 2,
    maxRows: 2,
  }));
  const items = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.report-items",
    targetType: "project",
    targetId: 888,
    parameters,
    fields: ["id", "reportId", "targetType", "targetId", "spaceName", "periodStart", "title", "currentKeyResult"],
    pageSize: 2,
    maxRows: 2,
  }));

  assert.deepEqual(reports.rows, [{
    id: 901,
    targetType: "department",
    targetId: 12,
    spaceName: "销售部",
    spaceSubtitle: "部门空间",
    periodType: "monthly",
    reportStage: "final",
    submittedBy: 7,
  }]);
  assert.deepEqual(items.rows, [
    reportItemProjection(1001, "完成客户回访", "已回访 22 家"),
    reportItemProjection(1002, "临时客户支持", "处理完成"),
  ]);
  assert.equal(JSON.stringify(reports).includes("groups"), false);
  assert.equal(JSON.stringify(reports).includes("actionRuntime"), false);
  assert.deepEqual(calls, Array.from({ length: 2 }, () => ({ userId: 7, ...parameters })));
});

test("Work report item source fails closed instead of truncating an over-budget collection", async () => {
  calls.length = 0;
  await assert.rejects(
    () => loadWorkWorkspaceAnalysisSource(request({
      sourceKey: "work.report-items",
      targetType: "personal",
      targetId: 7,
      parameters: { periodType: "monthly", periodStart: "2026-07-01" },
      fields: ["id", "reportId"],
      maxRows: 1,
    })),
    (error) => error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_limit_exceeded",
  );
  assert.deepEqual(calls, [{ userId: 7, periodType: "monthly", periodStart: "2026-07-01" }]);
});

function reportItemProjection(id: number, title: string, currentKeyResult: string) {
  return {
    id,
    reportId: 901,
    targetType: "department",
    targetId: 12,
    spaceName: "销售部",
    periodStart: "2026-07-01",
    title,
    currentKeyResult,
  };
}

function reportCollectionFixture() {
  return {
    period: { periodType: "monthly", periodStart: "2026-07-01", periodEnd: "2026-07-31" },
    spaces: [
      {
        targetType: "personal",
        targetId: 7,
        name: "我的工作",
        subtitle: "个人工作台",
        status: "missing",
        reports: [],
      },
      {
        targetType: "department",
        targetId: 12,
        name: "销售部",
        subtitle: "部门空间",
        status: "submitted",
        reports: [{
          id: 901,
          targetType: "department",
          targetId: 12,
          periodType: "monthly",
          reportStage: "final",
          periodStart: "2026-07-01",
          periodEnd: "2026-07-31",
          submittedBy: 7,
          submitterName: "张三",
          submittedAt: "2026-07-31T08:00:00.000Z",
          updatedAt: "2026-07-31T08:01:00.000Z",
          items: [
            reportItemFixture(1001, "完成客户回访", "已回访 22 家", 1),
            reportItemFixture(1002, "临时客户支持", "处理完成", 2),
          ],
          groups: [{ key: "okr:501", title: "七月销售计划", kind: "okr", workPlanId: 501, items: [] }],
          actionRuntime: { hidden: true },
        }],
      },
    ],
  };
}

function reportItemFixture(id: number, title: string, currentKeyResult: string, sortOrder: number) {
  return {
    id,
    workPlanId: id === 1001 ? 501 : null,
    workItemId: id === 1001 ? 601 : null,
    title,
    workPlanTitle: id === 1001 ? "七月销售计划" : "",
    workPlanKind: id === 1001 ? "okr" : "routine",
    workItemType: "task",
    parentWorkItemId: id === 1001 ? 600 : null,
    parentTitle: id === 1001 ? "提升续约率" : "",
    objectiveTitleSnapshot: id === 1001 ? "提升续约率" : "",
    keyResultTitleSnapshot: id === 1001 ? "回访重点客户" : "",
    reportItemKind: id === 1001 ? "current" : "routine",
    workItemStatusSnapshot: "done",
    snapshotPlannedStartDate: id === 1001 ? "2026-07-01" : null,
    snapshotPlannedEndDate: id === 1001 ? "2026-07-31" : null,
    snapshotActualEndDate: id === 1001 ? "2026-07-29" : null,
    snapshotCompletedAt: id === 1001 ? "2026-07-29" : null,
    previousPlanSnapshot: id === 1001 ? "回访 20 家" : "",
    currentKeyResult,
    nextObjective: id === 1001 ? "跟进续约" : "",
    note: id === 1001 ? "重点客户已标记" : "",
    selfScore: id === 1001 ? 95 : null,
    performanceScore: id === 1001 ? 92 : null,
    sortOrder,
  };
}

function request(input: {
  sourceKey: string;
  targetType: "personal" | "department" | "project";
  targetId: number;
  parameters: Readonly<Record<string, string | number | boolean>>;
  fields: readonly string[];
  pageSize?: number;
  maxRows?: number;
}): WorkspaceAnalysisSourceLoadRequest {
  return {
    requesterId: 7,
    targetType: input.targetType,
    targetId: input.targetId,
    ownerUnitId: "work",
    sourceKey: input.sourceKey,
    sourceVersion: 1,
    parameters: input.parameters,
    fields: input.fields,
    limits: {
      maxRows: input.maxRows ?? 1,
      maxGroups: 20,
      pageSize: input.pageSize ?? 1,
      maxPages: 1,
      maxBytes: 100_000,
      timeoutMs: 1_000,
    },
    signal: new AbortController().signal,
  };
}
