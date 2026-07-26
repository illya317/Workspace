import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "./workspace-analysis-source-registry";
import {
  defineWorkspaceAnalysisDerivedReadModel,
  defineWorkspaceAnalysisReadModel,
} from "./workspace-analysis-read-model";

type WorkflowLedgerRow = {
  id: number;
  occurredAt: string;
  payload: unknown;
  credentialMarker: string;
};

const workflowLedger = defineWorkspaceAnalysisReadModel<WorkflowLedgerRow>()({
  sourceKey: "settings.workflow-events",
  version: 1,
  label: "流程台账",
  description: "以一条流程治理事件为粒度，沿用系统管理流程台账的可见范围。",
  apiPath: "/api/settings/admin/workflow-ledger",
  rowsPath: "items",
  totalPath: "total",
  scopes: {
    personal: { mode: "workspace", description: "明确显示为当前账号可见的全公司流程台账。" },
    department: { mode: "workspace", description: "明确显示为当前账号可见的全公司流程台账。" },
    project: { mode: "workspace", description: "明确显示为当前账号可见的全公司流程台账。" },
  },
  fields: {
    id: {
      classification: "field",
      label: "事件 ID",
      description: "流程台账事件的稳定标识。",
      valueKind: "integer",
      sensitivity: "internal",
      exportPolicy: "allowed",
    },
    occurredAt: {
      classification: "field",
      label: "发生日期",
      description: "流程事件发生日期。",
      valueKind: "date",
      sensitivity: "internal",
      exportPolicy: "allowed",
    },
    payload: {
      classification: "childSource",
      sourceKey: "settings.workflow-event-details",
      description: "任意 JSON 需先拆成稳定的子读模型。",
    },
    credentialMarker: {
      classification: "omit",
      reason: "credential",
      description: "凭证类字段不能形成分析投影。",
    },
  },
  migration: {
    workspaceApiV2: {
      equivalence: "directRows",
      fields: ["id", "occurredAt"],
    },
  },
  pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 100, maxPages: 10 },
  limits: { maxRows: 1_000, maxGroups: 200, maxPageSize: 100, maxPages: 10, maxBytes: 2_097_152, timeoutMs: 5_000 },
});

test("read model inherits the exact business GET authorization and projects all classified fields", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog([workflowLedger]);
  const source = catalog.get("settings.workflow-events", 1);

  assert.deepEqual(source?.authorization, {
    resourceKey: "settings.admin",
    requiredActions: ["audit"],
    projection: "default",
    enforcement: "serviceDelegated",
  });
  assert.deepEqual(source?.fields.map((field) => field.key), ["id", "occurredAt"]);
  assert.deepEqual(source?.fields[0]?.capabilities.aggregateOperations, ["count", "distinctCount", "sum", "average", "min", "max"]);
  assert.deepEqual(source?.fields[1]?.capabilities.filterOperators, ["equals", "range", "year", "month"]);
  assert.deepEqual(workflowLedger.adapter.scopeQuery, {});
  assert.deepEqual(workflowLedger.migration?.workspaceApiV2?.fields, ["id", "occurredAt"]);
  assert.deepEqual(workflowLedger.fieldCoverage, [
    { fieldKey: "id", disposition: "analytical" },
    { fieldKey: "occurredAt", disposition: "analytical" },
    {
      fieldKey: "payload",
      disposition: "childSource",
      sourceKey: "settings.workflow-event-details",
      description: "任意 JSON 需先拆成稳定的子读模型。",
    },
    {
      fieldKey: "credentialMarker",
      disposition: "omit",
      reason: "credential",
      description: "凭证类字段不能形成分析投影。",
    },
  ]);
});

test("derived read model inherits authorization without claiming an HTTP row shape", () => {
  const derived = defineWorkspaceAnalysisDerivedReadModel<{ path: string; value: string }>()({
    sourceKey: "settings.workflow-event-snapshot-values",
    version: 1,
    label: "流程事件快照字段",
    description: "从一个已授权流程事件的固化快照分段派生字段。",
    authorizationApiPath: "/api/settings/admin/workflow-ledger",
    derivation: {
      kind: "partitionedSnapshot",
      description: "按事件和稳定分段号读取固化快照标量。",
    },
    scopes: { personal: { mode: "workspace", description: "明确显示为当前账号可见的全公司流程台账。" } },
    parameters: [{
      key: "segment",
      label: "分段",
      description: "稳定分段号。",
      kind: "integer",
      required: true,
    }],
    fields: {
      path: {
        classification: "field",
        label: "路径",
        description: "快照标量路径。",
        valueKind: "text",
        sensitivity: "internal",
        exportPolicy: "allowed",
      },
      value: {
        classification: "field",
        label: "值",
        description: "快照标量值。",
        valueKind: "text",
        sensitivity: "internal",
        exportPolicy: "allowed",
      },
    },
    pagination: { pageSize: 100, maxPages: 10 },
    limits: { maxRows: 1_000, maxGroups: 200, maxPageSize: 100, maxPages: 10, maxBytes: 2_097_152, timeoutMs: 5_000 },
  });
  const catalog = createWorkspaceAnalysisSourceCatalog([derived]);

  assert.equal(derived.adapter.kind, "ownerDerived");
  assert.equal("rowsPath" in derived.adapter, false);
  assert.equal("totalPath" in derived.adapter.pagination, false);
  assert.equal("parameterQuery" in derived.adapter, false);
  assert.deepEqual(catalog.get(derived.definition.sourceKey, 1)?.authorization, workflowLedger.definition.authorization);
});

test("read model rejects non-business and credential routes", () => {
  assert.throws(() => defineWorkspaceAnalysisReadModel<{ version: string }>()({
    sourceKey: "settings.version",
    version: 1,
    label: "版本",
    description: "公开构建版本。",
    apiPath: "/api/settings/version",
    rowsPath: "items",
    totalPath: "total",
    scopes: { personal: { mode: "workspace", description: "公开版本。" } },
    fields: {
      version: {
        classification: "field",
        label: "版本",
        description: "构建版本。",
        valueKind: "text",
        sensitivity: "internal",
        exportPolicy: "allowed",
      },
    },
    pagination: { pageParam: "page", pageSizeParam: "pageSize", pageSize: 1, maxPages: 1 },
    limits: { maxRows: 1, maxGroups: 1, maxPageSize: 1, maxPages: 1, maxBytes: 1_024, timeoutMs: 500 },
  }), /必须引用受保护的业务 GET contract/);
});
