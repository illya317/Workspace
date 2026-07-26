import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";
import type { WorkspaceAnalysisSourceLoadRequest } from "@workspace/platform/server/workspace-analysis-runtime";

import { WORK_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-sources";

mock.module("server-only", { namedExports: {} } as never);

const calls: Array<{ source: string; input: Record<string, unknown> }> = [];
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
mock.module("./project-members", { namedExports: { listProjectMembers: async () => ({ entries: [], total: 0 }) } } as never);
mock.module("./meetings", { namedExports: {
  getMeetingDetail: async () => ({ ok: false, error: "unused" }),
  listMeetings: async () => ({ ok: true, data: { meetings: [] } }),
} } as never);
mock.module("./projects", {
  namedExports: {
    listProjects: async () => ({ projects: [], total: 0 }),
    listProjectGantt: async (input: Record<string, unknown>) => {
      calls.push({ source: "project-gantt", input });
      return projectGanttFixture();
    },
  },
} as never);
mock.module("./work-task-route-command", {
  namedExports: {
    executeAssignedDepartmentWorkItemsRouteCommand: async (input: Record<string, unknown>) => {
      calls.push({ source: "assigned", input });
      return { ok: true, data: assignedFixture() };
    },
    executeWorkPeriodCollectionRouteCommand: async (input: Record<string, unknown>) => {
      calls.push({ source: "period-collection", input });
      return { ok: true, data: periodCollectionFixture() };
    },
    executeWorkReportCollectionRouteCommand: async () => ({ ok: true, data: { period: {}, spaces: [] } }),
  },
} as never);

const { loadWorkWorkspaceAnalysisSource } = await import("./workspace-analysis-source-executor");

test("project Gantt sources preserve viewer-wide baseline-resolved rows and leaders", async () => {
  calls.length = 0;
  const projects = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.project-gantt-projects",
    targetType: "department",
    targetId: 999,
    fields: ["id", "name", "plannedStartDate", "plannedEndDate", "completionPercent"],
  }));
  const leaders = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.project-gantt-leaders",
    targetType: "personal",
    targetId: 7,
    fields: ["projectId", "leaderOrdinal", "leaderName"],
  }));

  assert.deepEqual(projects.rows, [{
    id: 41,
    name: "新厂建设",
    plannedStartDate: "2026-08-01",
    plannedEndDate: "2026-12-31",
    completionPercent: 35,
  }]);
  assert.deepEqual(leaders.rows, [{ projectId: 41, leaderOrdinal: 1, leaderName: "张三" }]);
  assert.deepEqual(calls, Array.from({ length: 2 }, () => ({
    source: "project-gantt",
    input: { userId: 7, includeTasks: false },
  })));
});

test("assigned sources remain requester-wide and distinguish personal-space collaboration", async () => {
  calls.length = 0;
  const groups = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.assigned-plan-groups",
    targetType: "department",
    targetId: 999,
    fields: ["id", "targetType", "targetId", "title", "assignmentKind", "assignerSpaceName", "arrangerEmployeeName"],
    pageSize: 2,
    maxRows: 2,
  }));
  const items = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.assigned-items",
    targetType: "project",
    targetId: 888,
    fields: ["id", "targetType", "targetId", "assignmentKind", "assignedPlanTitle", "content"],
    pageSize: 2,
    maxRows: 2,
  }));

  assert.deepEqual(groups.rows, [
    { id: 101, targetType: "department", targetId: 12, title: "销售目标", assignmentKind: "department_or_project", assignerSpaceName: "销售部", arrangerEmployeeName: null },
    { id: 202, targetType: "personal", targetId: 34, title: "经理个人计划", assignmentKind: "personal_collaboration", assignerSpaceName: null, arrangerEmployeeName: "李经理" },
  ]);
  assert.deepEqual(items.rows, [
    { id: 1001, targetType: "department", targetId: 12, assignmentKind: "department_or_project", assignedPlanTitle: "销售目标", content: "部门事项" },
    { id: 2002, targetType: "personal", targetId: 34, assignmentKind: "personal_collaboration", assignedPlanTitle: "经理个人计划", content: "个人协作事项" },
  ]);
  assert.deepEqual(calls, Array.from({ length: 2 }, () => ({ source: "assigned", input: { userId: 7 } })));
});

