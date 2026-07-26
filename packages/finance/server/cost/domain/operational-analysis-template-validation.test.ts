import assert from "node:assert/strict";
import test from "node:test";

import {
  operationalAnalysisTemplateInputSchema,
  operationalAnalysisTemplateRuntimeInputSchema,
  storedWorkspaceSourcesOperationalAnalysisTemplateInputSchema,
  workspaceSourcesOperationalAnalysisTemplateInputSchema,
} from "../operational-analysis-template-schema";
import { WORKSPACE_ANALYSIS_HR_JOIN_DEFINITION_EXAMPLE } from "@workspace/platform/workspace-analysis-source-contract";
import { validateWorkspaceAnalysisSourcePath } from "@workspace/platform/workspace-analysis-source-policy";
import { validateOperationalAnalysisTemplate } from "./operational-analysis-template-validation";

test("accepts a declarative cost template and serializes its workspace code", () => {
  const parsed = operationalAnalysisTemplateInputSchema.parse({
    scopeType: "department",
    scopeId: 12,
    name: "产品成本分析",
    definition: {
      schemaVersion: 1,
      dataset: "finance.costStructure",
      filters: ["year", "month", "product"],
      blocks: [
        { kind: "costMetrics", metrics: ["manufacturingCost", "unitCost"] },
        { kind: "costTrend", metric: "manufacturingCost", comparison: "both" },
      ],
    },
  });

  const result = validateOperationalAnalysisTemplate(parsed);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.data.code, /"finance\.costStructure"/);
  assert.equal(result.data.description, null);
});

test("rejects executable fields and duplicate business blocks", () => {
  const executable = operationalAnalysisTemplateInputSchema.safeParse({
    scopeType: "department",
    scopeId: 12,
    name: "危险模板",
    definition: {
      schemaVersion: 1,
      dataset: "finance.costStructure",
      filters: ["year"],
      sql: "select * from User",
      blocks: [{ kind: "costMetrics", metrics: ["manufacturingCost"] }],
    },
  });
  assert.equal(executable.success, true, "unknown definition keys are stripped before persistence");
  if (executable.success) assert.equal("sql" in executable.data.definition, false);

  const duplicate = operationalAnalysisTemplateInputSchema.safeParse({
    scopeType: "department",
    scopeId: 12,
    name: "重复模板",
    definition: {
      schemaVersion: 1,
      dataset: "finance.costStructure",
      filters: ["year"],
      blocks: [
        { kind: "costMetrics", metrics: ["manufacturingCost"] },
        { kind: "costMetrics", metrics: ["unitCost"] },
      ],
    },
  });
  assert.equal(duplicate.success, false);
});

test("project workspace cannot claim an unavailable sales attribution", () => {
  const parsed = operationalAnalysisTemplateInputSchema.parse({
    scopeType: "project",
    scopeId: 7,
    name: "项目销售",
    definition: {
      schemaVersion: 1,
      dataset: "sales.shipments",
      filters: ["period"],
      blocks: [{ kind: "salesMetrics" }],
    },
  });

  const result = validateOperationalAnalysisTemplate(parsed);
  assert.deepEqual(result, { ok: false, error: "项目尚未建立销售归集关系，不能创建项目销售模板" });
});

test("accepts a registered protected GET API as a generic analysis source", () => {
  const parsed = operationalAnalysisTemplateInputSchema.parse({
    scopeType: "department",
    scopeId: 12,
    name: "部门入职分析",
    definition: WORKSPACE_ANALYSIS_HR_JOIN_DEFINITION_EXAMPLE,
  });

  const result = validateOperationalAnalysisTemplate(parsed);
  assert.equal(result.ok, true);
  if (result.ok) assert.match(result.data.code, /"workspace\.api"/);
});

