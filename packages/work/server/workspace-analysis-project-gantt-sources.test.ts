import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

import {
  WORK_PROJECT_GANTT_ANALYSIS_SOURCE_REGISTRATIONS,
  WORK_PROJECT_GANTT_QUERY_FIELD_CLASSIFICATIONS,
  WORK_PROJECT_GANTT_RESPONSE_FIELD_CLASSIFICATIONS,
  iterateWorkProjectGanttLeaderAnalysisRows,
  iterateWorkProjectGanttProjectAnalysisRows,
  type WorkProjectGanttResponse,
} from "./workspace-analysis-project-gantt-sources";

test("project Gantt sources inherit the exact protected GET contract and stay viewer-scoped", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(WORK_PROJECT_GANTT_ANALYSIS_SOURCE_REGISTRATIONS);

  assert.deepEqual(catalog.list().map((source) => source.sourceKey), [
    "work.project-gantt-leaders",
    "work.project-gantt-projects",
  ]);
  for (const source of catalog.list()) {
    assert.equal(source.ownerModuleKey, "work");
    assert.deepEqual(source.authorization, {
      resourceKey: "work.projects",
      requiredActions: ["read"],
      projection: "default",
      enforcement: "serviceDelegated",
    });
    assert.equal(source.scopeBindings.personal?.mode, "viewer");
    assert.equal(source.scopeBindings.department?.mode, "viewer");
    assert.equal(source.scopeBindings.project?.mode, "viewer");
    assert.equal(source.limits.maxPages, 1);
  }
  const registration = catalog.resolve("work.project-gantt-projects", 1);
  assert.ok(registration?.adapter.kind === "workspaceGet");
  assert.deepEqual(registration.adapter.scopeQuery.department, { requesterId: "requesterId" });
  assert.equal(catalog.get("work.project-gantt-projects", 1)?.limits.maxRows, 500);
  assert.equal(catalog.get("work.project-gantt-leaders", 1)?.limits.maxRows, 500);
  catalog.validateReferences();
});

test("project Gantt source accounts for compatibility fields without exposing empty facts", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(WORK_PROJECT_GANTT_ANALYSIS_SOURCE_REGISTRATIONS);
  const projects = catalog.resolve("work.project-gantt-projects", 1);

  assert.deepEqual(Object.keys(WORK_PROJECT_GANTT_RESPONSE_FIELD_CLASSIFICATIONS), ["projects", "tasks"]);
  assert.equal(WORK_PROJECT_GANTT_RESPONSE_FIELD_CLASSIFICATIONS.projects.classification, "childSource");
  assert.deepEqual(WORK_PROJECT_GANTT_RESPONSE_FIELD_CLASSIFICATIONS.tasks, {
    classification: "omit",
    reason: "unstable",
    description: "原路由当前始终返回空 tasks 兼容集合；没有真实任务行可供分析，未来启用时必须升级读模型版本。",
  });
  assert.deepEqual(WORK_PROJECT_GANTT_QUERY_FIELD_CLASSIFICATIONS.includeTasks, {
    classification: "omit",
    reason: "unstable",
    description: "includeTasks 是尚未生效的兼容参数；当前 true/false 都返回空 tasks，不登记成可用分析参数。",
  });
  assert.deepEqual(coverage(projects, "leaderNames"), {
    fieldKey: "leaderNames",
    disposition: "childSource",
    sourceKey: "work.project-gantt-leaders",
    description: "项目负责人姓名拆为一项目一负责人关系行。",
  });
  assert.deepEqual(coverage(projects, "stages"), {
    fieldKey: "stages",
    disposition: "omit",
    reason: "unstable",
    description: "原路由当前始终返回空 stages 兼容集合；不生成虚构阶段行，未来启用时必须升级读模型版本。",
  });
  assert.deepEqual(projects?.definition.fields.map((field) => field.key), [
    "id",
    "name",
    "status",
    "projectType",
    "projectLevel",
    "leadingDepartmentId",
    "leadingDepartmentCode",
    "leadingDepartmentName",
    "workspaceEnabled",
    "actualStartDate",
    "actualEndDate",
    "completionPercent",
    "plannedStartDate",
    "plannedEndDate",
  ]);
  assert.equal(projects?.definition.parameters.length, 0);
});

test("project Gantt row flattening preserves service-resolved dates and expands public leader names", () => {
  const response: WorkProjectGanttResponse = {
    projects: [
      {
        id: 41,
        name: "新厂建设",
        status: "active",
        projectType: "company",
        projectLevel: "重点",
        leadingDepartmentId: 12,
        leadingDepartmentCode: "GOV-X",
        leadingDepartmentName: "运营部",
        workspaceEnabled: true,
        leaderNames: ["张三", "李四"],
        stages: [],
        actualStartDate: null,
        actualEndDate: null,
        completionPercent: 35,
        // These values represent the route's already-resolved active-baseline fallback.
        plannedStartDate: "2026-08-01",
        plannedEndDate: "2026-12-31",
      },
      {
        id: 42,
        name: "无负责人项目",
        status: "pending",
        projectType: "department",
        projectLevel: "普通",
        leadingDepartmentId: null,
        leadingDepartmentCode: null,
        leadingDepartmentName: null,
        workspaceEnabled: false,
        leaderNames: [],
        stages: [],
        actualStartDate: null,
        actualEndDate: null,
        completionPercent: 0,
        plannedStartDate: null,
        plannedEndDate: null,
      },
    ],
    tasks: [],
  };

  const projects = Array.from(iterateWorkProjectGanttProjectAnalysisRows(response));
  assert.deepEqual(projects, response.projects);
  assert.equal(projects[0]?.plannedStartDate, "2026-08-01");
  assert.equal(projects[0]?.plannedEndDate, "2026-12-31");
  assert.deepEqual(Array.from(iterateWorkProjectGanttLeaderAnalysisRows(response)), [
    {
      rowKey: "41:1",
      projectId: 41,
      projectName: "新厂建设",
      leaderOrdinal: 1,
      leaderName: "张三",
    },
    {
      rowKey: "41:2",
      projectId: 41,
      projectName: "新厂建设",
      leaderOrdinal: 2,
      leaderName: "李四",
    },
  ]);
});

function coverage(
  registration: { readonly fieldCoverage?: readonly { readonly fieldKey: string; readonly disposition: string; readonly [key: string]: unknown }[] } | null,
  fieldKey: string,
) {
  return registration?.fieldCoverage?.find((item) => item.fieldKey === fieldKey);
}
