import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeHrBusinessTemporalRows,
  renderHrBusinessTemporalPreflight,
  type EdpPreflightRow,
  type EmployeeProjectPreflightRow,
  type EmploymentPreflightRow,
} from "./hr-business-temporal-preflight";

const employee = { employeeId: 1, employeeCode: "EMP-X001", employeeName: "测试员工" };

function employment(overrides: Partial<EmploymentPreflightRow> = {}): EmploymentPreflightRow {
  return {
    ...employee,
    id: 1,
    isActive: true,
    joinDate: "2026-01-01",
    leaveDate: null,
    ...overrides,
  };
}

function edp(overrides: Partial<EdpPreflightRow> = {}): EdpPreflightRow {
  return {
    ...employee,
    id: 10,
    reportingCompanyId: 1,
    departmentId: 1,
    positionId: 1,
    isPrimary: true,
    startDate: "2026-01-01",
    endDate: null,
    allocationWeight: "100",
    ...overrides,
  };
}

function projectMembership(overrides: Partial<EmployeeProjectPreflightRow> = {}): EmployeeProjectPreflightRow {
  const id = overrides.id ?? 20;
  return {
    ...employee,
    id,
    projectId: 1,
    membershipUid: `membership-${id}`,
    sequence: 1,
    recordState: "confirmed",
    startDate: "2026-01-01",
    endDate: null,
    ...overrides,
  };
}

function analyze(
  employments: EmploymentPreflightRow[],
  edps: EdpPreflightRow[],
  projectMemberships: EmployeeProjectPreflightRow[] = [],
) {
  return analyzeHrBusinessTemporalRows({
    asOfDate: "2026-07-27",
    employments,
    edps,
    projectMemberships,
  });
}

