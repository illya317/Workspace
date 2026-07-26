import assert from "node:assert/strict";
import test from "node:test";

import type {
  WorkspaceAnalysisSourceDefinition,
  WorkspaceApiOperationalAnalysisDefinition,
} from "../workspace-analysis-source-contract";
import {
  type WorkspaceApiV2AuthorizedSourceResolver,
  type WorkspaceApiV2MigrationDiagnosticCode,
  upgradeWorkspaceApiV2Definition,
} from "./workspace-analysis-v2-upgrader";

const sourceDefinition = {
  sourceKey: "hr.synthetic-employments",
  version: 3,
  label: "合成雇佣事实",
  description: "测试中经 owner 证明与旧接口逐行等价的合成数据源。",
  ownerModuleKey: "hr",
  authorization: {
    resourceKey: "hr.roster",
    requiredActions: ["read"],
    projection: "default",
    enforcement: "gateway",
  },
  scopeBindings: {
    department: { mode: "target", description: "测试 resolver 已证明目标部门口径等价。" },
  },
  parameters: [],
  fields: [
    {
      key: "joinDate",
      label: "入职日期",
      description: "合成入职日期。",
      kind: "date",
      sensitivity: "internal",
      exportPolicy: "allowed",
      capabilities: {
        displayable: true,
        filterOperators: ["year", "month", "range"],
        groupable: true,
        aggregateOperations: ["count", "distinctCount"],
      },
    },
    {
      key: "employeeName",
      label: "姓名",
      description: "合成员工姓名。",
      kind: "text",
      sensitivity: "confidential",
      exportPolicy: "allowed",
      capabilities: {
        displayable: true,
        filterOperators: ["equals", "contains"],
        groupable: true,
        aggregateOperations: ["count", "distinctCount"],
      },
    },
    {
      key: "employeeCode",
      label: "工号",
      description: "合成员工编号。",
      kind: "text",
      sensitivity: "confidential",
      exportPolicy: "allowed",
      capabilities: {
        displayable: true,
        filterOperators: ["equals", "contains"],
        groupable: true,
        aggregateOperations: ["count", "distinctCount"],
      },
    },
  ],
  limits: {
    maxRows: 5_000,
    maxGroups: 500,
    maxPageSize: 500,
    maxPages: 10,
    maxBytes: 5_242_880,
    timeoutMs: 10_000,
  },
} as const satisfies WorkspaceAnalysisSourceDefinition;

const legacyDefinition = {
  schemaVersion: 2,
  dataset: "workspace.api",
  layout: "stack",
  sources: [{
    key: "employment_rows",
    label: "部门雇佣记录",
    path: "/api/modules/hr/roster/employments",
    rowsPath: "items",
    query: { departmentId: { binding: "scopeId" } },
    pagination: { totalPath: "total", pageSize: 500, maxPages: 20 },
  }],
  filters: [
    { key: "join-year", label: "入职年份", source: "employment_rows", field: "legacy.join_date", kind: "year" },
  ],
  blocks: [
    {
      kind: "apiMetrics",
      source: "employment_rows",
      metrics: [{ key: "join_count", label: "入职人数", operation: "count", field: "legacy.join_date", format: "integer" }],
    },
    {
      kind: "apiChart",
      source: "employment_rows",
      title: "入职趋势",
      dimension: { field: "legacy.join_date", bucket: "month" },
      metrics: [{ key: "join-count", label: "入职人数", operation: "count", field: "legacy.join_date", format: "integer" }],
      comparison: "both",
    },
    {
      kind: "apiTable",
      source: "employment_rows",
      title: "员工明细",
      columns: [
        { key: "employee_name", label: "姓名", field: "legacy.employee_name" },
        { key: "employee-code", label: "工号", field: "legacy.employee_code" },
      ],
      limit: 100,
    },
  ],
} as const satisfies WorkspaceApiOperationalAnalysisDefinition;

const fieldMappings = {
  "legacy.join_date": "joinDate",
  "legacy.employee_name": "employeeName",
  "legacy.employee_code": "employeeCode",
} as const;

function resolvedResolver(
  definition: WorkspaceAnalysisSourceDefinition = sourceDefinition,
  parameters: Readonly<Record<string, string | number | boolean>> = {},
): WorkspaceApiV2AuthorizedSourceResolver {
  return {
    resolve: () => ({
      status: "resolved",
      value: { sourceDefinition: definition, parameters, fieldMappings },
    }),
  };
}

