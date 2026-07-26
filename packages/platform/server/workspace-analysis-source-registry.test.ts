import assert from "node:assert/strict";
import test from "node:test";

import type { WorkspaceAnalysisSourceDefinition } from "../workspace-analysis-source-contract";
import {
  createWorkspaceAnalysisSourceCatalog,
  type WorkspaceAnalysisSourceRegistration,
  validateWorkspaceAnalysisSourceDefinition,
} from "./workspace-analysis-source-registry";

const TEST_SOURCE_PATH = ["", "api", "modules", "hr", "roster", "employments"].join("/");

const validSource = {
  sourceKey: "hr.employments",
  version: 1,
  label: "雇佣记录",
  description: "按员工当前部门归属查询雇佣记录。",
  ownerModuleKey: "hr",
  authorization: {
    resourceKey: "hr.roster",
    requiredActions: ["read"],
    projection: "default",
    enforcement: "gateway",
  },
  scopeBindings: {
    department: { mode: "target", description: "强制绑定目标部门 ID。" },
  },
  parameters: [],
  fields: [{
    key: "joinDate",
    label: "入职日期",
    description: "员工当前雇佣记录的入职日期。",
    kind: "date",
    sensitivity: "confidential",
    exportPolicy: "allowed",
    capabilities: {
      displayable: true,
      filterOperators: ["year", "month"],
      groupable: true,
      aggregateOperations: ["count"],
    },
  }],
  limits: { maxRows: 5_000, maxGroups: 500, maxPageSize: 500, maxPages: 10, maxBytes: 5_242_880, timeoutMs: 10_000 },
} as const satisfies WorkspaceAnalysisSourceDefinition;

const validRegistration = {
  definition: validSource,
  adapter: {
    kind: "workspaceGet",
    path: TEST_SOURCE_PATH,
    rowsPath: "items",
    fieldPaths: { joinDate: "joinDate" },
    scopeQuery: { department: { departmentId: "scopeId" } },
    parameterQuery: {},
    pagination: {
      pageParam: "page",
      pageSizeParam: "pageSize",
      totalPath: "total",
      pageSize: 500,
      maxPages: 10,
    },
  },
} as const;

test("registers versioned sources and resolves the latest version", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog();
  catalog.register(validRegistration);
  catalog.register({ ...validRegistration, definition: { ...validSource, version: 2 } });

  assert.deepEqual(catalog.get("hr.employments", 1), validSource);
  assert.equal(catalog.latest("hr.employments")?.version, 2);
  assert.deepEqual(catalog.list().map((source) => source.version), [1, 2]);
});

test("validates that every declared child source is executable in the owner catalog", () => {
  const parent = {
    ...validRegistration,
    fieldCoverage: [
      { fieldKey: "joinDate", disposition: "analytical" as const },
      {
        fieldKey: "details",
        disposition: "childSource" as const,
        sourceKey: "hr.employment-details",
        description: "一对多详情拆为子数据源。",
      },
    ],
  };
  const child = {
    ...validRegistration,
    definition: { ...validSource, sourceKey: "hr.employment-details", label: "雇佣详情" },
  };

  const incomplete = createWorkspaceAnalysisSourceCatalog([parent]);
  assert.throws(() => incomplete.validateReferences(), /未注册的子数据源/);

  const complete = createWorkspaceAnalysisSourceCatalog([parent, child]);
  assert.doesNotThrow(() => complete.validateReferences());
});

test("rejects duplicate identities and parameters that can override scope", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog();
  catalog.register(validRegistration);
  assert.throws(() => catalog.register(validRegistration), /重复注册经营分析数据源/);
  assert.throws(() => catalog.register({
    ...validRegistration,
    definition: {
      ...validSource,
      version: 2,
      parameters: [{
        key: "departmentId",
        label: "部门",
        description: "不应由模板覆盖",
        kind: "integer",
      }],
    },
  }), /覆盖系统空间绑定/);
});

test("requires the sourceKey namespace to match its owner unit", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog();
  assert.throws(() => catalog.register({
    ...validRegistration,
    definition: { ...validSource, sourceKey: "finance.employments" },
  }), /sourceKey 前缀必须等于 ownerModuleKey/);
});

