import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { workspaceBusinessDate, workspaceBusinessDayStart } from "./business-date";
import { currentEmploymentDateWhere } from "./relation-registry";
import {
  businessActorIdentity,
  getUserActivePositionAssignments,
  type UserEmployeeIdentity,
} from "./user-identity";

process.env.WORKSPACE_CONFIG_DIR = path.resolve("scripts/check/fixtures/tenant-workspace");

function identity(overrides: Partial<UserEmployeeIdentity> = {}): UserEmployeeIdentity {
  return {
    username: "employee",
    canLogin: true,
    employeeName: "张三",
    employeeId: "E001",
    employeeRefId: 1,
    hasEmployeeRecord: true,
    isActiveEmployee: true,
    ...overrides,
  };
}

test("root admin is a business actor named 管理员 without an employee record", () => {
  assert.deepEqual(businessActorIdentity(identity({
    username: "admin",
    employeeName: null,
    employeeId: null,
    employeeRefId: null,
    hasEmployeeRecord: false,
    isActiveEmployee: false,
  })), {
    username: "admin",
    canLogin: true,
    employeeName: null,
    employeeId: null,
    employeeRefId: null,
    hasEmployeeRecord: false,
    isActiveEmployee: false,
    actorName: "管理员",
    signatureName: "管理员",
    isRootAdmin: true,
  });
});

test("ordinary unbound users do not become employee business actors", () => {
  assert.equal(businessActorIdentity(identity({
    employeeName: null,
    employeeId: null,
    hasEmployeeRecord: false,
    isActiveEmployee: false,
  })), null);
});

test("employee business actors keep their employee signature", () => {
  const actor = businessActorIdentity(identity());
  assert.equal(actor?.actorName, "张三");
  assert.equal(actor?.signatureName, "E001 张三");
  assert.equal(actor?.isRootAdmin, false);
});

test("active user position assignments use the HR employee-position relation and business date", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const now = new Date("2026-07-23T04:00:00.000Z");
  const client = {
    eDP: {
      findMany: async (args: Record<string, unknown>) => {
        calls.push(args);
        return [{
          id: 71,
          positionId: 301,
          departmentId: 41,
          isPrimary: true,
          position: { code: "SAL001", name: "销售内勤" },
          department: { code: "SAL", name: "销售部" },
        }];
      },
    },
  };

  const result = await getUserActivePositionAssignments(7, client as never, now);
  const where = (calls[0]?.where ?? {}) as {
    employee?: unknown;
    AND?: unknown;
    position?: unknown;
    department?: unknown;
  };

  assert.deepEqual(where.employee, { userId: 7, employments: { some: currentEmploymentDateWhere({}, now) } });
  assert.deepEqual(where.AND, [
    { OR: [{ startDate: null }, { startDate: "" }, { startDate: { lte: workspaceBusinessDate(now) } }] },
    { OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: workspaceBusinessDate(now) } }] },
  ]);
  assert.deepEqual(where.position, {
    isArchived: false,
    OR: [{ endDate: null }, { endDate: { gte: workspaceBusinessDayStart(now) } }],
  });
  assert.deepEqual(where.department, {
    isArchived: false,
    OR: [{ endDate: null }, { endDate: { gte: workspaceBusinessDayStart(now) } }],
  });
  assert.deepEqual(result, [{
    id: 71,
    positionId: 301,
    positionCode: "SAL001",
    positionName: "销售内勤",
    departmentId: 41,
    departmentCode: "SAL",
    departmentName: "销售部",
    isPrimary: true,
  }]);
});
