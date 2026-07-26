import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";
import {
  WorkspaceAnalysisRuntimeError,
  type WorkspaceAnalysisSourceLoadRequest,
} from "@workspace/platform/server/workspace-analysis-runtime";

import { HR_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-sources";

mock.module("server-only", { namedExports: {} } as never);

let readAllowed = true;
const calls: Array<{ source: string; query: unknown }> = [];
const performanceReviewRows = [{
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
}];
mock.module("./workspace-analysis-source-access", {
  namedExports: {
    buildHrWorkspaceAnalysisSourceCatalog: () => createWorkspaceAnalysisSourceCatalog(HR_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS),
    canDiscoverHrWorkspaceAnalysisSource: async () => readAllowed,
  },
} as never);
mock.module("./employees", {
  namedExports: {
    listEmployees: async (query: unknown) => {
      calls.push({ source: "employees", query });
      return { employees: [{ employeeId: "E001", name: "张三", idNumber: "310000", positions: [{ secret: true }] }], total: 1 };
    },
  },
} as never);
mock.module("./employments", {
  namedExports: {
    listEmployments: async (query: unknown) => {
      calls.push({ source: "employments-global", query });
      return { items: [{ employeeName: "张三", leaveReason: "个人原因", leaveNote: "说明", contracts: "must-not-leak" }], total: 1 };
    },
    listCurrentDepartmentEmployments: async (query: unknown) => {
      calls.push({ source: "employments-department", query });
      return { items: [{ employeeName: "张三", leaveReason: "个人原因", leaveNote: "说明", contracts: "must-not-leak" }], total: 1 };
    },
  },
} as never);
mock.module("./edps", {
  namedExports: {
    listEdps: async (query: unknown) => {
      calls.push({ source: "edps", query });
      return { positions: [{ employeeName: "张三", departmentName: "销售部", positionName: "销售" }], total: 1 };
    },
  },
} as never);
mock.module("./contracts", {
  namedExports: {
    getContracts: async (query: unknown) => {
      calls.push({ source: "contracts", query });
      return { contracts: [{ employeeName: "张三", company: "甲公司", contractType: "劳动合同" }], total: 1 };
    },
  },
} as never);
mock.module("./departments", {
  namedExports: {
    listDepartments: async (query: unknown) => {
      calls.push({ source: "departments", query });
      return {
        departments: [{
          id: 10,
          code: "D01",
          name: "销售部",
          headcount: 5,
          managerEmployeeIds: [7],
          managerEmployeeNames: ["张三"],
          descriptions: [{ id: 20, sourceFile: "department.docx", codeRaw: null, details: { quota: 5 } }],
        }],
        total: 1,
      };
    },
  },
} as never);
mock.module("./positions", {
  namedExports: {
    getPositionList: async (...query: unknown[]) => {
      calls.push({ source: "positions", query });
      return {
        positions: [{
          id: 30,
          code: "P01",
          codeRaw: null,
          name: "销售",
          headcount: 3,
          positionDescriptionId: 40,
          sourceFile: "position.docx",
          positionDescriptionDetails: { duty: "拜访客户" },
        }],
        total: 1,
      };
    },
  },
} as never);
mock.module("@workspace/platform/server/company-directory", {
  namedExports: {
    listCompanyDirectory: async (query: unknown) => {
      calls.push({ source: "companies", query });
      return { companies: [{ code: "CHM", name: "甲公司", isActive: true }], total: 1 };
    },
  },
} as never);
mock.module("@workspace/platform/server/audit-log", {
  namedExports: {
    getAuditLogEntries: async (entityType: string, date: string | undefined, page: number, pageSize: number) => {
      calls.push({ source: "audit-log", query: { entityType, date, page, pageSize } });
      return {
        entries: [{
          id: 50,
          entityId: "10",
          entityName: "销售部",
          version: 2,
          editorName: "张三",
          createdAt: new Date("2026-07-25T01:02:03.000Z"),
          tag: null,
          action: "update",
          canRestore: true,
          changes: [{ field: "name", label: "名称", from: "旧销售部", to: "销售部" }],
        }],
        total: 1,
      };
    },
  },
} as never);
mock.module("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      hrPerformanceReview: {
        findMany: async (query: unknown) => {
          calls.push({ source: "performance-review-batch", query });
          return [{
            id: 70,
            employeeId: 1,
            okrCycleId: 40,
            approvalRequestId: 80,
            selfScore: 88,
            selfComment: "完成年度重点客户开发",
            managerScore: 90,
            managerComment: "目标完成稳定",
            finalScore: 89,
            finalGrade: "A",
            hrComment: "同意归档",
            archivedAt: new Date("2026-08-05T01:00:00.000Z"),
            version: 2,
            workEvidenceSnapshotJson: JSON.stringify({
              schemaVersion: 2,
              work: { summary: { planCount: 1 } },
              kpi: { weightedScore: 89 },
            }),
            createdAt: new Date("2026-08-05T01:00:00.000Z"),
            updatedAt: new Date("2026-08-06T02:00:00.000Z"),
            employee: { employeeId: "E001", name: "张三" },
          }];
        },
      },
    },
  },
} as never);
mock.module("./audit-entities", {
  namedExports: {
    isHrAuditEntityType: (entityType: string) => entityType === "Department",
  },
} as never);
mock.module("./position-report-overrides", {
  namedExports: {
    listPositionReportOverrides: async (positionId: number) => {
      calls.push({ source: "position-report-overrides", query: { positionId } });
      return {
        position: { id: positionId },
        isFunctionalPosition: false,
        overrides: [{
          id: 60,
          positionId,
          companyId: 1,
          companyCode: "CHM",
          companyName: "甲公司",
          departmentId: 10,
          departmentCode: "D01",
          departmentName: "销售部",
          departmentPath: "销售部",
          reportToPositionId: 31,
          reportToPositionName: "销售总监",
          headcount: 3,
          isActive: true,
          edpCount: 2,
        }],
      };
    },
  },
} as never);
mock.module("./performance", {
  namedExports: {
    executeListHrPerformanceDashboardRouteCommand: async (query: unknown) => {
      calls.push({ source: "performance", query });
      return {
        ok: true,
        data: {
          createRuntime: { mode: "direct" },
          currentEmployee: { id: 1, employeeId: "E001", name: "张三", userId: 7 },
          cycleOptions: [{
            id: 40,
            label: "2026年7月",
            code: "2026-07",
            periodType: "monthly",
            startDate: "2026-07-01",
            endDate: "2026-07-31",
          }],
          activeCycleId: 40,
          audienceOptions: { personal: [], department: [], project: [] },
          contributionDirectories: {
            personal: [{
              id: 1,
              employeeId: "E001",
              name: "张三",
              userId: 7,
              company: "甲公司",
              department: "销售部",
              position: "销售",
              attendanceType: "坐班",
              personnelType: "正式员工",
              joinDate: "2024-01-01",
              status: "在职",
              reporting: { status: "submitted_on_time", deadline: "2026-08-02", submittedAt: "2026-08-01T01:00:00.000Z" },
            }],
            department: [{
              id: 12,
              code: "D012",
              name: "销售部",
              hierarchy: "M2",
              parentName: "治理委员会",
              status: "现用",
              reporting: { status: "overdue", deadline: "2026-08-02", submittedAt: null },
            }],
            project: [{
              id: 21,
              code: "P021",
              name: "重点项目",
              projectType: "公司",
              projectLevel: "重点",
              leadingDepartment: "销售部",
              status: "开启",
              reporting: null,
            }],
          },
          reportingSummary: { applicable: true, total: 1, submittedOnTime: 1, submittedLate: 0, overdueMissing: 0 },
          attendanceRows: [{
            id: 1,
            employeeId: "E001",
            name: "张三",
            userId: 7,
            company: "甲公司",
            department: "销售部",
            position: "销售",
            attendanceType: "坐班",
            personnelType: "正式员工",
            joinDate: "2024-01-01",
            status: "在职",
          }],
          workRows: [{
            id: 50,
            employeeId: 1,
            employeeName: "张三",
            planTitle: "年度销售计划",
            kind: "okr",
            okrCycleId: 40,
            stage: "execution",
            status: "active",
            objectiveCount: 2,
            keyResultCount: 3,
            completionRate: 75,
          }, {
            id: 51,
            employeeId: null,
            employeeName: "",
            planTitle: "全局无负责人计划",
            kind: "routine",
            okrCycleId: null,
            stage: "execution",
            status: "active",
            objectiveCount: 0,
            keyResultCount: 0,
            completionRate: null,
          }],
          contributionRows: [{
            id: "work:60:1:owner",
            employeeId: 1,
            employeeName: "张三",
            sourceKind: "work_item",
            contributionType: "任务",
            contributionRole: "owner",
            roleLabel: "Owner",
            sourceSpace: "销售部",
            title: "完成客户拜访",
            relation: "销售目标 / 客户增长",
            status: "完成",
            actualEndDate: "2026-07-20",
            evidenceCount: 2,
            referenceLabel: "重点项目",
          }],
          reviewRows: performanceReviewRows,
          submissionRows: [{ id: 80, status: "submitted", actionRuntime: { hidden: true } }],
          metrics: {
            activeEmployeeCount: 1,
            workPlanCount: 1,
            contributionCount: 1,
            reviewCount: 1,
            submittedFlowCount: 1,
            draftFlowCount: 0,
          },
        },
      };
    },
  },
} as never);

