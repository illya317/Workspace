import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";
import {
  WorkspaceAnalysisRuntimeError,
  type WorkspaceAnalysisSourceLoadRequest,
} from "@workspace/platform/server/workspace-analysis-runtime";
import { WORK_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-sources";
mock.module("server-only", { namedExports: {} } as never);
let readAllowed = true;
const calls: Array<{ source: string; input: Record<string, unknown> }> = [];
mock.module("./workspace-analysis-source-access", {
  namedExports: {
    buildWorkWorkspaceAnalysisSourceCatalog: () => createWorkspaceAnalysisSourceCatalog(WORK_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS),
    canDiscoverWorkWorkspaceAnalysisSource: async () => readAllowed,
  },
} as never);
mock.module("./works", {
  namedExports: {
    getWorkItems: async (input: Record<string, unknown>) => {
      calls.push({ source: "items", input });
      return [
        {
          id: 1,
          planId: 6,
          targetType: "department",
          targetId: 12,
          itemType: "key_result",
          status: "active",
          content: "目标一",
          evidenceTasks: [{ taskWorkItemId: 2, note: "完成初稿", sortOrder: 1 }],
          participants: [{ id: 11, workItemId: 1, name: "张三", wxUserId: "wx-11", createdAt: "2026-07-01T00:00:00.000Z" }],
          hidden: "omit",
        },
        {
          id: 2,
          planId: 6,
          targetType: "department",
          targetId: 12,
          itemType: "task",
          status: "done",
          content: "目标二",
          evidenceTasks: [],
          participants: [],
          hidden: "omit",
        },
      ];
    },
  },
} as never);
mock.module("./work-plan-route-command", {
  namedExports: {
    executeListWorkPlansCommand: async (input: Record<string, unknown>) => {
      calls.push({ source: "plans", input });
      return {
        ok: true,
        data: {
          plans: [
            {
              id: 3,
              title: "年度计划",
              targetType: input.targetType,
              targetId: input.targetId,
              objectiveApprovalSnapshotJson: "{\"review\":{\"score\":95,\"confirmed\":true},\"comment\":\"通过\"}",
              krApprovalSnapshotJson: "{broken",
              governance: { hidden: true },
            },
            {
              id: 4,
              title: "季度计划",
              targetType: input.targetType,
              targetId: input.targetId,
              objectiveApprovalSnapshotJson: "   ",
              krApprovalSnapshotJson: "null",
              governance: { hidden: true },
            },
          ],
        },
      };
    },
  },
} as never);
mock.module("./department-collaboration-route-command", {
  namedExports: {
    executeListDepartmentCollaborationsCommand: async (input: Record<string, unknown>) => {
      calls.push({ source: "department-collaborations", input });
      return {
        ok: true,
        data: {
          collaborations: [{
            id: 31,
            title: "销售与供应协作",
            role: "responsible",
            responsibleDepartment: { id: 12, code: "D012", name: "销售部" },
            enablingDepartments: [{
              id: 301, departmentId: 8, departmentCode: "D008", departmentName: "供应部",
              responseStatus: "accepted", responseNote: "已确认",
              respondedAt: "2026-07-03T00:00:00.000Z",
            }],
            responsiblePositions: [{
              id: 401, code: "P401", name: "销售经理", departmentId: 12,
              departmentCode: "D012", departmentName: "销售部",
            }],
            executorPositions: [{
              id: 402, code: "P402", name: "供应专员", departmentId: 8,
              departmentCode: "D008", departmentName: "供应部",
            }],
            workPlans: [{
              id: 501,
              title: "三季度交付计划",
              status: "active",
              targetType: "department",
              targetId: 12,
              plannedStartDate: "2026-07-01",
              plannedEndDate: "2026-09-30",
            }],
            workItems: [{
              id: 601,
              planId: 501,
              content: "确认供应排期",
              status: "active",
              targetType: "department",
              targetId: 12,
              plannedStartDate: "2026-07-05",
              plannedEndDate: "2026-07-10",
              ownerEmployeeName: "王五",
            }],
          }],
        },
      };
    },
  },
} as never);
mock.module("./work-kpi-route-command", {
  namedExports: {
    executeListKpiDefinitionsCommand: async (input: Record<string, unknown>) => {
      calls.push({ source: "kpi-definitions", input });
      return {
        ok: true,
        data: {
          definitions: [{
            id: 71,
            code: "KPI-REV",
            version: 3,
            status: "active",
            name: "销售收入",
            scoringRule: { kind: "linear", targetScore: 100, floorScore: 60, capScore: 120 },
            ownerDepartmentId: 12,
          }],
        },
      };
    },
  },
} as never);
mock.module("./work-task-route-command", { namedExports: {
  executeAssignedDepartmentWorkItemsRouteCommand: async () => ({ ok: false, error: "unused" }),
  executeWorkPeriodCollectionRouteCommand: async () => ({ ok: false, error: "unused" }),
  executeWorkReportCollectionRouteCommand: async () => ({ ok: true, data: { period: {}, spaces: [] } }),
} } as never);
mock.module("./projects", {
  namedExports: {
    listProjectGantt: async () => ({ projects: [], tasks: [] }),
    listProjects: async (input: Record<string, unknown>) => {
      calls.push({ source: "projects", input });
      return {
        projects: [{
          id: 4,
          code: "PRJ-004",
          name: "项目甲",
          enablingDepartments: [{ id: 8, code: "D008", name: "技术部" }],
          permissions: { canEdit: true },
        }],
        total: 1,
      };
    },
  },
} as never);
mock.module("./project-members", {
  namedExports: {
    listProjectMembers: async (input: Record<string, unknown>) => {
      calls.push({ source: "project-members", input });
      return { entries: [{ employeeNumber: "E001", role: "负责人", version: 2 }], total: 1 };
    },
  },
} as never);
mock.module("./meetings/application", {
  namedExports: {
    getMeetingDetail: async () => ({ ok: false, error: "unused" }),
    listMeetings: async (input: Record<string, unknown>) => {
      calls.push({ source: "meetings", input });
      return {
        ok: true,
        data: {
          meetings: [{
            id: 5,
            title: "经营会",
            startAt: "2026-07-02T01:00:00.000Z",
            participants: [{
              id: 15,
              userId: 9,
              userName: "李四",
              role: "participant",
              canVote: false,
              attendanceStatus: "present",
            }],
          }],
        },
      };
    },
  },
} as never);
const { loadWorkWorkspaceAnalysisSource } = await import("./workspace-analysis-source-executor");
test("Work item executor forces target scope and reads the public DTO only once across runtime pages", async () => {
  calls.length = 0;
  readAllowed = true;
  const result = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.items",
    targetType: "department",
    targetId: 12,
    parameters: { planId: 6, category: "non-routine", includeArchived: true },
    fields: ["id", "content"],
    pageSize: 1,
    maxRows: 2,
    maxPages: 2,
  }));

  assert.deepEqual(result.rows, [{ id: 1, content: "目标一" }, { id: 2, content: "目标二" }]);
  assert.deepEqual(calls, [{
    source: "items",
    input: {
      targetType: "department",
      targetId: 12,
      planId: 6,
      category: "non-routine",
      periodType: undefined,
      periodStart: undefined,
      includeArchived: true,
    },
  }]);
  assert.equal(JSON.stringify(result).includes("hidden"), false);
});
test("Work owner executor dispatches plans, projects, project members and meetings through public services", async () => {
  calls.length = 0;
  await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.plans",
    targetType: "personal",
    targetId: 7,
    parameters: { kind: "okr" },
    fields: ["id", "title"],
    pageSize: 2,
    maxRows: 2,
  }));
  await loadWorkWorkspaceAnalysisSource(request({ sourceKey: "work.projects", targetType: "department", targetId: 12, parameters: { keyword: "甲" }, fields: ["id", "name"] }));
  await loadWorkWorkspaceAnalysisSource(request({ sourceKey: "work.project-members", targetType: "project", targetId: 21, parameters: { keyword: "E001" }, fields: ["employeeNumber", "role"] }));
  await loadWorkWorkspaceAnalysisSource(request({ sourceKey: "work.meetings", targetType: "personal", targetId: 7, parameters: { typeId: 2 }, fields: ["id", "title"] }));

  assert.deepEqual(calls, [
    { source: "plans", input: { userId: 7, targetType: "personal", targetId: 7, kind: "okr", includeArchived: false } },
    { source: "projects", input: { userId: 7, keyword: "甲", page: 1, pageSize: 500, archived: false } },
    { source: "project-members", input: { userId: 7, projectId: 21, keyword: "E001", page: 1, pageSize: 500 } },
    { source: "meetings", input: { userId: 7, typeId: 2 } },
  ]);
});