test("normalizes camel-cased module owners to their deploy/source namespace", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog();
  catalog.register({
    definition: {
      ...validSource,
      sourceKey: "capital-securities.companies",
      label: "证券公司主数据",
      ownerModuleKey: "capitalSecurities",
      authorization: {
        resourceKey: "capitalSecurities.governance",
        requiredActions: ["read"],
        projection: "default",
        enforcement: "gateway",
      },
      scopeBindings: { personal: { mode: "workspace", description: "全公司证券治理数据。" } },
    },
    adapter: {
      ...validRegistration.adapter,
      path: "/api/modules/capitalSecurities/governance/companies",
      scopeQuery: {},
    },
  });

  assert.equal(catalog.get("capital-securities.companies", 1)?.ownerModuleKey, "capitalSecurities");
});

test("inherits any protected GET action without inventing a second read permission", () => {
  assert.doesNotThrow(() => validateWorkspaceAnalysisSourceDefinition({
    ...validSource,
    authorization: { ...validSource.authorization, requiredActions: ["audit"] },
  }));
  assert.throws(() => validateWorkspaceAnalysisSourceDefinition({
    ...validSource,
    authorization: { ...validSource.authorization, requiredActions: [] },
  }), /必须继承业务 GET 的授权动作/);
  assert.throws(() => validateWorkspaceAnalysisSourceDefinition({
    ...validSource,
    authorization: { ...validSource.authorization, requiredActions: ["read", "read"] },
  }), /授权动作不能重复/);
});

test("rejects unsafe execution budgets", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog();
  assert.throws(() => catalog.register({
    ...validRegistration,
    definition: {
      ...validSource,
      limits: { ...validSource.limits, maxRows: 5_001 },
    },
  }), /分页容量小于 maxRows/);
});

test("rejects numeric aggregations on non-numeric fields", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog();
  assert.throws(() => catalog.register({
    ...validRegistration,
    definition: {
      ...validSource,
      fields: [{
        ...validSource.fields[0],
        capabilities: {
          ...validSource.fields[0].capabilities,
          aggregateOperations: ["sum"],
        },
      }],
    },
  }), /不是数值字段/);
});

test("rejects target scope bindings that do not force scopeId", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog();
  assert.throws(() => catalog.register({
    ...validRegistration,
    adapter: {
      ...validRegistration.adapter,
      scopeQuery: { department: { scopeType: "scopeType" } },
    },
  }), /target 空间必须强制绑定 scopeId/);
});

test("accepts viewer and workspace scope modes with honest system bindings", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog();
  catalog.register({
    ...validRegistration,
    definition: {
      ...validSource,
      version: 2,
      scopeBindings: { department: { mode: "viewer", description: "按请求人已有业务可见性读取。" } },
    },
    adapter: {
      ...validRegistration.adapter,
      scopeQuery: { department: { userId: "requesterId" } },
    },
  });
  catalog.register({
    ...validRegistration,
    definition: {
      ...validSource,
      version: 3,
      scopeBindings: { department: { mode: "workspace", description: "明确展示为全公司数据。" } },
    },
    adapter: {
      ...validRegistration.adapter,
      scopeQuery: {},
    },
  });
  assert.equal(catalog.get("hr.employments", 2)?.scopeBindings.department?.mode, "viewer");
  assert.equal(catalog.get("hr.employments", 3)?.scopeBindings.department?.mode, "workspace");
});

test("rejects dishonest viewer and workspace query bindings", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog();
  assert.throws(() => catalog.register({
    ...validRegistration,
    definition: {
      ...validSource,
      scopeBindings: { department: { mode: "viewer", description: "按请求人读取。" } },
    },
    adapter: { ...validRegistration.adapter, scopeQuery: {} },
  }), /viewer 空间必须强制绑定 requesterId/);
  assert.throws(() => catalog.register({
    ...validRegistration,
    definition: {
      ...validSource,
      scopeBindings: { department: { mode: "workspace", description: "全公司数据。" } },
    },
  }), /workspace 数据不能伪装空间查询条件/);
});

test("rejects parameter mappings that can override scope or pagination", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog();
  for (const queryKey of ["departmentId", "page"] as const) {
    assert.throws(() => catalog.register({
      ...validRegistration,
      definition: {
        ...validSource,
        parameters: [{
          key: "search",
          label: "搜索",
          description: "普通搜索参数。",
          kind: "text",
        }],
      },
      adapter: {
        ...validRegistration.adapter,
        parameterQuery: { search: queryKey },
      },
    }), /覆盖系统查询条件/);
  }
});