const { loadHrWorkspaceAnalysisSource } = await import("./workspace-analysis-source-executor");

test("HR owner forces target department while exposing restricted labels under the same roster read", async () => {
  readAllowed = true;
  calls.length = 0;
  const result = await loadHrWorkspaceAnalysisSource(request({
    sourceKey: "hr.employments",
    targetType: "department",
    fields: ["employeeName", "leaveReason", "leaveNote"],
    parameters: { isActive: true, personnelType: "正式员工" },
  }));

  assert.deepEqual(calls, [{
    source: "employments-department",
    query: {
      keyword: "",
      isActive: "true",
      company: "",
      department: "",
      position: "",
      personnelType: "正式员工",
      page: 1,
      pageSize: 100,
      departmentId: 12,
    },
  }]);
  assert.deepEqual(result.rows, [{ employeeName: "张三", leaveReason: "个人原因", leaveNote: "说明" }]);
  assert.equal(JSON.stringify(result).includes("contracts"), false);
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
});

test("HR owner dispatches every registered stable list source and projects only requested fields", async () => {
  readAllowed = true;
  calls.length = 0;
  const cases = [
    ["hr.employees", ["employeeId", "idNumber"], {}],
    ["hr.employments", ["employeeName", "leaveReason"], {}],
    ["hr.edps", ["employeeName", "departmentName"], {}],
    ["hr.contracts", ["employeeName", "contractType"], {}],
    ["hr.departments", ["name", "headcount"], {}],
    ["hr.department-descriptions", ["parentCode", "path", "numberValue"], {}],
    ["hr.department-managers", ["departmentCode", "employeeId", "employeeName"], {}],
    ["hr.positions", ["name", "headcount"], {}],
    ["hr.position-descriptions", ["parentCode", "path", "textValue"], {}],
    ["hr.companies", ["code", "name"], {}],
    ["hr.audit-entries", ["entityName", "editorName", "createdAt"], { entityType: "Department" }],
    ["hr.audit-changes", ["entityName", "field", "from", "to"], { entityType: "Department" }],
    ["hr.position-report-overrides", ["positionId", "departmentName", "headcount"], { positionId: 30 }],
    ["hr.performance-attendance", ["employeeId", "attendanceType"], {}],
    ["hr.performance-work-plans", ["planTitle", "completionRate"], {}],
    ["hr.performance-contributions", ["employeeName", "title", "evidenceCount"], {}],
    ["hr.performance-reviews", ["employeeName", "finalScore", "version"], {}],
    ["hr.performance-review-details", ["id", "managerComment", "createdAt"], {}],
    ["hr.performance-review-evidence-values", ["reviewId", "path", "textValue"], {}],
    ["hr.performance-cycles", ["code", "periodType"], {}],
    ["hr.performance-reporting", ["audienceType", "audienceName", "reportingStatus"], {}],
  ] as const;

  for (const [sourceKey, fields, parameters] of cases) {
    const result = await loadHrWorkspaceAnalysisSource(request({
      sourceKey,
      targetType: "personal",
      fields: [...fields],
      parameters,
    }));
    assert.deepEqual(Object.keys(result.rows[0] ?? {}), [...fields]);
  }
  assert.deepEqual(calls.map((call) => call.source), [
    "employees",
    "employments-global",
    "edps",
    "contracts",
    "departments",
    "departments",
    "departments",
    "positions",
    "positions",
    "companies",
    "audit-log",
    "audit-log",
    "position-report-overrides",
    "performance",
    "performance",
    "performance",
    "performance",
    "performance",
    "performance-review-batch",
    "performance",
    "performance-review-batch",
    "performance",
    "performance",
  ]);
  assert.equal(JSON.stringify(calls).includes("secret"), false);
});

