import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

import {
  WORK_PROJECT_PLAN_ACTIVE_BASELINE_FIELD_CLASSIFICATIONS,
  WORK_PROJECT_PLAN_DETAIL_ANALYSIS_SOURCE_REGISTRATIONS,
  WORK_PROJECT_PLAN_GANTT_RESPONSE_FIELD_CLASSIFICATIONS,
  WORK_PROJECT_PLAN_PHASES_RESPONSE_FIELD_CLASSIFICATIONS,
  iterateWorkProjectPlanBaselineItemRows,
  iterateWorkProjectPlanBaselineRows,
  iterateWorkProjectPlanDependencyRows,
  iterateWorkProjectPlanGanttItemRows,
  iterateWorkProjectPlanGanttOwnerRows,
  iterateWorkProjectPlanPhaseRows,
  type WorkProjectPlanBaselinesData,
  type WorkProjectPlanGanttData,
  type WorkProjectPlanPhasesData,
} from "./workspace-analysis-project-plan-detail-sources";

test("project plan detail sources require a project ID and inherit the protected project read contract", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(WORK_PROJECT_PLAN_DETAIL_ANALYSIS_SOURCE_REGISTRATIONS);

  assert.deepEqual(catalog.list().map((source) => source.sourceKey), [
    "work.project-plan-baseline-items",
    "work.project-plan-baselines",
    "work.project-plan-dependencies",
    "work.project-plan-gantt-items",
    "work.project-plan-gantt-owners",
    "work.project-plan-phases",
  ]);
  for (const source of catalog.list()) {
    assert.deepEqual(source.authorization, {
      resourceKey: "work.projects",
      requiredActions: ["read"],
      projection: "default",
      enforcement: "serviceDelegated",
    });
    assert.deepEqual(source.parameters, [{
      key: "planProjectId",
      label: "项目",
      description: "必选项目稳定标识；执行时由原项目阶段、基线或甘特服务复核当前查看人的对象可见性。",
      kind: "integer",
      required: true,
    }]);
    assert.equal(source.scopeBindings.personal?.mode, "viewer");
    assert.equal(source.scopeBindings.department?.mode, "viewer");
    assert.equal(source.scopeBindings.project?.mode, "viewer");
    const registration = catalog.resolve(source.sourceKey, 1);
    assert.ok(registration?.adapter.kind === "workspaceGet");
    assert.deepEqual(registration.adapter.scopeQuery, {
      personal: { requesterId: "requesterId" },
      department: { requesterId: "requesterId" },
      project: { requesterId: "requesterId" },
    });
    assert.deepEqual(registration.adapter.parameterQuery, {
      planProjectId: "planProjectId",
    });
  }

  assert.equal(
    catalog.resolve("work.project-plan-phases", 1)?.adapter.path,
    "/api/modules/work/projects/[id]/plan-phases",
  );
  assert.equal(
    catalog.resolve("work.project-plan-baselines", 1)?.adapter.path,
    "/api/modules/work/projects/[id]/plan-baselines",
  );
  assert.equal(
    catalog.resolve("work.project-plan-gantt-items", 1)?.adapter.path,
    "/api/modules/work/projects/[id]/plan-gantt",
  );
  assert.equal(catalog.get("work.project-plan-gantt-items", 1)?.limits.maxRows, 1);
  assert.equal(catalog.get("work.project-plan-baseline-items", 1)?.limits.maxRows, 1_000);
  assert.equal(catalog.get("work.project-plan-active-baselines", 1), null);
  catalog.validateReferences();
});

test("reuses phase and baseline-header facts while splitting true nested arrays", () => {
  assert.deepEqual(WORK_PROJECT_PLAN_PHASES_RESPONSE_FIELD_CLASSIFICATIONS.phases, {
    classification: "childSource",
    sourceKey: "work.project-plan-phases",
    description: "指定项目的阶段拆为一阶段一行。",
  });
  assert.equal(WORK_PROJECT_PLAN_GANTT_RESPONSE_FIELD_CLASSIFICATIONS.permissions.classification, "omit");
  assert.equal(WORK_PROJECT_PLAN_GANTT_RESPONSE_FIELD_CLASSIFICATIONS.permissions.reason, "controlPlane");
  assert.equal(WORK_PROJECT_PLAN_GANTT_RESPONSE_FIELD_CLASSIFICATIONS.phases.sourceKey, "work.project-plan-phases");
  assert.equal(WORK_PROJECT_PLAN_GANTT_RESPONSE_FIELD_CLASSIFICATIONS.items.sourceKey, "work.project-plan-gantt-items");
  assert.equal(WORK_PROJECT_PLAN_GANTT_RESPONSE_FIELD_CLASSIFICATIONS.dependencies.sourceKey, "work.project-plan-dependencies");
  assert.equal(WORK_PROJECT_PLAN_GANTT_RESPONSE_FIELD_CLASSIFICATIONS.activeBaseline.sourceKey, "work.project-plan-baselines");

  for (const key of ["id", "name", "note", "createdAt"] as const) {
    assert.equal(WORK_PROJECT_PLAN_ACTIVE_BASELINE_FIELD_CLASSIFICATIONS[key].classification, "childSource");
    assert.equal(WORK_PROJECT_PLAN_ACTIVE_BASELINE_FIELD_CLASSIFICATIONS[key].sourceKey, "work.project-plan-baselines");
  }
  assert.equal(
    WORK_PROJECT_PLAN_ACTIVE_BASELINE_FIELD_CLASSIFICATIONS.items.sourceKey,
    "work.project-plan-baseline-items",
  );

  const catalog = createWorkspaceAnalysisSourceCatalog(WORK_PROJECT_PLAN_DETAIL_ANALYSIS_SOURCE_REGISTRATIONS);
  const itemCoverage = catalog.resolve("work.project-plan-gantt-items", 1)?.fieldCoverage;
  assert.deepEqual(itemCoverage?.find((entry) => entry.fieldKey === "ownerNames"), {
    fieldKey: "ownerNames",
    disposition: "childSource",
    sourceKey: "work.project-plan-gantt-owners",
    description: "项目负责人姓名拆为一节点一负责人关系行。",
  });
});