test("Work child executors expand only public parent DTO collections", async () => {
  calls.length = 0;
  const evidence = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.item-evidence",
    targetType: "department",
    targetId: 12,
    parameters: { planId: 6 },
    fields: ["workItemId", "taskWorkItemId", "note", "sortOrder"],
  }));
  const participants = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.item-participants",
    targetType: "department",
    targetId: 12,
    parameters: { planId: 6 },
    fields: ["id", "workItemId", "name", "wxUserId", "createdAt"],
  }));
  const enablingDepartments = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.project-enabling-departments",
    targetType: "project",
    targetId: 21,
    fields: ["projectId", "departmentId", "departmentCode", "departmentName"],
  }));
  const meetingParticipants = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.meeting-participants",
    targetType: "personal",
    targetId: 7,
    fields: ["meetingId", "id", "userId", "userName", "role", "canVote", "attendanceStatus"],
  }));

  assert.deepEqual(evidence.rows, [{ workItemId: 1, taskWorkItemId: 2, note: "完成初稿", sortOrder: 1 }]);
  assert.deepEqual(participants.rows, [{
    id: 11,
    workItemId: 1,
    name: "张三",
    wxUserId: "wx-11",
    createdAt: "2026-07-01T00:00:00.000Z",
  }]);
  assert.deepEqual(enablingDepartments.rows, [{
    projectId: 4,
    departmentId: 8,
    departmentCode: "D008",
    departmentName: "技术部",
  }]);
  assert.deepEqual(meetingParticipants.rows, [{
    meetingId: 5,
    id: 15,
    userId: 9,
    userName: "李四",
    role: "participant",
    canVote: false,
    attendanceStatus: "present",
  }]);
  assert.deepEqual(calls.map((call) => call.source), ["items", "items", "projects", "meetings"]);
});

