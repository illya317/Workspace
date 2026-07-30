import assert from "node:assert/strict";
import test from "node:test";
import type { FinanceCloseWorkpaperDto } from "../../types/close";
import { closeWorkpaperContextKey, closeWorkpaperMutationMatches, closeWorkpaperResponseMatches } from "./closeWorkpaperClientModel";

const scope = { companyCode: "C01", year: 2026, month: 6 };
const workpaper: FinanceCloseWorkpaperDto = {
  id: 1, taskKey: "employee-reimbursements", status: "prepared", conclusion: "完成", evidenceRefs: ["document:1"], voucherRefs: [],
  preparedByUserId: 7, preparedAt: "2026-06-30T00:00:00.000Z", reviewedByUserId: null, reviewedAt: null, version: 2, updatedAt: "2026-06-30T00:00:00.000Z",
};

test("workpaper responses are bound to exact scope, task and next CAS version", () => {
  assert.equal(closeWorkpaperResponseMatches({ scope, workpapers: [workpaper] }, scope, workpaper.taskKey), true);
  assert.equal(closeWorkpaperResponseMatches({ scope: { ...scope, month: 5 }, workpapers: [workpaper] }, scope, workpaper.taskKey), false);
  assert.equal(closeWorkpaperResponseMatches({ scope, workpapers: [{ ...workpaper, taskKey: "payroll-accruals" }] }, scope, workpaper.taskKey), false);
  assert.equal(closeWorkpaperMutationMatches(workpaper, workpaper.taskKey, 1), true);
  assert.equal(closeWorkpaperMutationMatches(workpaper, "payroll-accruals", 1), false);
  assert.notEqual(closeWorkpaperContextKey(scope, workpaper.taskKey, 1), closeWorkpaperContextKey({ ...scope, month: 5 }, workpaper.taskKey, 1));
});
