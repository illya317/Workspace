import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";
import {
  WorkspaceAnalysisRuntimeError,
  type WorkspaceAnalysisSourceLoadRequest,
} from "@workspace/platform/server/workspace-analysis-runtime";

import { WORK_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-sources";
import type { WorkKpiResultsData } from "./workspace-analysis-kpi-result-sources";
import type { WorkKpiScorecardData } from "./workspace-analysis-kpi-scorecard-sources";
import type {
  WorkProjectPlanBaselinesData,
  WorkProjectPlanGanttData,
  WorkProjectPlanPhasesData,
} from "./workspace-analysis-project-plan-detail-sources";

mock.module("server-only", { namedExports: {} } as never);

const calls: Array<{ service: string; input: Record<string, unknown> }> = [];
let scorecardResult: { ok: true; data: WorkKpiScorecardData } | { ok: false; error: string; status: number } = {
  ok: true,
  data: scorecardFixture(),
};
let kpiResult: { ok: true; data: WorkKpiResultsData } | { ok: false; error: string; status: number } = {
  ok: true,
  data: resultFixture(),
};

mock.module("./workspace-analysis-source-access", {
  namedExports: {
    buildWorkWorkspaceAnalysisSourceCatalog: () => createWorkspaceAnalysisSourceCatalog(WORK_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS),
    canDiscoverWorkWorkspaceAnalysisSource: async () => true,
  },
} as never);
mock.module("./department-collaboration-route-command", {
  namedExports: { executeListDepartmentCollaborationsCommand: async () => ({ ok: true, data: { collaborations: [] } }) },
} as never);
mock.module("./project-members", { namedExports: { listProjectMembers: async () => ({ entries: [], total: 0 }) } } as never);
mock.module("./projects/plan", {
  namedExports: {
    listProjectPlanBaselines: async (input: Record<string, unknown>) => {
      calls.push({ service: "project-baselines", input });
      return { ok: true, data: projectBaselinesFixture() };
    },
    listProjectPlanGantt: async (input: Record<string, unknown>) => {
      calls.push({ service: "project-gantt", input });
      return { ok: true, data: projectGanttFixture() };
    },
    listProjectPlanPhases: async (input: Record<string, unknown>) => {
      calls.push({ service: "project-phases", input });
      return { ok: true, data: projectPhasesFixture() };
    },
  },
} as never);
mock.module("./projects", { namedExports: {
  listProjectGantt: async () => ({ projects: [], tasks: [] }),
  listProjects: async () => ({ projects: [], total: 0 }),
} } as never);
mock.module("./meetings/application", { namedExports: {
  getMeetingDetail: async () => ({ ok: false, error: "unused" }),
  listMeetings: async () => ({ ok: true, data: { meetings: [] } }),
} } as never);
mock.module("./work-kpi-route-command", {
  namedExports: {
    executeGetKpiResultsCommand: async (input: Record<string, unknown>) => {
      calls.push({ service: "kpi-results", input });
      return kpiResult;
    },
    executeGetKpiScorecardCommand: async (input: Record<string, unknown>) => {
      calls.push({ service: "kpi-scorecard", input });
      return scorecardResult;
    },
    executeListKpiDefinitionsCommand: async () => ({ ok: true, data: { definitions: [] } }),
  },
} as never);
mock.module("./work-plan-route-command", {
  namedExports: { executeListWorkPlansCommand: async () => ({ ok: true, data: { plans: [] } }) },
} as never);
mock.module("./work-task-route-command", { namedExports: {
  executeAssignedDepartmentWorkItemsRouteCommand: async () => ({ ok: false, error: "unused" }),
  executeWorkPeriodCollectionRouteCommand: async () => ({ ok: false, error: "unused" }),
  executeWorkReportCollectionRouteCommand: async () => ({ ok: false, error: "unused" }),
} } as never);
mock.module("./works", { namedExports: { getWorkItems: async () => [] } } as never);

const { loadWorkWorkspaceAnalysisSource } = await import("./workspace-analysis-source-executor");

test("KPI detail sources bind planId and delegate every load to the original plan service", async () => {
  calls.length = 0;
  scorecardResult = { ok: true, data: scorecardFixture() };
  kpiResult = { ok: true, data: resultFixture() };

  const scorecardCases = [
    ["work.kpi-scorecard-plans", ["id", "totalWeight"], [{ id: 7, totalWeight: 100 }]],
    ["work.kpi-scorecard-assignments", ["id", "currentValue"], [{ id: 11, currentValue: 99 }]],
    ["work.kpi-scorecard-definitions", ["assignmentId", "code"], [{ assignmentId: 11, code: "FIN-001" }]],
    ["work.kpi-scorecard-source-assignments", ["assignmentId", "id"], [{ assignmentId: 11, id: 9 }]],
    ["work.kpi-scorecard-definition-snapshot-values", ["assignmentId", "path", "textValue"], [
      { assignmentId: 11, path: "$.name", textValue: "回款率" },
      { assignmentId: 11, path: "$.schemaVersion", textValue: "1" },
    ]],
    ["work.kpi-scorecard-scoring-rule-values", ["path", "numberValue"], [
      { path: "$.capScore", numberValue: 120 },
      { path: "$.floorScore", numberValue: 0 },
      { path: "$.kind", numberValue: null },
      { path: "$.targetScore", numberValue: 100 },
    ]],
    ["work.kpi-scorecard-definition-scoring-rule-values", ["path", "numberValue"], [
      { path: "$.capScore", numberValue: 120 },
      { path: "$.floorScore", numberValue: 0 },
      { path: "$.kind", numberValue: null },
      { path: "$.targetScore", numberValue: 100 },
    ]],
    ["work.kpi-scorecard-evidence-tasks", ["assignmentId", "taskId"], [{ assignmentId: 11, taskId: 91 }]],
    ["work.kpi-scorecard-latest-results", ["assignmentId", "id"], [{ assignmentId: 11, id: 81 }]],
  ] as const;
  for (const [sourceKey, fields, expected] of scorecardCases) {
    const loaded = await loadWorkWorkspaceAnalysisSource(request(sourceKey, fields, { planId: 7 }));
    assert.deepEqual(loaded.rows, expected);
  }

  const resultCases = [
    ["work.kpi-result-summaries", ["planId", "weightedScore"], [{ planId: 7, weightedScore: 105 }]],
    ["work.kpi-result-previews", ["assignmentId", "calculatedScore"], [{ assignmentId: 11, calculatedScore: 105 }]],
    ["work.kpi-result-work-reports", ["planId", "id"], [{ planId: 7, id: 61 }]],
    ["work.kpi-result-definition-snapshot-values", ["path", "textValue"], [
      { path: "$.name", textValue: "回款率" },
      { path: "$.schemaVersion", textValue: "1" },
    ]],
    ["work.kpi-result-assignment-snapshot-values", ["path", "numberValue"], [
      { path: "$.assignmentId", numberValue: 11 },
      { path: "$.schemaVersion", numberValue: 1 },
    ]],
    ["work.kpi-result-scoring-rule-values", ["path", "numberValue"], [
      { path: "$.capScore", numberValue: 120 },
      { path: "$.floorScore", numberValue: 0 },
      { path: "$.kind", numberValue: null },
      { path: "$.targetScore", numberValue: 100 },
    ]],
    ["work.kpi-result-evidence-values", ["path", "textValue"], [
      { path: "$.schemaVersion", textValue: "1" },
      { path: "$.tasks[0].content", textValue: "核对银行回单" },
    ]],
  ] as const;
  for (const [sourceKey, fields, expected] of resultCases) {
    const loaded = await loadWorkWorkspaceAnalysisSource(request(sourceKey, fields, { planId: 7 }));
    assert.deepEqual(loaded.rows, expected);
  }

  assert.deepEqual(calls, [
    ...Array.from({ length: scorecardCases.length }, () => ({ service: "kpi-scorecard", input: { actorUserId: 7, planId: 7 } })),
    ...Array.from({ length: resultCases.length }, () => ({ service: "kpi-results", input: { actorUserId: 7, planId: 7 } })),
  ]);
});

test("project plan detail sources bind planProjectId and call object-authorizing services directly", async () => {
  calls.length = 0;
  const cases = [
    ["work.project-plan-phases", ["id", "name"], [{ id: 31, name: "设计" }]],
    ["work.project-plan-baselines", ["projectId", "id"], [{ projectId: 7, id: 41 }]],
    ["work.project-plan-gantt-items", ["projectId", "id"], [{ projectId: 7, id: 7 }]],
    ["work.project-plan-gantt-owners", ["projectId", "ownerName"], [{ projectId: 7, ownerName: "张三" }]],
    ["work.project-plan-dependencies", ["projectId", "id"], [{ projectId: 7, id: 51 }]],
    ["work.project-plan-baseline-items", ["projectId", "baselineId", "id"], [{ projectId: 7, baselineId: 41, id: 61 }]],
  ] as const;
  for (const [sourceKey, fields, expected] of cases) {
    const loaded = await loadWorkWorkspaceAnalysisSource(request(sourceKey, fields, { planProjectId: 7 }));
    assert.deepEqual(loaded.rows, expected);
  }
  assert.deepEqual(calls, [
    { service: "project-phases", input: { userId: 7, projectId: 7 } },
    { service: "project-baselines", input: { userId: 7, projectId: 7 } },
    ...Array.from({ length: 4 }, () => ({ service: "project-gantt", input: { userId: 7, projectId: 7 } })),
  ]);
});

test("detail sources fail closed for missing parameters, service denial and row overflow", async () => {
  calls.length = 0;
  await assert.rejects(
    () => loadWorkWorkspaceAnalysisSource(request("work.kpi-scorecard-plans", ["id"], {})),
    (error: unknown) => error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_response_invalid",
  );
  await assert.rejects(
    () => loadWorkWorkspaceAnalysisSource(request("work.project-plan-phases", ["id"], {})),
    (error: unknown) => error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_response_invalid",
  );
  assert.deepEqual(calls, []);

  scorecardResult = { ok: false, error: "无权限查看 KPI 计分卡", status: 403 };
  await assert.rejects(
    () => loadWorkWorkspaceAnalysisSource(request("work.kpi-scorecard-plans", ["id"], { planId: 7 })),
    (error: unknown) => error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_forbidden",
  );

  scorecardResult = { ok: true, data: {
    ...scorecardFixture(),
    assignments: [scorecardFixture().assignments[0]!, { ...scorecardFixture().assignments[0]!, id: 12 }],
  } };
  await assert.rejects(
    () => loadWorkWorkspaceAnalysisSource(request("work.kpi-scorecard-assignments", ["id"], { planId: 7 }, 1)),
    (error: unknown) => error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_limit_exceeded",
  );
});

function request(
  sourceKey: string,
  fields: readonly string[],
  parameters: Readonly<Record<string, string | number | boolean>>,
  maxRows = 50,
): WorkspaceAnalysisSourceLoadRequest {
  const definition = createWorkspaceAnalysisSourceCatalog(WORK_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS).get(sourceKey, 1)!;
  const boundedMaxRows = Math.min(maxRows, definition.limits.maxRows);
  return {
    requesterId: 7,
    targetType: "department",
    targetId: 999,
    ownerUnitId: "work",
    sourceKey,
    sourceVersion: 1,
    fields: [...fields],
    parameters,
    limits: {
      maxRows: boundedMaxRows,
      maxGroups: Math.min(20, definition.limits.maxGroups),
      pageSize: Math.min(boundedMaxRows, definition.limits.maxPageSize),
      maxPages: 1,
      maxBytes: Math.min(500_000, definition.limits.maxBytes),
      timeoutMs: Math.min(1_000, definition.limits.timeoutMs),
    },
    signal: new AbortController().signal,
  };
}

function scorecardFixture(): WorkKpiScorecardData {
  return {
    plan: { id: 7, title: "年度经营目标", targetType: "department", targetId: 3, okrCycleId: 2026, okrStage: "kr_approved", status: "active", governanceRevision: 4 },
    assignments: [{
      id: 11, version: 3, workPlanId: 7, definitionId: 21,
      definition: {
        id: 21, code: "FIN-001", version: 2, status: "active", name: "回款率", description: "说明",
        valueType: "number", displayType: "percent", unit: "%", direction: "higher_is_better",
        scoringRule: { kind: "linear", targetScore: 100, floorScore: 0, capScore: 120 }, measurementMode: "manual",
        ownerDepartmentId: 3, ownerDepartmentCode: "FIN", ownerDepartmentName: "财务部", referenceCount: 2,
        createdByUserId: 5, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
      },
      workItemId: 31, workItemContent: "回款率", objectiveWorkItemId: 30, workItemStatus: "active",
      ownerEmployeeId: 41, ownerEmployeeNumber: "E041", ownerEmployeeName: "张三", sourceAssignmentId: 9,
      sourceAssignment: { id: 9, workPlanId: 6, definitionId: 21, title: "回款率", planTitle: "上年目标", targetType: "department", targetId: 3 },
      relationKind: "decompose", weight: 100, baselineValue: 90, targetValue: 98, targetLowerBound: null, targetUpperBound: null, currentValue: 99,
      definitionSnapshot: { schemaVersion: 1, name: "回款率" },
      scoringRule: { kind: "linear", targetScore: 100, floorScore: 0, capScore: 120 },
      evidence: [{ taskId: 91, content: "核对银行回单", status: "done", completedAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-02T00:00:00.000Z", note: "银行回单" }],
      latestResult: { id: 81, version: 2, actualValue: 99, scoreBeforeAdjustment: 101, confirmedScore: 105, adjustmentReason: "提前", approvedAt: "2026-07-03T00:00:00.000Z" },
      createdAt: "2026-01-03T00:00:00.000Z", updatedAt: "2026-07-02T00:00:00.000Z",
    }],
    totalWeight: 100,
  } as unknown as WorkKpiScorecardData;
}

function resultFixture(): WorkKpiResultsData {
  return {
    results: [{ assignmentId: 11, weight: 100, actualValue: 99, calculatedScore: 105,
      definitionSnapshot: { schemaVersion: 1, name: "回款率" },
      assignmentSnapshot: { schemaVersion: 1, assignmentId: 11 },
      scoringRule: { kind: "linear", targetScore: 100, floorScore: 0, capScore: 120 },
      evidence: { schemaVersion: 1, tasks: [{ content: "核对银行回单" }] },
    }],
    weightedScore: 105,
    workReport: { id: 61, periodType: "year", periodStart: "2026-01-01T00:00:00.000Z", periodEnd: "2026-12-31T00:00:00.000Z", submittedAt: "2026-07-02T00:00:00.000Z" },
  } as WorkKpiResultsData;
}

function projectPhasesFixture(): WorkProjectPlanPhasesData {
  return { phases: [{ id: 31, version: 1, projectId: 7, sequenceNo: 1, name: "设计", plannedStartDate: "2026-07-01", plannedEndDate: "2026-07-10", note: null }] } as WorkProjectPlanPhasesData;
}

function projectBaselinesFixture(): WorkProjectPlanBaselinesData {
  return { baselines: [{ id: 41, name: "V1", note: null, isActive: true, createdAt: "2026-07-02T00:00:00.000Z" }] } as WorkProjectPlanBaselinesData;
}

function projectGanttFixture(): WorkProjectPlanGanttData {
  return {
    projectId: 7,
    permissions: { canView: true },
    phases: projectPhasesFixture().phases,
    items: [{ kind: "project", id: 7, name: "项目甲", parentKind: null, parentId: null, phaseId: null, status: "active", projectLevel: "A", isMilestone: true, ownerNames: ["张三"], actualStartDate: null, actualEndDate: null, plannedStartDate: "2026-07-01", plannedEndDate: "2026-07-31" }],
    dependencies: [{ id: 51, predecessorKind: "project", predecessorId: 7, successorKind: "project", successorId: 8, dependencyType: "finish_start", lagDays: 0 }],
    activeBaseline: { id: 41, name: "V1", note: null, createdAt: "2026-07-02T00:00:00.000Z", items: [{ id: 61, itemKind: "project", itemId: 7, parentKind: null, parentId: null, phaseId: null, name: "项目甲", status: "active", isMilestone: true, plannedStartDate: "2026-07-01", plannedEndDate: "2026-07-31" }] },
  } as unknown as WorkProjectPlanGanttData;
}
