import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { WorkspaceAnalysisSourceLoadRequest } from "@workspace/platform/server/workspace-analysis-runtime";
import { WorkspaceAnalysisRuntimeError } from "@workspace/platform/server/workspace-analysis-runtime";

mock.module("server-only", { namedExports: {} } as never);

let operationalReadAllowed = true;
let financeCostReadAllowed = true;
const operationalCommands: Array<Record<string, unknown>> = [];
const permissionChecks: Array<Record<string, unknown>> = [];
const serviceCalls: Array<{ sourceKey: string; command: Record<string, unknown> }> = [];
const generalCalls: Array<Record<string, unknown>> = [];

mock.module("../workspace-analysis-source-pages", {
  namedExports: {
    isFinanceGeneralWorkspaceAnalysisSource: (sourceKey: string) => sourceKey === "finance.ledger.accounts",
    loadFinanceGeneralWorkspaceAnalysisSourcePage: async (input: Record<string, unknown>) => {
      generalCalls.push(input);
      return { rows: [{ id: 31, code: "1001", name: "库存现金", rawSecret: "hidden" }], totalRows: 1 };
    },
  },
} as never);

mock.module("@workspace/platform/server/auth", {
  namedExports: {
    canEnterResource: async () => financeCostReadAllowed,
    evaluatePermissionAction: async (
      requesterId: number,
      resourceKey: string,
      action: string,
      options: Record<string, unknown>,
    ) => {
      permissionChecks.push({ requesterId, resourceKey, action, options });
      return financeCostReadAllowed;
    },
  },
} as never);

mock.module("./operational-analytics", {
  namedExports: {
    canReadOperationalAnalytics: async () => operationalReadAllowed,
    executeOperationalAnalyticsShipmentList: async (_requesterId: number, command: Record<string, unknown>) => {
      operationalCommands.push(command);
      const page = Number(command.page);
      const data = page === 1
        ? [{ amount: 10, employeeName: "张三", rawSecret: "hidden" }]
        : [{ amount: 20, employeeName: "李四", rawSecret: "hidden" }];
      return { ok: true, data: { success: true, data, pagination: { total: 2 } } };
    },
  },
} as never);

mock.module("./shipments", {
  namedExports: {
    listShipments: async (command: Record<string, unknown>) => {
      serviceCalls.push({ sourceKey: "finance.cost.shipments", command });
      return paged([{ id: 11, customerName: "客户甲", sourceFile: "shipments.xlsx", rawSecret: "hidden" }]);
    },
  },
} as never);

mock.module("./cost-analysis", {
  namedExports: {
    listCostAnalysis: async (command: Record<string, unknown>) => {
      serviceCalls.push({ sourceKey: "finance.cost.analysis", command });
      return paged([{ metricName: "材料占比", value: 0.42, sourceFile: "analysis.xlsx" }]);
    },
  },
} as never);

mock.module("./cost-structure", {
  namedExports: {
    listCostStructure: async (command: Record<string, unknown>) => {
      serviceCalls.push({ sourceKey: "finance.cost.structure", command });
      return paged([{
        productId: 21,
        productName: "产品甲",
        manufacturingSubtotal: 120,
        product: { id: 21, code: "P-21", name: "产品甲" },
      }]);
    },
  },
} as never);

mock.module("./sales-salary", {
  namedExports: {
    listSalesSalaries: async (command: Record<string, unknown>) => {
      serviceCalls.push({ sourceKey: "finance.cost.sales-salary", command });
      return paged([{ employeeName: "销售甲", actualSalary: 9_800, rawSecret: "hidden" }]);
    },
  },
} as never);

mock.module("./workshop-reports", {
  namedExports: {
    listWorkshopReports: async (command: Record<string, unknown>) => {
      serviceCalls.push({ sourceKey: "finance.cost.workshop-reports", command });
      return paged([{
        id: 51,
        importId: 19,
        employeeId: 7,
        workPoint: 12.5,
        sourceFile: "workshop.xlsx",
        rawSecret: "hidden",
      }]);
    },
  },
} as never);