test("generic analysis source policy rejects recursive and non-dataset GET routes", () => {
  assert.equal(
    validateWorkspaceAnalysisSourcePath("/api/modules/finance/cost/operational-analytics/spaces/department/12/templates"),
    "不能递归读取经营分析接口",
  );
  assert.equal(
    validateWorkspaceAnalysisSourcePath(WORKSPACE_ANALYSIS_HR_JOIN_DEFINITION_EXAMPLE.sources[0].path.replace("/employments", "/generated/export")),
    "导出、下载、预览或附件接口不是稳定分析数据集",
  );
  assert.equal(
    validateWorkspaceAnalysisSourcePath("/api/settings/account/api-key"),
    "凭证与访问密钥接口不能作为分析数据源",
  );
  assert.equal(
    validateWorkspaceAnalysisSourcePath("/api/modules/hr/roster/autocomplete"),
    "联想、搜索和下拉选项接口不是完整稳定的数据集",
  );
  assert.equal(
    validateWorkspaceAnalysisSourcePath("/api/modules/work/tasks/spaces/department/12/permissions"),
    "空间权限矩阵属于控制面，不能作为经营分析事实",
  );
  assert.equal(
    validateWorkspaceAnalysisSourcePath("/api/settings/account/profile"),
    "个人偏好与账号设置属于控制面，不能作为经营分析事实",
  );
});

test("generic analysis source policy inherits non-read GET actions", () => {
  assert.equal(validateWorkspaceAnalysisSourcePath("/api/settings/admin/workflow-ledger"), null);
});

test("stored definitions read v3 while new writes accept only workspace.sources", () => {
  const input = {
    scopeType: "department",
    scopeId: 12,
    name: "部门发货汇总",
    definition: {
      schemaVersion: 3,
      dataset: "workspace.sources",
      sources: [{ key: "shipments", sourceKey: "finance.shipments", sourceVersion: 1 }],
      filters: [],
      blocks: [{
        key: "count",
        kind: "metrics",
        source: "shipments",
        metrics: [{ key: "count", label: "发货笔数", operation: "count" }],
      }],
    },
  };
  assert.equal(operationalAnalysisTemplateInputSchema.safeParse(input).success, true);
  assert.equal(workspaceSourcesOperationalAnalysisTemplateInputSchema.safeParse(input).success, true);
  assert.equal(workspaceSourcesOperationalAnalysisTemplateInputSchema.safeParse({
    ...input,
    definition: WORKSPACE_ANALYSIS_HR_JOIN_DEFINITION_EXAMPLE,
  }).success, false);
});

test("v3 runtime input contains only an exact revision and bounded filter values", () => {
  assert.deepEqual(operationalAnalysisTemplateRuntimeInputSchema.parse({
    revision: 3,
    filterValues: { year: "2026" },
  }), {
    revision: 3,
    filterValues: { year: "2026" },
  });
  assert.equal(operationalAnalysisTemplateRuntimeInputSchema.safeParse({
    revision: 3,
    definition: { dataset: "workspace.sources" },
  }).success, false);
  assert.equal(operationalAnalysisTemplateRuntimeInputSchema.safeParse({
    revision: 3,
    filterValues: Object.fromEntries(Array.from({ length: 13 }, (_, index) => [`filter${index}`, "x"])),
  }).success, false);
});

test("v3 proposal storage binds modification inputs to an exact base revision", () => {
  const input = workspaceSourcesOperationalAnalysisTemplateInputSchema.parse({
    scopeType: "department",
    scopeId: 12,
    templateId: 31,
    name: "部门发货汇总",
    definition: {
      schemaVersion: 3,
      dataset: "workspace.sources",
      sources: [{ key: "shipments", sourceKey: "finance.shipments", sourceVersion: 1 }],
      filters: [],
      blocks: [{
        key: "count",
        kind: "metrics",
        source: "shipments",
        metrics: [{ key: "count", label: "发货笔数", operation: "count" }],
      }],
    },
  });
  assert.equal(storedWorkspaceSourcesOperationalAnalysisTemplateInputSchema.safeParse({ input }).success, false);
  assert.equal(storedWorkspaceSourcesOperationalAnalysisTemplateInputSchema.safeParse({ input, expectedRevision: 4 }).success, true);
  assert.equal(storedWorkspaceSourcesOperationalAnalysisTemplateInputSchema.safeParse({
    input: { ...input, templateId: undefined },
    expectedRevision: 4,
  }).success, false);
});