test("validates cross-parameter constraints against registered parameter kinds", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog();
  assert.throws(() => catalog.register({
    ...validRegistration,
    definition: {
      ...validSource,
      parameters: [
        { key: "from", label: "开始", description: "开始日期", kind: "date" },
        { key: "to", label: "结束", description: "错误地登记为文本", kind: "text" },
      ],
      parameterConstraints: [{
        kind: "orderedDates",
        from: "from",
        to: "to",
        description: "结束日期不能早于开始日期",
      }],
    },
    adapter: {
      ...validRegistration.adapter,
      parameterQuery: { from: "dateFrom", to: "dateTo" },
    },
  }), /只能约束日期参数/);
});

test("rejects prototype paths in registered projections", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog();
  assert.throws(() => catalog.register({
    ...validRegistration,
    adapter: {
      ...validRegistration.adapter,
      fieldPaths: { joinDate: "constructor.prototype" },
    },
  }), /fieldPath 无效/);
});

test("rejects aliases that can downgrade one raw field's policy", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog();
  assert.throws(() => catalog.register({
    ...validRegistration,
    definition: {
      ...validSource,
      fields: [
        ...validSource.fields,
        { ...validSource.fields[0], key: "joinDateAlias", exportPolicy: "forbidden" },
      ],
    },
    adapter: {
      ...validRegistration.adapter,
      fieldPaths: { joinDate: "joinDate", joinDateAlias: "joinDate" },
    },
  }), /多个字段不能映射到同一原始字段/);
});

test("stores an immutable copy after validation", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog();
  const mutable = structuredClone(validRegistration);
  catalog.register(mutable);

  (mutable.definition as { label: string }).label = "事后篡改";
  assert.equal(catalog.get("hr.employments", 1)?.label, "雇佣记录");
  const resolved = catalog.resolve("hr.employments", 1);
  assert.ok(resolved);
  assert.equal(Object.isFrozen(resolved), true);
  assert.equal(Object.isFrozen(resolved.adapter.fieldPaths), true);
});

test("rejects authorization metadata that drifts from the API contract", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog();
  assert.throws(() => catalog.register({
    ...validRegistration,
    definition: {
      ...validSource,
      authorization: { ...validSource.authorization, resourceKey: "finance.cost" },
    },
  }), /授权资源与 API contract 不一致/);
});

test("requires a canonical projection for every registered field", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog();
  assert.throws(() => catalog.register({
    ...validRegistration,
    adapter: { ...validRegistration.adapter, fieldPaths: {} },
  }), /缺少 adapter 映射/);
});

test("registers honest owner-derived rows without transport paths and forbids v2 opt-in", () => {
  const derivedRegistration = {
    definition: validSource,
    adapter: {
      kind: "ownerDerived",
      path: TEST_SOURCE_PATH,
      derivation: {
        kind: "partitionedSnapshot",
        description: "owner 从获授权记录的固化快照中按稳定分段派生行。",
      },
      fieldPaths: { joinDate: "joinDate" },
      pagination: { pageSize: 500, maxPages: 10 },
    },
  } as const satisfies WorkspaceAnalysisSourceRegistration;
  const catalog = createWorkspaceAnalysisSourceCatalog([derivedRegistration]);
  const adapter = catalog.resolve("hr.employments", 1)?.adapter;
  assert.equal(adapter?.kind, "ownerDerived");
  assert.equal(adapter && "rowsPath" in adapter, false);
  assert.equal(adapter && "totalPath" in adapter.pagination, false);
  assert.equal(adapter && "parameterQuery" in adapter, false);

  assert.throws(() => createWorkspaceAnalysisSourceCatalog([{
    ...derivedRegistration,
    migration: { workspaceApiV2: { equivalence: "directRows", fields: "all" } },
  } as unknown as WorkspaceAnalysisSourceRegistration]), /ownerDerived 数据源不能声明 workspaceApiV2 迁移/);
  assert.throws(() => createWorkspaceAnalysisSourceCatalog([{
    ...derivedRegistration,
    adapter: {
      ...derivedRegistration.adapter,
      derivation: { kind: "unknown", description: "类型断言不能绕过运行时白名单。" },
    },
  } as unknown as WorkspaceAnalysisSourceRegistration]), /ownerDerived 派生类型无效/);
});

