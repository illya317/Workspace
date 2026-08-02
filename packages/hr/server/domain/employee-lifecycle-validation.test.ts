import assert from "node:assert/strict";
import test from "node:test";

import { isEmploymentPositionOptionalTitle } from "@workspace/hr/constants/employee-temporal-write-policy";
import { shiftBusinessDate } from "@workspace/platform/contracts/business-temporal";
import {
  validateAssignmentChange,
  validateAssignmentTimeline,
  type LifecycleAssignmentPeriod,
} from "./employee-lifecycle-validation";
import { assignmentPeriodContainsDate } from "./employee-business-temporal";
import { deriveAllocationPercent } from "../field-validation";
import {
  offboardPeriodDisposition,
  projectEmployeeAssignmentLifecycle,
} from "./employee-lifecycle-projection";

function assignment(input: Partial<LifecycleAssignmentPeriod> & Pick<LifecycleAssignmentPeriod, "id" | "startDate" | "endDate">): LifecycleAssignmentPeriod {
  return {
    id: input.id,
    version: input.version ?? 1,
    employeeId: input.employeeId ?? 1,
    reportingCompanyId: input.reportingCompanyId ?? 1,
    departmentId: input.departmentId ?? 1,
    positionId: input.positionId ?? 1,
    positionReportOverrideId: input.positionReportOverrideId ?? null,
    isPrimary: input.isPrimary ?? true,
    startDate: input.startDate,
    endDate: input.endDate,
    reportTo: null,
    reportToPositionId: input.reportToPositionId ?? 10,
    allocationWeight: input.allocationWeight ?? "100",
  };
}

test("only advisor and director titles make a position optional", () => {
  assert.equal(isEmploymentPositionOptionalTitle("顾问"), true);
  assert.equal(isEmploymentPositionOptionalTitle(" 董事 "), true);
  assert.equal(isEmploymentPositionOptionalTitle(""), false);
  assert.equal(isEmploymentPositionOptionalTitle("经理"), false);
});

test("period boundaries are inclusive and future starts do not become current early", () => {
  const period = { startDate: "2026-08-01", endDate: "2026-08-31" };
  assert.equal(assignmentPeriodContainsDate(period, "2026-07-31"), false);
  assert.equal(assignmentPeriodContainsDate(period, "2026-08-01"), true);
  assert.equal(assignmentPeriodContainsDate(period, "2026-08-31"), true);
  assert.equal(assignmentPeriodContainsDate(period, "2026-09-01"), false);
  assert.equal(shiftBusinessDate("2026-08-01", -1), "2026-07-31");
});

test("a transfer split keeps positive weights and exactly one primary assignment", () => {
  assert.equal(validateAssignmentTimeline([
    { startDate: "2026-01-01", endDate: "2026-07-31", allocationWeight: "100", isPrimary: true },
    { startDate: "2026-08-01", endDate: null, allocationWeight: "100", isPrimary: true },
  ], "2026-07-26"), null);
});

test("a backdated transfer splits the historical source without overlapping it", () => {
  const source = assignment({ id: 1, startDate: "2026-01-01", endDate: "2026-06-30" });
  const target = { ...source, id: null, departmentId: 2, startDate: "2026-03-01" };
  const projected = projectEmployeeAssignmentLifecycle({
    eventType: "transfer",
    effectiveDate: "2026-03-01",
    sourceAssignment: source,
    targetAssignment: target,
    previousPrimaryAssignment: null,
    previousPrimaryTarget: null,
    restoredPrimaryAssignment: null,
    assignmentEndDate: null,
  }, [source]);

  assert.equal(projected.find((row) => row.id === source.id)?.endDate, "2026-02-28");
  assert.equal(projected.find((row) => row.id === null)?.startDate, "2026-03-01");
  assert.equal(validateAssignmentTimeline(projected, "2026-01-01", {
    requireAssignmentAtFromDate: true,
  }), null);
});

test("a transfer must change the assignment placement", () => {
  const source = assignment({ id: 1, startDate: "2026-01-01", endDate: null });
  const unchangedTarget = assignment({ id: null, startDate: "2026-08-01", endDate: null });
  assert.match(validateAssignmentChange("transfer", source, unchangedTarget) ?? "", /相同/);
  assert.equal(validateAssignmentChange("transfer", source, { ...unchangedTarget, departmentId: 2 }), null);
});