test("HR performance owner binds summary targets and keeps personal data on the original self view", async () => {
  readAllowed = true;
  calls.length = 0;
  await loadHrWorkspaceAnalysisSource(request({
    sourceKey: "hr.performance-attendance",
    targetType: "personal",
    targetId: 7,
    fields: ["employeeId"],
    parameters: { cycleId: 40, periodType: "monthly", keyword: "张三" },
  }));
  await loadHrWorkspaceAnalysisSource(request({
    sourceKey: "hr.performance-reporting",
    targetType: "department",
    targetId: 12,
    fields: ["audienceType", "audienceId", "reportingStatus"],
    parameters: { cycleId: 40, periodType: "monthly" },
  }));
  const departmentPlans = await loadHrWorkspaceAnalysisSource(request({
    sourceKey: "hr.performance-work-plans",
    targetType: "department",
    targetId: 12,
    fields: ["id", "employeeId", "planTitle"],
    parameters: { cycleId: 40 },
  }));
  await loadHrWorkspaceAnalysisSource(request({
    sourceKey: "hr.performance-cycles",
    targetType: "department",
    targetId: 12,
    fields: ["id", "code"],
    parameters: { periodType: "monthly" },
  }));

  assert.deepEqual(calls, [
    {
      source: "performance",
      query: {
        userId: 7,
        view: "self",
        cycleId: 40,
        periodType: "monthly",
        audienceType: null,
        audienceId: null,
        keyword: "张三",
        status: "",
      },
    },
    {
      source: "performance",
      query: {
        userId: 7,
        view: "summary",
        cycleId: 40,
        periodType: "monthly",
        audienceType: "department",
        audienceId: 12,
        keyword: "",
        status: "",
      },
    },
    {
      source: "performance",
      query: {
        userId: 7,
        view: "summary",
        cycleId: 40,
        periodType: null,
        audienceType: "department",
        audienceId: 12,
        keyword: "",
        status: "",
      },
    },
    {
      source: "performance",
      query: {
        userId: 7,
        view: "summary",
        cycleId: null,
        periodType: "monthly",
        audienceType: null,
        audienceId: null,
        keyword: "",
        status: "",
      },
    },
  ]);
  assert.deepEqual(departmentPlans.rows, [{ id: 50, employeeId: 1, planTitle: "年度销售计划" }]);
});

test("HR owner rechecks roster access on every execution", async () => {
  readAllowed = false;
  calls.length = 0;
  await assert.rejects(() => loadHrWorkspaceAnalysisSource(request({
    sourceKey: "hr.employees",
    targetType: "personal",
    fields: ["name"],
  })), (error) => (
    error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_forbidden"
  ));
  assert.equal(calls.length, 0);
  readAllowed = true;
});

function request(input: {
  sourceKey: string;
  targetType: WorkspaceAnalysisSourceLoadRequest["targetType"];
  targetId?: number;
  fields: string[];
  parameters?: Record<string, string | number | boolean>;
}): WorkspaceAnalysisSourceLoadRequest {
  return {
    requesterId: 7,
    targetType: input.targetType,
    targetId: input.targetId ?? 12,
    ownerUnitId: "hr",
    sourceKey: input.sourceKey,
    sourceVersion: 1,
    parameters: input.parameters ?? {},
    fields: input.fields,
    limits: { maxRows: 100, maxGroups: 20, pageSize: 100, maxPages: 1, maxBytes: 100_000, timeoutMs: 1_000 },
    signal: new AbortController().signal,
  };
}
