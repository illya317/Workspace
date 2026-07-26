import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

import {
  WORK_ASSIGNED_ANALYSIS_SOURCE_REGISTRATIONS,
  WORK_ASSIGNED_ITEM_FIELD_CLASSIFICATIONS,
  WORK_ASSIGNED_PLAN_FIELD_CLASSIFICATIONS,
  WORK_ASSIGNED_PLAN_GROUP_FIELD_CLASSIFICATIONS,
  WORK_ASSIGNED_RESPONSE_FIELD_CLASSIFICATIONS,
  iterateWorkAssignedItemAnalysisRows,
  iterateWorkAssignedPlanGroupAnalysisRows,
  type WorkAssignedResponseData,
} from "./workspace-analysis-assigned-sources";

test("inherits the assigned route read contract and keeps every page scope viewer-bound", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(WORK_ASSIGNED_ANALYSIS_SOURCE_REGISTRATIONS);

  assert.deepEqual(catalog.list().map((source) => source.sourceKey), [
    "work.assigned-items",
    "work.assigned-plan-groups",
  ]);
  for (const source of catalog.list()) {
    assert.equal(source.ownerModuleKey, "work");
    assert.deepEqual(source.authorization, {
      resourceKey: "work.tasks",
      requiredActions: ["read"],
      projection: "default",
      enforcement: "serviceDelegated",
    });
    assert.deepEqual(source.parameters, []);
    assert.deepEqual(source.scopeBindings, {
      personal: {
        mode: "viewer",
        description: "读取当前查看人在原承接页可见的全部分配事项，不归属到当前个人空间。",
      },
      department: {
        mode: "viewer",
        description: "读取当前查看人在原承接页可见的全部分配事项，不伪造为目标部门数据。",
      },
      project: {
        mode: "viewer",
        description: "读取当前查看人在原承接页可见的全部分配事项，不伪造为目标项目数据。",
      },
    });
    assert.equal(source.limits.maxRows, 5_000);
    assert.equal(source.limits.maxGroups, 500);
    assert.equal(source.limits.maxPageSize, 250);
    assert.equal(source.limits.maxPages, 20);
    const registration = catalog.resolve(source.sourceKey, 1);
    assert.ok(registration?.adapter.kind === "workspaceGet");
    assert.deepEqual(registration.adapter.scopeQuery, {
      personal: { requesterId: "requesterId" },
      department: { requesterId: "requesterId" },
      project: { requesterId: "requesterId" },
    });
  }
});

test("exhaustively classifies response aliases and nested plan-group arrays", () => {
  assert.deepEqual(Object.keys(WORK_ASSIGNED_RESPONSE_FIELD_CLASSIFICATIONS), [
    "works",
    "collaborationWorks",
    "planGroups",
    "collaborationPlanGroups",
  ]);
  assert.equal(WORK_ASSIGNED_RESPONSE_FIELD_CLASSIFICATIONS.works.reason, "derivedDuplicate");
  assert.equal(WORK_ASSIGNED_RESPONSE_FIELD_CLASSIFICATIONS.collaborationWorks.reason, "derivedDuplicate");
  assert.deepEqual(WORK_ASSIGNED_RESPONSE_FIELD_CLASSIFICATIONS.planGroups, {
    classification: "childSource",
    sourceKey: "work.assigned-plan-groups",
    description: "部门或项目空间分配的计划组规范化为承接计划组事实。",
  });
  assert.equal(
    WORK_ASSIGNED_RESPONSE_FIELD_CLASSIFICATIONS.collaborationPlanGroups.classification,
    "childSource",
  );

  assert.deepEqual(Object.keys(WORK_ASSIGNED_PLAN_GROUP_FIELD_CLASSIFICATIONS), [
    "plan",
    "works",
    "assignedWorks",
    "assignedWorkIds",
    "arrangerEmployeeName",
    "assignerSpaceName",
  ]);
  assert.equal(WORK_ASSIGNED_PLAN_GROUP_FIELD_CLASSIFICATIONS.plan.reason, "nonScalar");
  assert.equal(WORK_ASSIGNED_PLAN_GROUP_FIELD_CLASSIFICATIONS.works.reason, "derivedDuplicate");
  assert.deepEqual(WORK_ASSIGNED_PLAN_GROUP_FIELD_CLASSIFICATIONS.assignedWorks, {
    classification: "childSource",
    sourceKey: "work.assigned-items",
    description: "计划组内实际分配给查看人的事项拆为一事项一行。",
  });
  assert.equal(WORK_ASSIGNED_PLAN_GROUP_FIELD_CLASSIFICATIONS.assignedWorkIds.reason, "derivedDuplicate");

  assert.equal(WORK_ASSIGNED_PLAN_FIELD_CLASSIFICATIONS.maintenance.reason, "controlPlane");
  assert.equal(WORK_ASSIGNED_PLAN_FIELD_CLASSIFICATIONS.governance.reason, "controlPlane");
  assert.equal(WORK_ASSIGNED_PLAN_FIELD_CLASSIFICATIONS.itemStatusCounts.reason, "derivedDuplicate");
  assert.equal(WORK_ASSIGNED_ITEM_FIELD_CLASSIFICATIONS.evidenceTaskIds.reason, "derivedDuplicate");
  assert.equal(WORK_ASSIGNED_ITEM_FIELD_CLASSIFICATIONS.evidenceTasks.classification, "childSource");
  assert.equal(WORK_ASSIGNED_ITEM_FIELD_CLASSIFICATIONS.participants.classification, "childSource");
});