test("department collaboration sources reuse the static GET DTO and derive all five public collections", async () => {
  calls.length = 0;
  const collaboration = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.department-collaborations",
    targetType: "department",
    targetId: 12,
    fields: ["id", "title", "role", "responsibleDepartmentId", "responsibleDepartmentCode", "responsibleDepartmentName"],
  }));
  const enablingDepartments = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.department-collaboration-enabling-departments",
    targetType: "department",
    targetId: 12,
    fields: ["collaborationId", "id", "departmentId", "departmentName", "responseStatus"],
  }));
  const responsiblePositions = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.department-collaboration-responsible-positions",
    targetType: "department",
    targetId: 12,
    fields: ["collaborationId", "id", "name", "departmentId"],
  }));
  const executorPositions = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.department-collaboration-executor-positions",
    targetType: "department",
    targetId: 12,
    fields: ["collaborationId", "id", "name", "departmentId"],
  }));
  const plans = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.department-collaboration-plans",
    targetType: "department",
    targetId: 12,
    fields: ["collaborationId", "id", "title", "targetType", "targetId"],
  }));
  const items = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.department-collaboration-items",
    targetType: "department",
    targetId: 12,
    fields: ["collaborationId", "id", "content", "ownerEmployeeName"],
  }));
  assert.deepEqual(collaboration.rows, [{ id: 31, title: "销售与供应协作", role: "responsible",
    responsibleDepartmentId: 12, responsibleDepartmentCode: "D012", responsibleDepartmentName: "销售部" }]);
  assert.deepEqual(enablingDepartments.rows, [{
    collaborationId: 31,
    id: 301,
    departmentId: 8,
    departmentName: "供应部",
    responseStatus: "accepted",
  }]);
  assert.deepEqual(responsiblePositions.rows, [{ collaborationId: 31, id: 401, name: "销售经理", departmentId: 12 }]);
  assert.deepEqual(executorPositions.rows, [{ collaborationId: 31, id: 402, name: "供应专员", departmentId: 8 }]);
  assert.deepEqual(plans.rows, [{ collaborationId: 31, id: 501, title: "三季度交付计划", targetType: "department", targetId: 12 }]);
  assert.deepEqual(items.rows, [{ collaborationId: 31, id: 601, content: "确认供应排期", ownerEmployeeName: "王五" }]);
  assert.deepEqual(calls, Array.from({ length: 6 }, () => ({
    source: "department-collaborations",
    input: { userId: 7, departmentId: 12 },
  })));
});