test("normalizers preserve every public scalar and add only join context", () => {
  const phases: WorkProjectPlanPhasesData = {
    phases: [{
      id: 31,
      version: 4,
      projectId: 7,
      sequenceNo: 1,
      name: "设计",
      plannedStartDate: "2026-07-01",
      plannedEndDate: "2026-07-10",
      note: "冻结范围",
    }],
  };
  const baselines: WorkProjectPlanBaselinesData = {
    baselines: [{
      id: 41,
      name: "V1",
      note: "首次冻结",
      isActive: true,
      createdAt: "2026-07-02T03:04:05.000Z",
    }],
  };
  const gantt = ganttFixture();

  assert.deepEqual([...iterateWorkProjectPlanPhaseRows(phases)], phases.phases);
  assert.deepEqual([...iterateWorkProjectPlanBaselineRows(baselines, 7)], [{
    projectId: 7,
    ...baselines.baselines[0],
  }]);
  assert.deepEqual([...iterateWorkProjectPlanGanttItemRows(gantt)], [{
    projectId: 7,
    ...gantt.items[0],
  }]);
  assert.deepEqual([...iterateWorkProjectPlanGanttOwnerRows(gantt)], [
    { rowKey: "7:7:1", projectId: 7, planItemId: 7, ownerOrdinal: 1, ownerName: "张三" },
    { rowKey: "7:7:2", projectId: 7, planItemId: 7, ownerOrdinal: 2, ownerName: "李四" },
  ]);
  assert.deepEqual([...iterateWorkProjectPlanDependencyRows(gantt)], [{
    projectId: 7,
    ...gantt.dependencies[0],
  }]);
  assert.deepEqual([...iterateWorkProjectPlanBaselineItemRows(gantt)], [{
    projectId: 7,
    baselineId: 41,
    ...gantt.activeBaseline?.items[0],
  }]);
  assert.deepEqual([...iterateWorkProjectPlanBaselineItemRows({ ...gantt, activeBaseline: null })], []);
});

function ganttFixture(): WorkProjectPlanGanttData {
  return {
    projectId: 7,
    permissions: { canView: true },
    phases: [{
      id: 31,
      version: 4,
      projectId: 7,
      sequenceNo: 1,
      name: "设计",
      plannedStartDate: "2026-07-01",
      plannedEndDate: "2026-07-10",
      note: "冻结范围",
    }],
    items: [{
      kind: "project",
      id: 7,
      name: "新产品导入",
      parentKind: null,
      parentId: null,
      phaseId: null,
      status: "active",
      projectLevel: "A",
      isMilestone: true,
      ownerNames: ["张三", "李四"],
      actualStartDate: "2026-07-03",
      actualEndDate: null,
      plannedStartDate: "2026-07-01",
      plannedEndDate: "2026-07-31",
    }],
    dependencies: [{
      id: 51,
      predecessorKind: "project",
      predecessorId: 7,
      successorKind: "project",
      successorId: 8,
      dependencyType: "finish_start",
      lagDays: 2,
    }],
    activeBaseline: {
      id: 41,
      name: "V1",
      note: "首次冻结",
      createdAt: "2026-07-02T03:04:05.000Z",
      items: [{
        id: 61,
        itemKind: "project",
        itemId: 7,
        parentKind: null,
        parentId: null,
        phaseId: null,
        name: "新产品导入",
        status: "active",
        isMilestone: true,
        plannedStartDate: "2026-07-01",
        plannedEndDate: "2026-07-31",
      }],
    },
  } as unknown as WorkProjectPlanGanttData;
}