test("accepts only explicit direct-row v2 migration declarations and real field subsets", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog();
  catalog.register({
    ...validRegistration,
    migration: { workspaceApiV2: { equivalence: "directRows", fields: "all" } },
  });
  assert.equal(catalog.resolve("hr.employments", 1)?.migration?.workspaceApiV2?.equivalence, "directRows");

  assert.throws(() => createWorkspaceAnalysisSourceCatalog([{
    ...validRegistration,
    definition: { ...validSource, version: 2 },
    migration: {
      workspaceApiV2: { equivalence: "directRows", fields: ["missingField"] },
    },
  }]), /引用了未登记字段/);
  assert.throws(() => createWorkspaceAnalysisSourceCatalog([{
    ...validRegistration,
    definition: { ...validSource, version: 3 },
    migration: {
      workspaceApiV2: { equivalence: "directRows", fields: [] },
    },
  }]), /all 或非空字段子集/);
  assert.throws(() => createWorkspaceAnalysisSourceCatalog([{
    ...validRegistration,
    definition: { ...validSource, version: 4 },
    migration: {
      workspaceApiV2: { equivalence: "unsafe" as "directRows", fields: "all" },
    },
  }]), /显式声明 directRows/);
});

test("requires every dynamic v2 route placeholder to map to a real canonical parameter", () => {
  const dynamicRegistration = {
    ...validRegistration,
    definition: {
      ...validSource,
      version: 5,
      authorization: {
        resourceKey: "hr.performance",
        requiredActions: ["read"],
        projection: "default",
        enforcement: "serviceDelegated",
      },
      parameters: [{
        key: "reviewId",
        label: "考核 ID",
        description: "考核稳定标识。",
        kind: "integer",
        required: true,
      }],
    },
    migration: {
      workspaceApiV2: {
        equivalence: "directRows",
        pathParameters: { reviewId: "reviewId" },
        fields: ["joinDate"],
      },
    },
    adapter: {
      ...validRegistration.adapter,
      path: "/api/modules/hr/performance/[reviewId]",
      parameterQuery: { reviewId: "reviewId" },
    },
  } as const;
  assert.doesNotThrow(() => createWorkspaceAnalysisSourceCatalog([dynamicRegistration]));
  assert.throws(() => createWorkspaceAnalysisSourceCatalog([{
    ...dynamicRegistration,
    definition: { ...dynamicRegistration.definition, version: 6 },
    migration: {
      workspaceApiV2: { equivalence: "directRows", fields: "all" },
    },
  }]), /完整映射动态路径参数/);
  assert.throws(() => createWorkspaceAnalysisSourceCatalog([{
    ...dynamicRegistration,
    definition: { ...dynamicRegistration.definition, version: 7 },
    migration: {
      workspaceApiV2: {
        equivalence: "directRows",
        pathParameters: { reviewId: "missingParameter" },
        fields: "all",
      },
    },
  }]), /引用了未登记参数/);
});

test("rejects duplicate v2 row-flow declarations across exact source versions", () => {
  const first = {
    ...validRegistration,
    definition: { ...validSource, version: 8 },
    migration: { workspaceApiV2: { equivalence: "directRows" as const, fields: "all" as const } },
  };
  const second = {
    ...validRegistration,
    definition: { ...validSource, version: 9 },
    migration: {
      workspaceApiV2: {
        equivalence: "directRows" as const,
        fields: ["joinDate"] as const,
      },
    },
  };
  const catalog = createWorkspaceAnalysisSourceCatalog([first]);
  assert.throws(() => catalog.register(second), /迁移声明.*重叠/);
});

test("validates exhaustive public DTO field classifications when present", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog();
  assert.throws(() => catalog.register({
    ...validRegistration,
    fieldCoverage: [{ fieldKey: "unrelated", disposition: "analytical" }],
  }), /分析字段与 source definition 不一致/);
  assert.throws(() => catalog.register({
    ...validRegistration,
    fieldCoverage: [
      { fieldKey: "joinDate", disposition: "analytical" },
      { fieldKey: "joinDate", disposition: "omit", reason: "unstable", description: "重复分类。" },
    ],
  }), /public DTO 字段重复分类/);
});