test("upgrades an exact authorized legacy row mapping and strips every transport detail", () => {
  let referencedFields: readonly string[] = [];
  const result = upgradeWorkspaceApiV2Definition({
    definition: legacyDefinition,
    scopeType: "department",
    resolver: {
      resolve(input) {
        referencedFields = input.referencedFields;
        return resolvedResolver().resolve(input);
      },
    },
  });

  assert.equal(result.status, "upgraded");
  if (result.status !== "upgraded") return;
  assert.deepEqual(referencedFields, ["legacy.employee_code", "legacy.employee_name", "legacy.join_date"]);
  assert.equal(result.definition.sources[0]?.key, "employmentRows");
  assert.equal(result.definition.sources[0]?.sourceKey, "hr.synthetic-employments");
  assert.deepEqual(result.definition.filters.map((filter) => filter.key), ["joinYear"]);
  assert.deepEqual(result.definition.blocks.map((block) => block.key), ["block1", "block2", "block3"]);
  assert.equal(result.notices[0]?.code, "execution_policy_changed");
  const serialized = JSON.stringify(result.definition);
  for (const forbidden of ["/api/", "rowsPath", "query", "pagination"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("reports execution policy changes when the legacy pagination budget was stricter", () => {
  const stricterLegacy = {
    ...legacyDefinition,
    sources: [{
      ...legacyDefinition.sources[0],
      pagination: { totalPath: "total", pageSize: 10, maxPages: 1 },
    }],
  } satisfies WorkspaceApiOperationalAnalysisDefinition;
  const result = upgradeWorkspaceApiV2Definition({
    definition: stricterLegacy,
    scopeType: "department",
    resolver: resolvedResolver(),
  });

  assert.equal(result.status, "upgraded");
  if (result.status === "upgraded") {
    assert.deepEqual(result.notices.map((notice) => notice.code), ["execution_policy_changed"]);
  }
});

test("does not report an execution policy change when all three budgets are identical", () => {
  const identicalBudget = {
    ...legacyDefinition,
    sources: [{
      ...legacyDefinition.sources[0],
      pagination: { totalPath: "total", pageSize: 500, maxPages: 10 },
    }],
  } satisfies WorkspaceApiOperationalAnalysisDefinition;
  const result = upgradeWorkspaceApiV2Definition({
    definition: identicalBudget,
    scopeType: "department",
    resolver: resolvedResolver(),
  });

  assert.equal(result.status, "upgraded");
  if (result.status === "upgraded") assert.deepEqual(result.notices, []);
});

test("forwards authorized resolver diagnostics without returning a partial definition", () => {
  const codes = [
    "source_unavailable",
    "source_mapping_missing",
    "source_mapping_ambiguous",
    "scope_semantics_mismatch",
    "query_semantics_mismatch",
    "path_parameter_invalid",
    "field_mapping_ambiguous",
  ] as const satisfies readonly WorkspaceApiV2MigrationDiagnosticCode[];
  for (const code of codes) {
    const diagnostic = {
      code,
      path: ["sources", 0, code] as const,
      message: `forward ${code}`,
      sourceAlias: "employment_rows",
    };
    const result = upgradeWorkspaceApiV2Definition({
      definition: legacyDefinition,
      scopeType: "department",
      resolver: { resolve: () => ({ status: "needsMigration", diagnostics: [diagnostic] }) },
    });
    assert.deepEqual(result, { status: "needsMigration", diagnostics: [diagnostic] });
    assert.equal("definition" in result, false);
  }
});

test("rejects missing field mappings and unsupported scope semantics", () => {
  const missingField = upgradeWorkspaceApiV2Definition({
    definition: legacyDefinition,
    scopeType: "department",
    resolver: {
      resolve: () => ({
        status: "resolved",
        value: { sourceDefinition, parameters: {}, fieldMappings: {} },
      }),
    },
  });
  assert.equal(missingField.status, "needsMigration");
  if (missingField.status === "needsMigration") {
    assert.ok(missingField.diagnostics.every((diagnostic) => diagnostic.code === "field_mapping_missing"));
  }

  const wrongScope = upgradeWorkspaceApiV2Definition({
    definition: legacyDefinition,
    scopeType: "personal",
    resolver: resolvedResolver(),
  });
  assert.equal(wrongScope.status, "needsMigration");
  if (wrongScope.status === "needsMigration") {
    assert.ok(wrongScope.diagnostics.some((diagnostic) => diagnostic.code === "scope_semantics_mismatch"));
  }
});

test("rejects resolver parameters that do not satisfy the exact source version", () => {
  const parameterized = {
    ...sourceDefinition,
    parameters: [{
      key: "dateFrom",
      label: "开始日期",
      description: "开始日期。",
      kind: "date",
      required: true,
    }],
  } as const satisfies WorkspaceAnalysisSourceDefinition;
  const result = upgradeWorkspaceApiV2Definition({
    definition: legacyDefinition,
    scopeType: "department",
    resolver: resolvedResolver(parameterized, { dateFrom: "2026-02-30" }),
  });
  assert.equal(result.status, "needsMigration");
  if (result.status === "needsMigration") {
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "parameter_value_invalid"));
  }
});

test("rejects deterministic camel-case identifier collisions before resolution", () => {
  let calls = 0;
  const definition = {
    ...legacyDefinition,
    sources: [
      { ...legacyDefinition.sources[0], key: "employee-rows" },
      { ...legacyDefinition.sources[0], key: "employee_rows" },
    ],
    filters: [],
    blocks: [{ kind: "note", content: "仅用于碰撞测试" }],
  } as WorkspaceApiOperationalAnalysisDefinition;
  const result = upgradeWorkspaceApiV2Definition({
    definition,
    scopeType: "department",
    resolver: { resolve: () => { calls += 1; return resolvedResolver().resolve({} as never); } },
  });
  assert.equal(result.status, "needsMigration");
  if (result.status === "needsMigration") {
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "identifier_collision"));
  }
  assert.equal(calls, 0);
});

test("reports the v3 four-source contract failure instead of emitting a partial upgrade", () => {
  const sources = Array.from({ length: 5 }, (_, index) => ({
    ...legacyDefinition.sources[0],
    key: `source${index + 1}`,
  }));
  const definition = {
    ...legacyDefinition,
    sources,
    filters: [],
    blocks: sources.map((source, index) => ({
      kind: "apiMetrics" as const,
      source: source.key,
      metrics: [{ key: `count${index + 1}`, label: "行数", operation: "count" as const }],
    })),
  } satisfies WorkspaceApiOperationalAnalysisDefinition;
  const result = upgradeWorkspaceApiV2Definition({
    definition,
    scopeType: "department",
    resolver: resolvedResolver(),
  });
  assert.equal(result.status, "needsMigration");
  if (result.status === "needsMigration") {
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "v3_compile_failed"));
    assert.equal("definition" in result, false);
  }
});
