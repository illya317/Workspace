import assert from "node:assert/strict";
import test from "node:test";

import {
  activeEmployeeCreatedProject,
  activeEmployeeAssignmentScopeIds,
  activeProjectMemberRoles,
  employeeHasActiveEmploymentOnDate,
  projectMemberHasActiveEmploymentOnDate,
  projectMembershipIsActiveOnDate,
  WORK_PROJECT_MEMBERSHIP_TEMPORAL,
} from "./project-access-temporal";

test("project membership registers its partial effective-version lifecycle contract", () => {
  assert.equal(WORK_PROJECT_MEMBERSHIP_TEMPORAL.maturity, "partial");
  assert.equal(WORK_PROJECT_MEMBERSHIP_TEMPORAL.policy.storage, "effective-version");
  assert.equal(WORK_PROJECT_MEMBERSHIP_TEMPORAL.policy.deletion, "end-date");
  assert.equal(WORK_PROJECT_MEMBERSHIP_TEMPORAL.ui.recordState, true);
});

test("offboarding removes project membership access on the effective day", () => {
  const historicalMembership = {
    employeeId: 7,
    role: "项目负责人",
    startDate: "2026-01-01",
    endDate: "2026-07-31",
  };

  assert.equal(projectMembershipIsActiveOnDate(historicalMembership, "2026-07-31"), true);
  assert.equal(projectMembershipIsActiveOnDate(historicalMembership, "2026-08-01"), false);
  assert.deepEqual(
    activeProjectMemberRoles([historicalMembership], new Set([7]), "2026-08-01"),
    [],
  );
});

test("future and invalid memberships never grant current project roles", () => {
  const memberships = [
    { employeeId: 7, role: "负责人", startDate: "2026-09-01", endDate: null },
    { employeeId: 7, role: "支持协作", startDate: "0000-00-00", endDate: null },
    { employeeId: 7, role: "执行负责", startDate: null, endDate: null },
  ];

  assert.deepEqual(
    activeProjectMemberRoles(memberships, new Set([7]), "2026-08-01"),
    ["执行负责"],
  );
});

test("project roles require a strictly valid current Employment", () => {
  const membership = { startDate: "2026-01-01", endDate: null };
  assert.equal(projectMemberHasActiveEmploymentOnDate(membership, [
    { isActive: true, joinDate: "2025-01-01", leaveDate: "2026-07-31" },
  ], "2026-08-01"), false);
  assert.equal(employeeHasActiveEmploymentOnDate([
    { isActive: true, joinDate: "0000-00-00", leaveDate: null },
  ], "2026-08-01"), false);
  assert.equal(projectMemberHasActiveEmploymentOnDate(membership, [
    { isActive: false, joinDate: "2026-01-01", leaveDate: "2026-12-31" },
  ], "2026-08-01"), true);
});

test("offboarded creators do not retain natural project access", () => {
  assert.equal(activeEmployeeCreatedProject(41, 41, new Set([7])), true);
  assert.equal(activeEmployeeCreatedProject(41, 41, new Set()), false);
  assert.equal(activeEmployeeCreatedProject(41, 42, new Set([7])), false);
});

test("position and department grants use only current assignments of active employees", () => {
  const activeEmployment = [{ isActive: false, joinDate: "2026-01-01", leaveDate: null }];
  assert.deepEqual(activeEmployeeAssignmentScopeIds([{
    employments: activeEmployment,
    positions: [
      { positionId: 10, departmentId: 20, startDate: "2026-01-01", endDate: null },
      { positionId: 11, departmentId: 21, startDate: "2025-01-01", endDate: "2025-12-31" },
      { positionId: 12, departmentId: 22, startDate: "0000-00-00", endDate: null },
    ],
  }], "2026-08-01"), { positionIds: [10], departmentIds: [20] });

  assert.deepEqual(activeEmployeeAssignmentScopeIds([{
    employments: [{ isActive: true, joinDate: "2025-01-01", leaveDate: "2026-07-31" }],
    positions: [{ positionId: 10, departmentId: 20, startDate: "2026-01-01", endDate: null }],
  }], "2026-08-01"), { positionIds: [], departmentIds: [] });
});
