import assert from "node:assert/strict";
import path from "node:path";
import test, { mock } from "node:test";
import { currentEmploymentDateWhere } from "@workspace/platform/server/relation-registry";

process.env.WORKSPACE_CONFIG_DIR = path.resolve("scripts/check/fixtures/tenant-workspace");

type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);

const employmentFindManyCalls: Array<Record<string, unknown>> = [];
const edpFindManyCalls: Array<Record<string, unknown>> = [];
let employeeFindManyCalls = 0;

mockModule("@workspace/platform/server/auth", { namedExports: { checkHRUpdate: async () => true } });
mockModule("@workspace/platform/server/business-action-executor", {
  namedExports: { assertBusinessActionDirectExecutionAllowed: async () => ({ ok: true }) },
});
mockModule("@workspace/platform/server/history", {
  namedExports: { ensureEditHistoryBaseline: async () => undefined, snapshotHistory: async () => undefined },
});
mockModule("@workspace/platform/server/domain-validation", {
  namedExports: { mapValidationToServiceResult: (value: unknown) => value },
});
mockModule("@workspace/platform/search", {
  namedExports: { matchEmployee: () => true, matchSearchFields: () => true },
});
mockModule("@workspace/platform/server/api", {
  namedExports: {
    serviceError: (error: string, status: number) => ({ ok: false, error, status }),
    serviceOk: (data: unknown) => ({ ok: true, data }),
  },
});
mockModule("./data-quality-trigger", {
  namedExports: { queueHrDataQualityEvaluation: async () => undefined },
});
mockModule("@workspace/platform/server/prisma", {
  namedExports: {
    Prisma: {},
    prisma: {
      employee: {
        findMany: async () => {
          employeeFindManyCalls += 1;
          return [];
        },
      },
      employment: {
        count: async () => 173,
        findMany: async (args: Record<string, unknown>) => {
          employmentFindManyCalls.push(args);
          return [{
            id: 1,
            employeeId: 1,
            employee: {
              id: 1,
              employeeId: "EMP-X001",
              name: "测试员工",
              positions: [{ isPrimary: true, position: { name: "测试岗位" } }],
            },
            isActive: true,
            currentCompany: "测试公司",
            contracts: null,
            joinDate: "2026-01-01",
            leaveDate: null,
            leaveReason: null,
            leaveNote: null,
            officeLocation: null,
            personnelType: null,
            rank: null,
            title: null,
          }];
        },
      },
      eDP: {
        count: async () => 173,
        findMany: async (args: Record<string, unknown>) => {
          edpFindManyCalls.push(args);
          return [{
            id: 1,
            employeeId: 1,
            employee: { id: 1, employeeId: "EMP-X001", name: "测试员工" },
            reportingCompanyId: null,
            reportingCompany: null,
            departmentId: 1,
            department: { name: "测试部门" },
            positionId: 1,
            position: { name: "测试岗位" },
            reportToPositionId: null,
            reportToPosition: null,
            positionReportOverrideId: null,
            isPrimary: true,
            startDate: null,
            endDate: null,
            reportTo: null,
            workPercent: "1",
          }];
        },
      },
    },
  },
});
mockModule("./contracts", {
  namedExports: { parseContracts: () => [] },
});
mockModule("./domain/employment-validation", {
  namedExports: {
    buildEmploymentCreateCommand: () => ({ ok: true, data: {} }),
    buildEmploymentPageDraftCommand: () => ({ ok: true, data: {} }),
    validateEmploymentPersonnelTypeTransition: (_current: unknown, next: unknown) => ({
      ok: true,
      data: { value: next },
    }),
  },
});
mockModule("./employee-position-filters", {
  namedExports: { employeePositionFilterInclude: {}, employeePositionMatches: () => true },
});
mockModule("./hr-crud", { namedExports: { executeDelete: async () => ({ ok: true }) } });
mockModule("./domain/edp-validation", {
  namedExports: {
    buildEdpCreateCommand: async () => ({ ok: true, data: {} }),
    buildEdpPageDraftCommand: async () => ({ ok: true, data: {} }),
    EDP_ALLOWED_FIELDS: [],
    validateEdpDeleteCommand: async () => ({ ok: true, data: {} }),
  },
});
mockModule("./domain/edp-total-validation", {
  namedExports: { validateEdpCreateCurrentTotal: async () => ({ ok: true, data: {} }) },
});

const { listEmployments } = await import("./employments");
const { listEdps } = await import("./edps");

test("default employment tab uses database pagination", async () => {
  employmentFindManyCalls.length = 0;
  const result = await listEmployments({
    keyword: "",
    isActive: "true",
    company: "",
    department: "",
    position: "",
    personnelType: "",
    page: 3,
    pageSize: 50,
  });

  assert.equal(employmentFindManyCalls.length, 1);
  assert.equal(employmentFindManyCalls[0]?.skip, 100);
  assert.equal(employmentFindManyCalls[0]?.take, 50);
  assert.equal(result.total, 173);
  assert.equal(result.items[0]?.employeeCode, "EMP-X001");
  assert.equal(result.items[0]?.positionNames, "测试岗位");
});

test("default EDP tab paginates the EDP relation without enumerating employees", async () => {
  edpFindManyCalls.length = 0;
  employeeFindManyCalls = 0;
  const result = await listEdps({
    keyword: "",
    isActive: "true",
    company: "",
    department: "",
    position: "",
    page: 2,
    pageSize: 50,
  });

  assert.equal(employeeFindManyCalls, 0);
  assert.equal(edpFindManyCalls.length, 1);
  assert.deepEqual(edpFindManyCalls[0]?.where, {
    employee: { employments: { some: currentEmploymentDateWhere() } },
  });
  assert.equal(edpFindManyCalls[0]?.skip, 50);
  assert.equal(edpFindManyCalls[0]?.take, 50);
  assert.equal(result.total, 173);
});