test("flattens both assignment channels once and never treats personal collaboration as DepartmentCollaboration", () => {
  const data = assignedFixture();
  const groups = [...iterateWorkAssignedPlanGroupAnalysisRows(data)];
  const items = [...iterateWorkAssignedItemAnalysisRows(data)];

  assert.deepEqual(groups.map((row) => ({
    id: row.id,
    targetType: row.targetType,
    assignmentKind: row.assignmentKind,
    arrangerEmployeeName: row.arrangerEmployeeName,
    assignerSpaceName: row.assignerSpaceName,
  })), [
    {
      id: 101,
      targetType: "department",
      assignmentKind: "department_or_project",
      arrangerEmployeeName: null,
      assignerSpaceName: "销售部",
    },
    {
      id: 202,
      targetType: "personal",
      assignmentKind: "personal_collaboration",
      arrangerEmployeeName: "李经理",
      assignerSpaceName: null,
    },
  ]);
  assert.deepEqual(items.map((row) => ({
    id: row.id,
    assignmentKind: row.assignmentKind,
    assignedPlanTitle: row.assignedPlanTitle,
    assignedPlanKind: row.assignedPlanKind,
    collaborationId: row.collaborationId,
    arrangerEmployeeName: row.arrangerEmployeeName,
    assignerSpaceName: row.assignerSpaceName,
  })), [
    {
      id: 1001,
      assignmentKind: "department_or_project",
      assignedPlanTitle: "销售目标",
      assignedPlanKind: "okr",
      collaborationId: 77,
      arrangerEmployeeName: null,
      assignerSpaceName: "销售部",
    },
    {
      id: 2002,
      assignmentKind: "personal_collaboration",
      assignedPlanTitle: "经理个人计划",
      assignedPlanKind: "routine",
      collaborationId: null,
      arrangerEmployeeName: "李经理",
      assignerSpaceName: null,
    },
  ]);
  assert.equal(items.some((row) => row.id === 9999), false, "top-level compatibility arrays must not duplicate rows");
  assert.equal(items.some((row) => row.id === 8888), false, "group.works compatibility alias must not duplicate rows");
});

function assignedFixture(): WorkAssignedResponseData {
  const departmentItem = itemFixture(1001, 101, "department", 12, 77);
  const personalItem = itemFixture(2002, 202, "personal", 34, null);
  return {
    works: [itemFixture(9999, 999, "department", 99, null)],
    collaborationWorks: [itemFixture(9999, 999, "personal", 99, null)],
    planGroups: [{
      plan: planFixture(101, "department", 12, "okr", "销售目标"),
      works: [itemFixture(8888, 101, "department", 12, null)],
      assignedWorks: [departmentItem],
      assignedWorkIds: [departmentItem.id],
      arrangerEmployeeName: null,
      assignerSpaceName: "销售部",
    }],
    collaborationPlanGroups: [{
      plan: planFixture(202, "personal", 34, "routine", "经理个人计划"),
      works: [itemFixture(8888, 202, "personal", 34, null)],
      assignedWorks: [personalItem],
      assignedWorkIds: [personalItem.id],
      arrangerEmployeeName: "李经理",
      assignerSpaceName: null,
    }],
  } as unknown as WorkAssignedResponseData;
}

function planFixture(id: number, targetType: string, targetId: number, kind: string, title: string) {
  return { id, targetType, targetId, kind, title, description: "", status: "active" };
}

function itemFixture(id: number, planId: number, targetType: string, targetId: number, collaborationId: number | null) {
  return {
    id,
    planId,
    targetType,
    targetId,
    category: "non-routine",
    itemType: "task",
    content: `事项 ${id}`,
    collaborationId,
  };
}