const { loadFinanceWorkspaceAnalysisSource } = await import("./workspace-analysis-source-executor");

test("personal shipment owner still forces target scope and projects only requested fields", async () => {
  reset();
  const result = await loadFinanceWorkspaceAnalysisSource(request({
    sourceKey: "finance.shipments",
    targetType: "personal",
    fields: ["amount", "employeeName"],
    parameters: { dateFrom: "2026-01-01", dateTo: "2026-12-31" },
    maxRows: 2,
    maxPages: 2,
  }));

  assert.deepEqual(operationalCommands, [
    {
      scopeType: "personal",
      scopeId: 7,
      importId: undefined,
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      productName: undefined,
      customerName: undefined,
      page: 1,
      pageSize: 1,
    },
    {
      scopeType: "personal",
      scopeId: 7,
      importId: undefined,
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      productName: undefined,
      customerName: undefined,
      page: 2,
      pageSize: 1,
    },
  ]);
  assert.deepEqual(result.rows, [
    { amount: 10, employeeName: "张三" },
    { amount: 20, employeeName: "李四" },
  ]);
  assert.equal(permissionChecks.length, 0);
});

test("company-wide shipment source inherits finance.cost.read without applying the page target as a data filter", async () => {
  reset();
  const result = await loadFinanceWorkspaceAnalysisSource(request({
    sourceKey: "finance.cost.shipments",
    targetType: "project",
    fields: ["id", "customerName", "sourceFile"],
    parameters: { customerName: "客户甲" },
  }));

  assert.deepEqual(permissionChecks, [{
    requesterId: 7,
    resourceKey: "finance.cost",
    action: "read",
    options: { projection: "default" },
  }]);
  assert.deepEqual(serviceCalls, [{
    sourceKey: "finance.cost.shipments",
    command: {
      importId: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      productName: undefined,
      customerName: "客户甲",
      page: 1,
      pageSize: 1,
    },
  }]);
  assert.deepEqual(result.rows, [{ id: 11, customerName: "客户甲", sourceFile: "shipments.xlsx" }]);
});

test("cost analysis, structure and restricted salary sources execute their existing paginated list services", async () => {
  reset();
  const analysis = await loadFinanceWorkspaceAnalysisSource(request({
    sourceKey: "finance.cost.analysis",
    targetType: "department",
    fields: ["metricName", "value"],
    parameters: { year: 2026, month: 6, sourceFile: "analysis" },
  }));
  const structure = await loadFinanceWorkspaceAnalysisSource(request({
    sourceKey: "finance.cost.structure",
    targetType: "personal",
    fields: ["productId", "productName", "manufacturingSubtotal"],
    parameters: { year: 2026, productName: "产品甲" },
  }));
  const salary = await loadFinanceWorkspaceAnalysisSource(request({
    sourceKey: "finance.cost.sales-salary",
    targetType: "project",
    fields: ["employeeName", "actualSalary"],
    parameters: { year: 2026 },
  }));

  assert.deepEqual(analysis.rows, [{ metricName: "材料占比", value: 0.42 }]);
  assert.deepEqual(structure.rows, [{ productId: 21, productName: "产品甲", manufacturingSubtotal: 120 }]);
  assert.deepEqual(salary.rows, [{ employeeName: "销售甲", actualSalary: 9_800 }]);
  assert.equal(JSON.stringify(structure).includes("P-21"), false);
  assert.deepEqual(serviceCalls.map((call) => call.command), [
    { importId: undefined, year: 2026, month: 6, sourceFile: "analysis", page: 1, pageSize: 1 },
    { importId: undefined, year: 2026, month: undefined, sourceFile: undefined, page: 1, pageSize: 1, productName: "产品甲" },
    { importId: undefined, year: 2026, month: undefined, sourceFile: undefined, page: 1, pageSize: 1 },
  ]);
});