test("healthy Employment and EDP rows pass the preflight", () => {
  const result = analyze([employment()], [edp()]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.match(renderHrBusinessTemporalPreflight(result), /结果：通过/);
});

test("strict business-date validation reports malformed and inverted periods", () => {
  const result = analyze([
    employment({ id: 1, joinDate: "2026-02-30" }),
    employment({ id: 2, joinDate: "2026-08-01", leaveDate: "2026-07-31", isActive: false }),
  ], [
    edp({ id: 10, startDate: "2026-7-01" }),
    edp({ id: 11, startDate: "2026-08-01", endDate: "2026-07-31" }),
  ], [
    projectMembership({ id: 20, startDate: "0000-01-01" }),
    projectMembership({ id: 21, startDate: "2026-08-01", endDate: "2026-07-31" }),
    projectMembership({ id: 22, endDate: "2026-02-30" }),
  ]);
  assert.deepEqual(new Set(result.findings.map((item) => item.code)), new Set([
    "employment.invalid_join_date",
    "employment.inverted_period",
    "edp.invalid_start_date",
    "edp.inverted_period",
    "employee_project.invalid_end_date",
    "employee_project.invalid_start_date",
    "employee_project.inverted_period",
  ]));
});

test("the latest calendar date is invalid as an inclusive end across all scanned periods", () => {
  const result = analyze([
    employment({ leaveDate: "9999-12-31" }),
  ], [
    edp({ endDate: "9999-12-31" }),
  ], [
    projectMembership({ endDate: "9999-12-31" }),
  ]);
  assert.deepEqual(result.findings.map((item) => item.code), [
    "edp.invalid_period",
    "employee_project.invalid_period",
    "employment.invalid_period",
  ]);

  const latestRepresentable = analyze([
    employment({ joinDate: "9999-12-30", leaveDate: "9999-12-30", isActive: false }),
  ], [
    edp({ startDate: "9999-12-30", endDate: "9999-12-30" }),
  ], [
    projectMembership({ startDate: "9999-12-30", endDate: "9999-12-30" }),
  ]);
  assert.equal(latestRepresentable.ok, true);
});

test("Employment overlap is inclusive and adjacent non-overlapping rows are accepted", () => {
  const result = analyze([
    employment({ id: 1, joinDate: "2026-01-01", leaveDate: "2026-06-30", isActive: false }),
    employment({ id: 2, joinDate: "2026-06-30", leaveDate: "2026-07-10", isActive: false }),
    employment({ id: 3, joinDate: "2026-07-11", leaveDate: null, isActive: true }),
  ], [edp({ startDate: "2026-07-11" })]);
  const overlaps = result.findings.filter((item) => item.code === "employment.overlap");
  assert.deepEqual(overlaps.map((item) => item.recordIds), [[1, 2]]);
});

test("raw isActive is checked only when dates are authoritative", () => {
  const result = analyze([
    employment({ id: 1, isActive: true, joinDate: "2025-01-01", leaveDate: "2026-06-30" }),
    employment({ id: 2, isActive: false, joinDate: null, leaveDate: null }),
  ], []);
  assert.deepEqual(result.findings.filter((item) => item.code === "employment.stale_is_active").map((item) => item.recordIds), [[1]]);
});

test("blank legacy bounds use the same open-period semantics as runtime adapters", () => {
  const result = analyze([
    employment({ id: 1, isActive: true, joinDate: "", leaveDate: "  " }),
  ], [edp({ startDate: "", endDate: "  " })]);
  assert.equal(result.ok, true);
});

test("EDP overlap is scoped to the same company department and position slot", () => {
  const result = analyze([employment()], [
    edp({ id: 10, positionId: 1, isPrimary: true, allocationWeight: "100" }),
    edp({ id: 11, positionId: 1, isPrimary: false, allocationWeight: "40", startDate: "2026-06-01" }),
    edp({ id: 12, positionId: 2, isPrimary: false, allocationWeight: "30", startDate: "2026-06-01" }),
  ]);
  assert.deepEqual(result.findings.filter((item) => item.code === "edp.slot_overlap").map((item) => item.recordIds), [[10, 11]]);
});

test("current assignment checks enforce one primary role without requiring weights to total 100", () => {
  const result = analyze([employment()], [
    edp({ id: 10, positionId: 1, isPrimary: false, allocationWeight: "100" }),
    edp({ id: 11, positionId: 2, isPrimary: false, allocationWeight: "40" }),
  ]);
  assert.deepEqual(result.findings.filter((item) => item.code.startsWith("edp.current_")).map((item) => item.code), [
    "edp.current_primary_count",
  ]);
});

test("invalid allocation and assignment without current employment are reported without a false total", () => {
  const result = analyze([
    employment({ isActive: false, joinDate: "2025-01-01", leaveDate: "2025-12-31" }),
  ], [edp({ allocationWeight: "0" })]);
  assert.deepEqual(result.findings.map((item) => item.code), [
    "edp.current_without_employment",
    "edp.invalid_allocation_weight",
  ]);
});

test("a current project membership without current Employment is reported", () => {
  const result = analyze([
    employment({ isActive: false, joinDate: "2025-01-01", leaveDate: "2025-12-31" }),
  ], [], [
    projectMembership(),
  ]);
  assert.deepEqual(result.findings.map((item) => item.code), [
    "employee_project.current_without_employment",
  ]);
});

test("a historical project membership does not require current Employment", () => {
  const result = analyze([], [], [
    projectMembership({ startDate: "2025-01-01", endDate: "2025-12-31" }),
  ]);
  assert.equal(result.ok, true);
});

test("project membership versions reject confirmed overlap but ignore cancelled periods", () => {
  const result = analyze([employment()], [edp()], [
    projectMembership({ id: 20, membershipUid: "membership-1", sequence: 1, endDate: "2026-07-31" }),
    projectMembership({ id: 21, membershipUid: "membership-1", sequence: 2, startDate: "2026-07-31" }),
    projectMembership({ id: 22, membershipUid: "membership-2", sequence: 1, recordState: "cancelled" }),
  ]);
  assert.deepEqual(result.findings.filter((item) => item.code === "employee_project.overlap").map((item) => item.recordIds), [[20, 21]]);
});

test("cancelled project membership is not a current access fact", () => {
  const result = analyze([], [], [projectMembership({ recordState: "cancelled" })]);
  assert.equal(result.ok, true);
});

test("invalid as-of date is rejected before analysis", () => {
  assert.throws(() => analyzeHrBusinessTemporalRows({
    asOfDate: "2026-02-30",
    employments: [],
    edps: [],
    projectMemberships: [],
  }), /valid YYYY-MM-DD/);
});
