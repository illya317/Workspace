import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { requireBusinessDate } from "@workspace/platform/contracts/business-temporal";
import {
  currentInclusiveBusinessPeriodWhere,
  employmentPeriodContains,
  employmentPeriodWhereAt,
  inclusiveBusinessPeriodWhere,
} from "./business-temporal-prisma";

process.env.WORKSPACE_CONFIG_DIR = path.resolve("scripts/check/fixtures/tenant-workspace");

test("inclusive period predicates require a parsed BusinessDate and preserve existing AND", () => {
  const date = requireBusinessDate("2026-07-26");
  assert.deepEqual(inclusiveBusinessPeriodWhere({ AND: [{ tenantId: 3 }] }, "startDate", "endDate", date), {
    AND: [
      { tenantId: 3 },
      { OR: [{ startDate: null }, { startDate: "" }, { startDate: { lte: date } }] },
      { OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: date } }] },
    ],
  });
  assert.deepEqual(currentInclusiveBusinessPeriodWhere({ employeeId: 7 }, "startDate", "endDate", new Date("2026-07-26T04:00:00.000Z")), {
    employeeId: 7,
    AND: [
      { OR: [{ startDate: null }, { startDate: "" }, { startDate: { lte: "2026-07-26" } }] },
      { OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: "2026-07-26" } }] },
    ],
  });
});

test("Employment compatibility falls back to isActive only for undated rows", () => {
  const date = requireBusinessDate("2026-07-26");
  assert.equal(employmentPeriodContains({ isActive: true }, date), true);
  assert.equal(employmentPeriodContains({ isActive: true, joinDate: "not-a-date" }, date), false);
  assert.equal(employmentPeriodContains({ isActive: false, joinDate: "2026-01-01", leaveDate: "2026-07-26" }, date), true);
  assert.equal(employmentPeriodContains({ isActive: false, joinDate: "2026-01-01", leaveDate: "2026-07-25" }, date), false);
  assert.deepEqual(employmentPeriodWhereAt({}, date).AND.at(-1), {
    OR: [
      { AND: [{ joinDate: { not: null } }, { joinDate: { not: "" } }] },
      { AND: [{ leaveDate: { not: null } }, { leaveDate: { not: "" } }] },
      { isActive: true },
    ],
  });
});