test("KPI definition source preserves target visibility and flattens scoringRule through a nested-value child", async () => {
  calls.length = 0;
  const definitions = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.kpi-definitions",
    targetType: "department",
    targetId: 12,
    parameters: { ownerDepartmentId: 12, includeRetired: true },
    fields: ["id", "code", "name", "ownerDepartmentId"],
  }));
  const scoringValues = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.kpi-definition-scoring-rule-values",
    targetType: "department",
    targetId: 12,
    parameters: { ownerDepartmentId: 12, includeRetired: true },
    fields: ["definitionId", "path", "valueKind", "textValue", "numberValue"],
    pageSize: 10,
    maxRows: 10,
  }));

  assert.deepEqual(definitions.rows, [{ id: 71, code: "KPI-REV", name: "销售收入", ownerDepartmentId: 12 }]);
  assert.deepEqual(scoringValues.rows, [
    { definitionId: 71, path: "$.capScore", valueKind: "number", textValue: "120", numberValue: 120 },
    { definitionId: 71, path: "$.floorScore", valueKind: "number", textValue: "60", numberValue: 60 },
    { definitionId: 71, path: "$.kind", valueKind: "text", textValue: "linear", numberValue: null },
    { definitionId: 71, path: "$.targetScore", valueKind: "number", textValue: "100", numberValue: 100 },
  ]);
  assert.deepEqual(calls, Array.from({ length: 2 }, () => ({
    source: "kpi-definitions",
    input: {
      actorUserId: 7,
      targetType: "department",
      targetId: 12,
      ownerDepartmentId: 12,
      includeRetired: true,
    },
  })));
});

test("Work plan approval snapshot executor normalizes valid, empty and invalid JSON deterministically", async () => {
  calls.length = 0;
  const result = await loadWorkWorkspaceAnalysisSource(request({
    sourceKey: "work.plan-approval-snapshot-values",
    targetType: "department",
    targetId: 12,
    parameters: { kind: "okr", includeArchived: true },
    fields: [
      "planId",
      "snapshotKind",
      "parseStatus",
      "path",
      "valueKind",
      "textValue",
      "numberValue",
      "booleanValue",
    ],
    pageSize: 10,
    maxRows: 10,
  }));

  assert.deepEqual(result.rows, [
    {
      planId: 3,
      snapshotKind: "objective",
      parseStatus: "parsed",
      path: "$.comment",
      valueKind: "text",
      textValue: "通过",
      numberValue: null,
      booleanValue: null,
    },
    {
      planId: 3,
      snapshotKind: "objective",
      parseStatus: "parsed",
      path: "$.review.confirmed",
      valueKind: "boolean",
      textValue: "true",
      numberValue: null,
      booleanValue: true,
    },
    {
      planId: 3,
      snapshotKind: "objective",
      parseStatus: "parsed",
      path: "$.review.score",
      valueKind: "number",
      textValue: "95",
      numberValue: 95,
      booleanValue: null,
    },
    {
      planId: 3,
      snapshotKind: "kr",
      parseStatus: "invalid",
      path: "$",
      valueKind: "text",
      textValue: "{broken",
      numberValue: null,
      booleanValue: null,
    },
    {
      planId: 4,
      snapshotKind: "objective",
      parseStatus: "empty",
      path: "$",
      valueKind: "null",
      textValue: null,
      numberValue: null,
      booleanValue: null,
    },
    {
      planId: 4,
      snapshotKind: "kr",
      parseStatus: "parsed",
      path: "$",
      valueKind: "null",
      textValue: null,
      numberValue: null,
      booleanValue: null,
    },
  ]);
  assert.equal(result.rows.length, 6);
  assert.deepEqual(calls, [{
    source: "plans",
    input: {
      userId: 7,
      targetType: "department",
      targetId: 12,
      kind: "okr",
      includeArchived: true,
    },
  }]);
});

test("Work owner executor rechecks business visibility before loading", async () => {
  calls.length = 0;
  readAllowed = false;
  await assert.rejects(
    () => loadWorkWorkspaceAnalysisSource(request({ sourceKey: "work.items", targetType: "personal", targetId: 7, fields: ["id"] })),
    (error) => error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_forbidden",
  );
  assert.deepEqual(calls, []);
  readAllowed = true;
});
function request(input: {
  sourceKey: string;
  targetType: "personal" | "department" | "project";
  targetId: number;
  parameters?: Readonly<Record<string, string | number | boolean>>;
  fields: readonly string[];
  pageSize?: number;
  maxRows?: number;
  maxPages?: number;
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
      maxPages: input.maxPages ?? 1,
      maxBytes: 100_000,
      timeoutMs: 1_000,
    },
    signal: new AbortController().signal,
  };
}