test("import-bound historical workshop rows use the complete paginated service and preserve restricted fields", async () => {
  reset();
  const result = await loadFinanceWorkspaceAnalysisSource(request({
    sourceKey: "finance.cost.workshop-reports",
    targetType: "department",
    fields: ["id", "importId", "employeeId", "workPoint", "sourceFile"],
    parameters: { importId: 19, year: 2026, productName: "产品甲" },
  }));

  assert.deepEqual(permissionChecks, [{
    requesterId: 7,
    resourceKey: "finance.cost",
    action: "read",
    options: { projection: "default" },
  }]);
  assert.deepEqual(serviceCalls, [{
    sourceKey: "finance.cost.workshop-reports",
    command: {
      importId: 19,
      year: 2026,
      month: undefined,
      sourceFile: undefined,
      page: 1,
      pageSize: 1,
      productName: "产品甲",
    },
  }]);
  assert.deepEqual(result.rows, [{
    id: 51,
    importId: 19,
    employeeId: 7,
    workPoint: 12.5,
    sourceFile: "workshop.xlsx",
  }]);
});

test("owner executor rechecks each source's owning read permission before loading", async () => {
  reset();
  financeCostReadAllowed = false;
  await assert.rejects(
    () => loadFinanceWorkspaceAnalysisSource(request({
      sourceKey: "finance.cost.analysis",
      targetType: "department",
      fields: ["value"],
    })),
    (error) => error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_forbidden",
  );
  assert.equal(serviceCalls.length, 0);

  reset();
  operationalReadAllowed = false;
  await assert.rejects(
    () => loadFinanceWorkspaceAnalysisSource(request({
      sourceKey: "finance.shipments",
      targetType: "personal",
      fields: ["amount"],
    })),
    (error) => error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_forbidden",
  );
  assert.equal(operationalCommands.length, 0);
});

test("general Finance sources reuse their exact ledger permission and the shared owner executor", async () => {
  reset();
  const result = await loadFinanceWorkspaceAnalysisSource(request({
    sourceKey: "finance.ledger.accounts",
    targetType: "department",
    fields: ["id", "code", "name"],
    parameters: { year: 2026 },
  }));

  assert.deepEqual(permissionChecks, [{
    requesterId: 7,
    resourceKey: "finance.ledger",
    action: "read",
    options: { projection: "default" },
  }]);
  assert.deepEqual(generalCalls, [{
    sourceKey: "finance.ledger.accounts",
    parameters: { year: 2026 },
    page: 1,
    pageSize: 1,
  }]);
  assert.deepEqual(result.rows, [{ id: 31, code: "1001", name: "库存现金" }]);
});

function request(input: {
  sourceKey: string;
  targetType: WorkspaceAnalysisSourceLoadRequest["targetType"];
  fields: string[];
  parameters?: Record<string, string | number | boolean>;
  maxRows?: number;
  maxPages?: number;
}): WorkspaceAnalysisSourceLoadRequest {
  return {
    requesterId: 7,
    targetType: input.targetType,
    targetId: 7,
    ownerUnitId: "finance",
    sourceKey: input.sourceKey,
    sourceVersion: 1,
    parameters: input.parameters ?? {},
    fields: input.fields,
    limits: {
      maxRows: input.maxRows ?? 1,
      maxGroups: 20,
      pageSize: 1,
      maxPages: input.maxPages ?? 1,
      maxBytes: 10_000,
      timeoutMs: 1_000,
    },
    signal: new AbortController().signal,
  };
}

function paged<T>(data: T[]) {
  return { data, pagination: { page: 1, pageSize: 1, total: data.length, totalPages: 1 } };
}

function reset() {
  operationalReadAllowed = true;
  financeCostReadAllowed = true;
  operationalCommands.length = 0;
  permissionChecks.length = 0;
  serviceCalls.length = 0;
  generalCalls.length = 0;
}
