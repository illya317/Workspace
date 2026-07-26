import assert from "node:assert/strict";
import test from "node:test";

import type {
  WorkspaceAnalysisSourceDefinition,
  WorkspaceAnalysisSourceScopeType,
  WorkspaceApiSource,
} from "../workspace-analysis-source-contract";
import type {
  WorkspaceAnalysisOwnerDerivedRegistration,
  WorkspaceAnalysisSourceRegistration,
  WorkspaceAnalysisWorkspaceGetRegistration,
} from "./workspace-analysis-source-registry";
import { createWorkspaceApiV2AuthorizedRegistrationResolver } from "./workspace-analysis-v2-registration-resolver";
import { upgradeWorkspaceApiV2Definition } from "./workspace-analysis-v2-upgrader";

const fields = [
  {
    key: "employeeName",
    label: "员工姓名",
    description: "测试姓名。",
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
    key: "joinDate",
    label: "入职日期",
    description: "测试日期。",
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
] as const satisfies WorkspaceAnalysisSourceDefinition["fields"];

const definition = {
  sourceKey: "hr.synthetic-employments",
  version: 7,
  label: "合成雇佣事实",
  description: "用于证明 v2 owner 注册解析行为。",
  ownerModuleKey: "hr",
  authorization: {
    resourceKey: "hr.roster",
    requiredActions: ["read"],
    projection: "default",
    enforcement: "gateway",
  },
  scopeBindings: {
    department: { mode: "target", description: "目标部门。" },
  },
  parameters: [],
  fields,
  limits: {
    maxRows: 1_000,
    maxGroups: 100,
    maxPageSize: 100,
    maxPages: 10,
    maxBytes: 1_048_576,
    timeoutMs: 5_000,
  },
} as const satisfies WorkspaceAnalysisSourceDefinition;

const registration = {
  definition,
  migration: { workspaceApiV2: { equivalence: "directRows", fields: "all" } },
  adapter: {
    kind: "workspaceGet",
    path: "/api/modules/hr/roster/employments",
    rowsPath: "items",
    fieldPaths: {
      employeeName: "employee.name",
      joinDate: "employment.joinedAt",
    },
    scopeQuery: { department: { departmentId: "scopeId" } },
    parameterQuery: {},
    pagination: {
      pageParam: "page",
      pageSizeParam: "pageSize",
      totalPath: "total",
      pageSize: 100,
      maxPages: 10,
    },
  },
} as const satisfies WorkspaceAnalysisWorkspaceGetRegistration;

function legacySource(overrides: Partial<WorkspaceApiSource> = {}): WorkspaceApiSource {
  return {
    key: "employment_rows",
    path: "/api/modules/hr/roster/employments",
    rowsPath: "items",
    query: { departmentId: { binding: "scopeId" } },
    pagination: { totalPath: "total", pageSize: 500, maxPages: 20 },
    ...overrides,
  };
}

function resolve(input: {
  readonly registrations?: readonly WorkspaceAnalysisSourceRegistration[];
  readonly source?: WorkspaceApiSource;
  readonly scopeType?: WorkspaceAnalysisSourceScopeType;
  readonly referencedFields?: readonly string[];
} = {}) {
  return createWorkspaceApiV2AuthorizedRegistrationResolver({
    authorizedRegistrations: input.registrations ?? [registration],
  }).resolve({
    source: input.source ?? legacySource(),
    scopeType: input.scopeType ?? "department",
    referencedFields: input.referencedFields ?? ["employee.name", "employment.joinedAt"],
    path: ["sources", 0],
  });
}

test("resolves one static pre-authorized registration and returns no transport metadata", () => {
  const result = resolve();
  assert.equal(result.status, "resolved");
  if (result.status !== "resolved") return;
  assert.equal(result.value.sourceDefinition.sourceKey, "hr.synthetic-employments");
  assert.equal(result.value.sourceDefinition.version, 7);
  assert.deepEqual(result.value.parameters, {});
  assert.deepEqual(result.value.fieldMappings, {
    "employee.name": "employeeName",
    "employment.joinedAt": "joinDate",
  });
  const serialized = JSON.stringify(result.value);
  for (const forbidden of ["adapter", "rowsPath", "/api/modules", "fieldPaths", "pagination"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("maps concrete dynamic segments and ordinary queries into typed required parameters", () => {
  const dynamic = {
    ...registration,
    definition: {
      ...definition,
      sourceKey: "hr.synthetic-review-evidence",
      parameters: [
        { key: "reviewId", label: "考核 ID", description: "考核标识。", kind: "integer", required: true },
        { key: "includeEvidence", label: "包含证据", description: "是否包含证据。", kind: "boolean", required: true },
      ],
    },
    migration: {
      workspaceApiV2: {
        equivalence: "directRows",
        pathParameters: { id: "reviewId" },
        fields: "all",
      },
    },
    adapter: {
      ...registration.adapter,
      path: "/api/modules/hr/performance/reviews/[id]/evidence",
      parameterQuery: { reviewId: "reviewId", includeEvidence: "includeEvidence" },
    },
  } as const satisfies WorkspaceAnalysisWorkspaceGetRegistration;
  const result = resolve({
    registrations: [dynamic],
    source: legacySource({
      path: "/api/modules/hr/performance/reviews/42/evidence",
      query: {
        departmentId: { binding: "scopeId" },
        includeEvidence: true,
      },
    }),
  });
  assert.equal(result.status, "resolved");
  if (result.status === "resolved") {
    assert.deepEqual(result.value.parameters, { reviewId: 42, includeEvidence: true });
  }

  const invalidPath = resolve({
    registrations: [dynamic],
    source: legacySource({
      path: "/api/modules/hr/performance/reviews/042/evidence",
      query: { departmentId: { binding: "scopeId" }, includeEvidence: true },
    }),
  });
  assertDiagnostic(invalidPath, "path_parameter_invalid");

  const noCoercion = resolve({
    registrations: [dynamic],
    source: legacySource({
      path: "/api/modules/hr/performance/reviews/42/evidence",
      query: { departmentId: { binding: "scopeId" }, includeEvidence: "true" },
    }),
  });
  assertDiagnostic(noCoercion, "query_semantics_mismatch");
});

test("requires exact target bindings and never guesses viewer scope", () => {
  const primitiveDepartment = resolve({
    source: legacySource({ query: { departmentId: 8 } }),
  });
  assertDiagnostic(primitiveDepartment, "scope_semantics_mismatch");

  const extraBinding = resolve({
    source: legacySource({
      query: {
        departmentId: { binding: "scopeId" },
        targetType: { binding: "scopeType" },
      },
    }),
  });
  assertDiagnostic(extraBinding, "scope_semantics_mismatch");

  const viewer = {
    ...registration,
    definition: {
      ...definition,
      scopeBindings: { personal: { mode: "viewer", description: "当前查看者。" } },
    },
    adapter: {
      ...registration.adapter,
      scopeQuery: { personal: { userId: "requesterId" } },
    },
  } as const satisfies WorkspaceAnalysisWorkspaceGetRegistration;
  const viewerResult = resolve({
    registrations: [viewer],
    scopeType: "personal",
    source: legacySource({ query: { userId: { binding: "scopeId" } } }),
  });
  assertDiagnostic(viewerResult, "scope_semantics_mismatch");
});

test("allows workspace scope only when v2 has no fake target binding", () => {
  const workspace = {
    ...registration,
    definition: {
      ...definition,
      scopeBindings: { project: { mode: "workspace", description: "工作区公共事实。" } },
    },
    adapter: { ...registration.adapter, scopeQuery: {} },
  } as const satisfies WorkspaceAnalysisWorkspaceGetRegistration;
  assert.equal(resolve({
    registrations: [workspace],
    scopeType: "project",
    source: legacySource({ query: {} }),
  }).status, "resolved");
  assertDiagnostic(resolve({
    registrations: [workspace],
    scopeType: "project",
    source: legacySource({ query: { projectId: { binding: "scopeId" } } }),
  }), "scope_semantics_mismatch");
});

test("fails closed for missing opt-in, owner-derived adapters, row drift, and absent authorization", () => {
  const notOptedIn = { ...registration, migration: undefined } as WorkspaceAnalysisWorkspaceGetRegistration;
  assertDiagnostic(resolve({ registrations: [notOptedIn] }), "source_mapping_missing");

  const ownerDerived = {
    definition,
    adapter: {
      kind: "ownerDerived",
      path: "/api/modules/hr/roster/employments",
      derivation: { kind: "partitionedSnapshot", description: "测试 owner 派生。" },
      fieldPaths: registration.adapter.fieldPaths,
      pagination: { pageSize: 100, maxPages: 10 },
    },
  } as const satisfies WorkspaceAnalysisOwnerDerivedRegistration;
  assertDiagnostic(resolve({ registrations: [ownerDerived] }), "source_mapping_missing");
  assertDiagnostic(resolve({ source: legacySource({ rowsPath: "data" }) }), "source_mapping_missing");
  assertDiagnostic(resolve({ registrations: [] }), "source_mapping_missing");
});

test("checks pagination identity while leaving numeric budget drift to the upgrader notice", () => {
  assert.equal(resolve({
    source: legacySource({
      pagination: { totalPath: "total", pageSize: 500, maxPages: 20 },
    }),
  }).status, "resolved");
  assertDiagnostic(resolve({
    source: legacySource({
      pagination: { totalPath: "pagination.total", pageSize: 500, maxPages: 20 },
    }),
  }), "query_semantics_mismatch");
  assertDiagnostic(resolve({
    source: legacySource({
      pagination: { totalPath: "total", pageParam: "offset", pageSizeParam: "limit" },
    }),
  }), "query_semantics_mismatch");
  assertDiagnostic(resolve({ source: legacySource({ pagination: undefined }) }), "query_semantics_mismatch");
});

test("composes with the upgrader so numeric pagination drift becomes a notice", () => {
  const result = upgradeWorkspaceApiV2Definition({
    definition: {
      schemaVersion: 2,
      dataset: "workspace.api",
      sources: [legacySource()],
      filters: [],
      blocks: [{
        kind: "apiMetrics",
        source: "employment_rows",
        metrics: [{ key: "rowCount", label: "人数", operation: "count", format: "integer" }],
      }],
    },
    scopeType: "department",
    resolver: createWorkspaceApiV2AuthorizedRegistrationResolver({ authorizedRegistrations: [registration] }),
  });
  assert.equal(result.status, "upgraded");
  if (result.status === "upgraded") {
    assert.deepEqual(result.notices.map((notice) => notice.code), ["execution_policy_changed"]);
  }
});

test("requires every ordinary query parameter and every referenced field to map uniquely", () => {
  const parameterized = {
    ...registration,
    definition: {
      ...definition,
      parameters: [{ key: "year", label: "年度", description: "年度。", kind: "integer", required: true }],
    },
    adapter: { ...registration.adapter, parameterQuery: { year: "year" } },
  } as const satisfies WorkspaceAnalysisWorkspaceGetRegistration;
  assertDiagnostic(resolve({ registrations: [parameterized] }), "parameter_value_invalid");
  assert.equal(resolve({
    registrations: [parameterized],
    source: legacySource({ query: { departmentId: { binding: "scopeId" }, year: 2026 } }),
  }).status, "resolved");
  assertDiagnostic(resolve({
    registrations: [parameterized],
    source: legacySource({ query: { departmentId: { binding: "scopeId" }, year: "2026" } }),
  }), "query_semantics_mismatch");
  assertDiagnostic(resolve({
    registrations: [parameterized],
    source: legacySource({ query: { departmentId: { binding: "scopeId" }, year: 2026, unknown: true } }),
  }), "query_semantics_mismatch");

  const subset = {
    ...registration,
    migration: { workspaceApiV2: { equivalence: "directRows", fields: ["employeeName"] } },
  } as const satisfies WorkspaceAnalysisWorkspaceGetRegistration;
  assertDiagnostic(resolve({ registrations: [subset], referencedFields: ["employment.joinedAt"] }), "field_mapping_missing");

  const ambiguousFields = {
    ...registration,
    adapter: {
      ...registration.adapter,
      fieldPaths: { employeeName: "legacy.value", joinDate: "legacy.value" },
    },
  } as const satisfies WorkspaceAnalysisWorkspaceGetRegistration;
  assertDiagnostic(resolve({ registrations: [ambiguousFields], referencedFields: ["legacy.value"] }), "field_mapping_ambiguous");
});

test("count-only sources remain ambiguous and diagnostics are input-order independent", () => {
  const second = {
    ...registration,
    definition: { ...definition, sourceKey: "hr.synthetic-employments-alt", version: 1 },
  } as const satisfies WorkspaceAnalysisWorkspaceGetRegistration;
  const forward = resolve({ registrations: [registration, second], referencedFields: [] });
  const reverse = resolve({ registrations: [second, registration], referencedFields: [] });
  assertDiagnostic(forward, "source_mapping_ambiguous");
  assert.deepEqual(reverse, forward);
  assert.equal(JSON.stringify(forward).includes("hr.synthetic-employments-alt@1、hr.synthetic-employments@7"), true);
});

function assertDiagnostic(
  result: ReturnType<typeof resolve>,
  code: string,
) {
  assert.equal(result.status, "needsMigration");
  if (result.status === "needsMigration") {
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === code), JSON.stringify(result.diagnostics));
  }
}