test("period collection sources preserve root facts, target membership and normalized overlaps", async () => {
  calls.length = 0;
  const parameters = { cycleId: 10, displayPeriodType: "monthly" } as const;
  const cycles = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.period-collection-cycles",
    targetType: "department",
    targetId: 12,
    parameters,
    fields: ["cycleRole", "id", "rootCycleId", "displayPeriodType", "workdayOverlapCount"],
    pageSize: 2,
    maxRows: 2,
  }));
  const plans = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.period-collection-plans",
    targetType: "department",
    targetId: 12,
    parameters,
    fields: ["rootCycleId", "planId", "targetType", "targetId", "planTitle"],
  }));
  const items = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.period-collection-items",
    targetType: "department",
    targetId: 12,
    parameters,
    fields: ["rootCycleId", "itemId", "planId", "itemContent", "planCycleId"],
  }));
  const overlaps = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.period-collection-overlaps",
    targetType: "department",
    targetId: 12,
    parameters,
    fields: ["subjectKind", "subjectId", "cycleId", "rootCycleId"],
    pageSize: 2,
    maxRows: 2,
  }));

  assert.deepEqual(cycles.rows, [
    { cycleRole: "root", id: 10, rootCycleId: 10, displayPeriodType: "monthly", workdayOverlapCount: 250 },
    { cycleRole: "overlap", id: 11, rootCycleId: 10, displayPeriodType: "monthly", workdayOverlapCount: 23 },
  ]);
  assert.deepEqual(plans.rows, [{ rootCycleId: 10, planId: 20, targetType: "department", targetId: 12, planTitle: "年度销售目标" }]);
  assert.deepEqual(items.rows, [{ rootCycleId: 10, itemId: 30, planId: 20, itemContent: "七月回款 100 万", planCycleId: 10 }]);
  assert.deepEqual(overlaps.rows, [
    { subjectKind: "plan", subjectId: 20, cycleId: 11, rootCycleId: 10 },
    { subjectKind: "item", subjectId: 30, cycleId: 11, rootCycleId: 10 },
  ]);
  assert.deepEqual(calls, [false, false, true, true].map((includeItems) => ({
    source: "period-collection",
    input: { userId: 7, targetType: "department", targetId: 12, ...parameters, includeItems },
  })));
});

function projectGanttFixture() {
  return {
    projects: [{
      id: 41,
      name: "新厂建设",
      status: "active",
      projectType: "company",
      projectLevel: "重点",
      leadingDepartmentId: 12,
      leadingDepartmentCode: "GOV-X",
      leadingDepartmentName: "运营部",
      workspaceEnabled: true,
      leaderNames: ["张三"],
      stages: [],
      actualStartDate: null,
      actualEndDate: null,
      completionPercent: 35,
      plannedStartDate: "2026-08-01",
      plannedEndDate: "2026-12-31",
    }],
    tasks: [],
  };
}

function assignedFixture() {
  return {
    works: [],
    collaborationWorks: [],
    planGroups: [assignedGroup(101, "department", 12, "销售目标", "部门事项", "销售部", null, 1001)],
    collaborationPlanGroups: [assignedGroup(202, "personal", 34, "经理个人计划", "个人协作事项", null, "李经理", 2002)],
  };
}

function assignedGroup(
  planId: number,
  targetType: string,
  targetId: number,
  title: string,
  content: string,
  assignerSpaceName: string | null,
  arrangerEmployeeName: string | null,
  itemId: number,
) {
  const item = { id: itemId, planId, targetType, targetId, content };
  return {
    plan: { id: planId, targetType, targetId, kind: planId === 101 ? "okr" : "routine", title },
    works: [item],
    assignedWorks: [item],
    assignedWorkIds: [itemId],
    assignerSpaceName,
    arrangerEmployeeName,
  };
}

function periodCollectionFixture() {
  return {
    rootCycle: cycle(10, "yearly", "2026-01-01", "2026-12-31", 250),
    displayPeriodType: "monthly",
    cycles: [cycle(11, "monthly", "2026-07-01", "2026-07-31", 23)],
    plans: [{
      plan: {
        id: 20,
        targetType: "department",
        targetId: 12,
        kind: "okr",
        title: "年度销售目标",
        status: "active",
        okrCycleId: 10,
        okrCycleCode: "Y2026",
        okrCycleLabel: "2026 年",
        plannedStartDate: "2026-01-01",
        plannedEndDate: "2026-12-31",
      },
      overlapCycleIds: [11],
    }],
    items: [{
      item: {
        id: 30,
        targetType: "department",
        targetId: 12,
        itemType: "key_result",
        content: "七月回款 100 万",
        status: "active",
        plannedStartDate: "2026-07-01",
        plannedEndDate: "2026-07-31",
      },
      planId: 20,
      planTitle: "年度销售目标",
      planCycleId: 10,
      planCycleLabel: "2026 年",
      overlapCycleIds: [11],
    }],
  };
}

function cycle(id: number, periodType: string, startDate: string, endDate: string, workdayOverlapCount: number) {
  return { id, code: `C${id}`, label: `周期 ${id}`, periodType, startDate, endDate, workdayOverlapCount };
}

function request(input: {
  sourceKey: string;
  targetType: "personal" | "department" | "project";
  targetId: number;
  parameters?: Readonly<Record<string, string | number | boolean>>;
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
    parameters: input.parameters ?? {},
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
