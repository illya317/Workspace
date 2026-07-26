import assert from "node:assert/strict";
import test from "node:test";

import {
  periodContainsDate,
  shiftIsoDate,
  validateAssignmentTimeline,
  type LifecycleAssignmentPeriod,
} from "./employee-lifecycle-validation";
import { projectEmployeeAssignmentLifecycle } from "./employee-lifecycle-projection";

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
    workPercent: input.workPercent ?? "1",
  };
}

test("period boundaries are inclusive and future starts do not become current early", () => {
  const period = { startDate: "2026-08-01", endDate: "2026-08-31" };
  assert.equal(periodContainsDate(period, "2026-07-31"), false);
  assert.equal(periodContainsDate(period, "2026-08-01"), true);
  assert.equal(periodContainsDate(period, "2026-08-31"), true);
  assert.equal(periodContainsDate(period, "2026-09-01"), false);
  assert.equal(shiftIsoDate("2026-08-01", -1), "2026-07-31");
});

test("a transfer split keeps exactly one 100 percent primary assignment", () => {
  assert.equal(validateAssignmentTimeline([
    { startDate: "2026-01-01", endDate: "2026-07-31", workPercent: "1", isPrimary: true },
    { startDate: "2026-08-01", endDate: null, workPercent: "1", isPrimary: true },
  ], "2026-07-26"), null);
});

test("a finite concurrent assignment passes only when source allocation is reduced and restored", () => {
  assert.equal(validateAssignmentTimeline([
    { startDate: "2026-01-01", endDate: "2026-07-31", workPercent: "1", isPrimary: true },
    { startDate: "2026-08-01", endDate: "2026-08-31", workPercent: "0.8", isPrimary: true },
    { startDate: "2026-08-01", endDate: "2026-08-31", workPercent: "0.2", isPrimary: false },
    { startDate: "2026-09-01", endDate: null, workPercent: "1", isPrimary: true },
  ], "2026-07-26"), null);
});

test("timeline validation catches future over-allocation and primary-role conflicts", () => {
  assert.match(validateAssignmentTimeline([
    { startDate: "2026-01-01", endDate: null, workPercent: "1", isPrimary: true },
    { startDate: "2026-08-01", endDate: null, workPercent: "0.2", isPrimary: false },
  ], "2026-07-26") ?? "", /100%/);

  assert.match(validateAssignmentTimeline([
    { startDate: "2026-01-01", endDate: null, workPercent: "0.8", isPrimary: true },
    { startDate: "2026-08-01", endDate: null, workPercent: "0.2", isPrimary: true },
  ], "2026-08-01") ?? "", /只能有一个主岗/);
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
    sourceRemainingWorkPercent: null,
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
    sourceRemainingWorkPercent: null,
    assignmentEndDate: null,
  }, [historical, current, future]);

  assert.deepEqual(projected[0], historical);
  assert.deepEqual(projected.find((row) => row.id === current.id), { ...current, endDate: "2026-07-31" });
  assert.equal(projected.some((row) => row.id === future.id), false);
});