test("a reporting change must select a different reporting position", () => {
  const source = assignment({ id: 1, startDate: "2026-01-01", endDate: null, reportToPositionId: 10 });
  const unchangedTarget = assignment({ id: null, startDate: "2026-08-01", endDate: null, reportToPositionId: 10 });
  assert.match(validateAssignmentChange("reporting_change", source, unchangedTarget) ?? "", /未发生变化/);
  assert.equal(validateAssignmentChange("reporting_change", source, { ...unchangedTarget, reportToPositionId: 11 }), null);
});

test("concurrent assignments accept independent positive weights without totaling 100", () => {
  assert.equal(validateAssignmentTimeline([
    { startDate: "2026-01-01", endDate: null, allocationWeight: "100", isPrimary: true },
    { startDate: "2026-08-01", endDate: "2026-08-31", allocationWeight: "40", isPrimary: false },
  ], "2026-07-26"), null);
});

test("allocation percentages are derived from active weights", () => {
  const weights = ["100", "40", "30"];
  assert.equal(deriveAllocationPercent("100", weights), 100 / 170);
  assert.equal(deriveAllocationPercent("40", weights), 40 / 170);
  assert.equal(deriveAllocationPercent("30", weights), 30 / 170);
});

test("adding a concurrent assignment does not split or rewrite the existing assignment", () => {
  const primary = assignment({ id: 1, startDate: "2026-01-01", endDate: null, allocationWeight: "100" });
  const concurrent = assignment({ id: null, startDate: "2026-04-01", endDate: null, allocationWeight: "40", isPrimary: false });
  const projected = projectEmployeeAssignmentLifecycle({
    eventType: "concurrent_assignment",
    effectiveDate: "2026-04-01",
    sourceAssignment: null,
    targetAssignment: concurrent,
    previousPrimaryAssignment: null,
    previousPrimaryTarget: null,
    restoredPrimaryAssignment: null,
    assignmentEndDate: null,
  }, [primary]);
  assert.deepEqual(projected, [primary, concurrent]);
});

test("primary changes preserve both assignment weights", () => {
  const oldPrimary = assignment({ id: 1, startDate: "2026-01-01", endDate: null, allocationWeight: "100" });
  const newPrimarySource = assignment({ id: 2, startDate: "2026-02-01", endDate: null, allocationWeight: "40", isPrimary: false });
  const oldPrimaryTarget = { ...oldPrimary, id: null, version: 0, startDate: "2026-04-01", isPrimary: false };
  const newPrimaryTarget = { ...newPrimarySource, id: null, version: 0, startDate: "2026-04-01", isPrimary: true };
  const projected = projectEmployeeAssignmentLifecycle({
    eventType: "primary_change",
    effectiveDate: "2026-04-01",
    sourceAssignment: newPrimarySource,
    targetAssignment: newPrimaryTarget,
    previousPrimaryAssignment: oldPrimary,
    previousPrimaryTarget: oldPrimaryTarget,
    restoredPrimaryAssignment: null,
    assignmentEndDate: null,
  }, [oldPrimary, newPrimarySource]);
  assert.equal(validateAssignmentTimeline(projected, "2026-01-01", { requireAssignmentAtFromDate: true }), null);
  assert.deepEqual(projected.filter((row) => row.startDate === "2026-04-01").map((row) => ({
    allocationWeight: row.allocationWeight,
    isPrimary: row.isPrimary,
  })), [
    { allocationWeight: "100", isPrimary: false },
    { allocationWeight: "40", isPrimary: true },
  ]);
});

test("timeline validation accepts arbitrary weight totals and catches primary-role conflicts", () => {
  assert.equal(validateAssignmentTimeline([
    { startDate: "2026-01-01", endDate: null, allocationWeight: "100", isPrimary: true },
    { startDate: "2026-08-01", endDate: null, allocationWeight: "40", isPrimary: false },
  ], "2026-07-26"), null);
  assert.match(validateAssignmentTimeline([
    { startDate: "2026-01-01", endDate: null, allocationWeight: "100", isPrimary: true },
    { startDate: "2026-08-01", endDate: null, allocationWeight: "40", isPrimary: true },
  ], "2026-08-01") ?? "", /只能有一个主岗/);
});

test("timeline validation can require a current assignment at the effective date", () => {
  assert.match(validateAssignmentTimeline([], "2026-07-26", { requireAssignmentAtFromDate: true }) ?? "", /至少存在一条当前任职/);
  assert.equal(validateAssignmentTimeline([], "2026-07-26"), null);
});

