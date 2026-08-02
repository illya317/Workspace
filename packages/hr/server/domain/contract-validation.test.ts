import assert from "node:assert/strict";
import test, { mock } from "node:test";

type MockModule = (specifier: string, options: { namedExports: Record<string, unknown> }) => void;
const mockModule = (mock as unknown as { module: MockModule }).module.bind(mock);

let employmentRows: Array<{
  id: number;
  isActive: boolean;
  joinDate: string | null;
  leaveDate: string | null;
}> = [];

mockModule("@workspace/platform/server/business-date", {
  namedExports: { workspaceBusinessDate: () => "2026-07-27" },
});
mockModule("@workspace/platform/server/prisma", {
  namedExports: {
    prisma: {
      employment: { findMany: async () => employmentRows },
    },
  },
});
mockModule("../field-validation", {
  namedExports: {
    isValidCompanyName: async () => true,
    isValidDateValue: () => true,
    validateContractOption: () => true,
  },
});

const { buildEmployeeProfileContractsCommand } = await import("./contract-validation");

const contractRow = {
  company: "测试公司",
  isPrimary: true,
  insuranceStatus: null,
  legalRelation: "",
  contractType: "",
  employmentForm: "",
};

test("profile contract fallback prefers the business-date current employment", async () => {
  employmentRows = [
    { id: 30, isActive: true, joinDate: "2025-01-01", leaveDate: "2026-06-30" },
    { id: 20, isActive: false, joinDate: "2026-01-01", leaveDate: "2026-08-31" },
    { id: 40, isActive: false, joinDate: "2026-09-01", leaveDate: null },
  ];

  const result = await buildEmployeeProfileContractsCommand(7, [contractRow]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual([...result.data.grouped.keys()], [20]);
});

test("profile contract fallback chooses the nearest upcoming employment", async () => {
  employmentRows = [
    { id: 50, isActive: false, joinDate: "2026-10-01", leaveDate: null },
    { id: 40, isActive: false, joinDate: "2026-08-01", leaveDate: null },
    { id: 60, isActive: true, joinDate: "2025-01-01", leaveDate: "2026-06-30" },
  ];

  const result = await buildEmployeeProfileContractsCommand(7, [contractRow]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual([...result.data.grouped.keys()], [40]);
});

test("profile contract fallback rejects ambiguous current employments", async () => {
  employmentRows = [
    { id: 70, isActive: true, joinDate: "2026-01-01", leaveDate: null },
    { id: 71, isActive: false, joinDate: "2026-06-01", leaveDate: "2026-12-31" },
  ];

  const result = await buildEmployeeProfileContractsCommand(7, [contractRow]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.status, 409);
  assert.match(result.issue.message, /多条当前雇佣/);
});

test("profile contract fallback does not attach to an invalid employment period", async () => {
  employmentRows = [
    { id: 80, isActive: true, joinDate: "0000-00-00", leaveDate: null },
  ];

  const result = await buildEmployeeProfileContractsCommand(7, [contractRow]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.status, 409);
  assert.match(result.issue.message, /日期异常/);
});
