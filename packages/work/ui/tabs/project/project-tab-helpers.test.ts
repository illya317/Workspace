import assert from "node:assert/strict";
import test from "node:test";
import { applyProjectTypeRules, canCreateProjectDraft, projectMatchesFilter } from "./project-tab-helpers";
import { createEmptyProjectDraft, type ProjectItem, type ProjectSpace } from "./model";

const noCreatePermissions = {
  canCreate: false,
  canCreateOrg: false,
  canUpdate: false,
  canDelete: false,
  canRevise: false,
};

test("project submission eligibility does not depend on enabling-department space permission", () => {
  const draft = {
    ...createEmptyProjectDraft(),
    leadingDepartmentId: 10,
    enablingDepartmentIds: [21, 22],
  };
  assert.equal(canCreateProjectDraft(draft, [], noCreatePermissions), true);
});

test("department project filters use the leading department instead of the first enabling department", () => {
  const project = {
    projectType: "department",
    projectLevel: "普通",
    leadingDepartmentId: 10,
    enablingDepartmentIds: [21, 22],
  } as ProjectItem;
  assert.equal(projectMatchesFilter(project, "全部", "department", 10), true);
  assert.equal(projectMatchesFilter(project, "全部", "department", 21), false);
});

test("company projects derive the leading department from the operating committee", () => {
  const spaces = [{
    targetType: "committee",
    targetId: 8,
    name: "治理委员会",
    subtitle: "M000 · 治理委员会",
    isOperatingCommittee: true,
    role: "manager",
    actionPermissions: {
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canRevise: false,
      canManagePermissions: false,
    },
  }] satisfies ProjectSpace[];
  const result = applyProjectTypeRules({ ...createEmptyProjectDraft(), projectType: "company" }, spaces);
  assert.equal(result.leadingDepartmentId, 8);
  assert.deepEqual(result.enablingDepartmentIds, []);
});