test("timeline validation fail-closes invalid and unshiftable inclusive ends", () => {
  assert.match(validateAssignmentTimeline([
    { startDate: "2026-01-01", endDate: "9999-12-31", allocationWeight: "100", isPrimary: true },
  ], "2026-07-26") ?? "", /9999-12-30/);
  assert.match(validateAssignmentTimeline([
    { startDate: "2026-02-30", endDate: null, allocationWeight: "100", isPrimary: true },
  ], "2026-07-26") ?? "", /日期格式无效/);
  assert.match(validateAssignmentTimeline([], "2026-02-30") ?? "", /基准日期格式无效/);
});

test("a future reporting change preserves all earlier history and starts a new position-based fact", () => {
  const historical = assignment({ id: 9, startDate: "2025-01-01", endDate: "2025-12-31", reportToPositionId: 7 });
  const source = assignment({ id: 10, startDate: "2026-01-01", endDate: null, reportToPositionId: 11 });
  const target = assignment({ id: null, startDate: "2026-08-01", endDate: null, reportToPositionId: 12 });
  const projected = projectEmployeeAssignmentLifecycle({
    eventType: "reporting_change",
    effectiveDate: "2026-08-01",
    sourceAssignment: source,
    targetAssignment: target,
    previousPrimaryAssignment: null,
    previousPrimaryTarget: null,
    restoredPrimaryAssignment: null,
    assignmentEndDate: null,
  }, [historical, source]);
  assert.deepEqual(projected[0], historical);
  assert.deepEqual(projected.find((row) => row.id === source.id), { ...source, endDate: "2026-07-31" });
  assert.equal(projected.find((row) => row.id === null)?.reportToPositionId, 12);
});

test("future offboarding keeps earlier history, closes only the covering period, and cancels future periods", () => {
  const historical = assignment({ id: 20, startDate: "2025-01-01", endDate: "2025-12-31" });
  const current = assignment({ id: 21, startDate: "2026-01-01", endDate: null });
  const future = assignment({ id: 22, startDate: "2026-09-01", endDate: null });
  const projected = projectEmployeeAssignmentLifecycle({
    eventType: "offboard",
    effectiveDate: "2026-08-01",
    sourceAssignment: null,
    targetAssignment: null,
    previousPrimaryAssignment: null,
    previousPrimaryTarget: null,
    restoredPrimaryAssignment: null,
    assignmentEndDate: null,
  }, [historical, current, future]);
  assert.deepEqual(projected[0], historical);
  assert.deepEqual(projected.find((row) => row.id === current.id), { ...current, endDate: "2026-07-31" });
  assert.equal(projected.some((row) => row.id === future.id), false);
});

test("offboarding removes incomplete current and future assignments before post-state validation", () => {
  const current = { ...assignment({ id: 31, startDate: "2026-01-01", endDate: null }), positionId: null, allocationWeight: null };
  const future = { ...assignment({ id: 32, startDate: "2026-09-01", endDate: null }), positionId: null, allocationWeight: null };
  const projected = projectEmployeeAssignmentLifecycle({
    eventType: "offboard",
    effectiveDate: "2026-08-01",
    sourceAssignment: null,
    targetAssignment: null,
    previousPrimaryAssignment: null,
    previousPrimaryTarget: null,
    restoredPrimaryAssignment: null,
    assignmentEndDate: null,
  }, [current, future]);
  assert.equal(projected.some((row) => !row.endDate || row.endDate >= "2026-08-01"), false);
});

test("offboarding closes invalid open periods so legacy current filters cannot revive them", () => {
  const invalidOpen = { ...assignment({ id: 41, startDate: "0000-00-00", endDate: null }), positionId: null, allocationWeight: null };
  assert.equal(offboardPeriodDisposition(invalidOpen, "2026-08-01"), "close");
  const projected = projectEmployeeAssignmentLifecycle({
    eventType: "offboard",
    effectiveDate: "2026-08-01",
    sourceAssignment: null,
    targetAssignment: null,
    previousPrimaryAssignment: null,
    previousPrimaryTarget: null,
    restoredPrimaryAssignment: null,
    assignmentEndDate: null,
  }, [invalidOpen]);
  assert.equal(projected[0]?.endDate, "2026-07-31");
  assert.equal(offboardPeriodDisposition({ startDate: "2026-09-01", endDate: null }, "2026-08-01"), "cancel");
  assert.equal(offboardPeriodDisposition({ startDate: "2025-01-01", endDate: "2025-12-31" }, "2026-08-01"), "keep");
});
