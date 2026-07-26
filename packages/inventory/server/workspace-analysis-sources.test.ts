import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";
import type { WorkspaceAnalysisSourceLoadRequest } from "@workspace/platform/server/workspace-analysis-runtime";
import { WorkspaceAnalysisRuntimeError } from "@workspace/platform/server/workspace-analysis-runtime";

mock.module("server-only", { namedExports: {} } as never);

let readAllowed = true;
const permissionChecks: Array<Record<string, unknown>> = [];
const workspaceCalls: Array<Record<string, unknown>> = [];
const receiptCalls: Array<Record<string, unknown>> = [];

mock.module("@workspace/platform/server/auth", {
  namedExports: {
    canEnterResource: async () => readAllowed,
    evaluatePermissionAction: async (
      requesterId: number,
      resourceKey: string,
      action: string,
      options: Record<string, unknown>,
    ) => {
      permissionChecks.push({ requesterId, resourceKey, action, options });
      return readAllowed;
    },
  },
} as never);

mock.module("./service", {
  namedExports: {
    listInventoryWorkspace: async (scope: Record<string, unknown>) => {
      workspaceCalls.push(scope);
      return {
        items: [{ id: 1, name: "原料甲", rawSecret: "hidden" }, { id: 2, name: "成品乙", rawSecret: "hidden" }],
        warehouses: [{ id: 3, code: "W01", name: "成品库" }],
        documents: [{
          id: 4,
          documentNo: "IN-001",
          documentType: "receipt",
          documentDate: "2026-07-02",
          status: "posted",
          amount: 120,
          lines: [{ id: 40, itemCode: "FG01", itemName: "产品甲", amount: 120, paymentStatus: "paid" }],
        }],
        batches: [{ id: 5, batchNo: "250101", onHand: 10 }],
        stocktakes: [{ id: 6, stocktakeNo: "ST-001", variance: -2 }],
        imports: [{ id: 7, sourceFile: "inventory.xlsx", rowCount: 20 }],
      };
    },
  },
} as never);

mock.module("./receipts/service", {
  namedExports: {
    listInventoryReceipt: async (filters: Record<string, unknown>) => {
      receiptCalls.push(filters);
      return {
        rows: [{ id: 10, productName: "产品甲", convertedPackages: 500 }],
        reports: [{
          id: 11,
          status: "approved",
          workshopName: "固体制剂车间",
          preparedByUserId: 7,
          reviewedBy: "E009 审核人",
        }],
        productCatalog: [{ productId: 12, productName: "产品甲", defaultPackagingNote: "10盒/箱", packagingNotes: ["10盒/箱"] }],
      };
    },
  },
} as never);

const sources = await import("./workspace-analysis-sources");
const { loadInventoryWorkspaceAnalysisSource } = await import("./workspace-analysis-source-executor");

test("registers every suitable Inventory public list with inherited business GET authorization", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(sources.INVENTORY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);
  assert.deepEqual(catalog.list().map((source) => source.sourceKey), [
    "inventory.operations.batches",
    "inventory.operations.document-lines",
    "inventory.operations.documents",
    "inventory.operations.imports",
    "inventory.operations.items",
    "inventory.operations.stocktakes",
    "inventory.operations.warehouses",
    "inventory.receipt-products",
    "inventory.receipt-reports",
    "inventory.receipts",
    "inventory.receipts.product-packaging-notes",
  ]);
  for (const source of catalog.list()) {
    assert.deepEqual(source.authorization, {
      resourceKey: source.sourceKey.startsWith("inventory.operations.") ? "inventory.operations" : "inventory.receipts",
      requiredActions: ["read"],
      projection: "default",
      enforcement: "gateway",
    });
    assert.deepEqual(Object.values(source.scopeBindings).map((scope) => scope?.mode), ["workspace", "workspace", "workspace"]);
  }
});

test("coverage keeps nested lists explicit instead of leaking raw arrays", () => {
  assert.deepEqual(
    sources.INVENTORY_OPERATION_DOCUMENTS_SOURCE.fieldCoverage?.filter((item) => item.disposition !== "analytical"),
    [{
      fieldKey: "lines",
      disposition: "childSource",
      sourceKey: "inventory.operations.document-lines",
      description: "单据明细由 inventory.operations.document-lines 稳定展开并独立分页。",
    }],
  );
  assert.deepEqual(
    sources.INVENTORY_RECEIPT_PRODUCTS_SOURCE.fieldCoverage?.filter((item) => item.disposition !== "analytical"),
    [{
      fieldKey: "packagingNotes",
      disposition: "childSource",
      sourceKey: "inventory.receipts.product-packaging-notes",
      description: "历史包装说明由 inventory.receipts.product-packaging-notes 稳定展开并独立分页。",
    }],
  );
  assert.equal(
    sources.INVENTORY_RECEIPTS_SOURCE.fieldCoverage?.every((item) => item.disposition === "analytical"),
    true,
  );
  const receiptFields = new Map(sources.INVENTORY_RECEIPTS_SOURCE.definition.fields.map((field) => [field.key, field]));
  assert.deepEqual(receiptFields.get("inputQuantityTenThousands")?.capabilities.aggregateOperations, ["count", "distinctCount"]);
  assert.deepEqual(receiptFields.get("workPoints")?.capabilities.aggregateOperations, ["count", "distinctCount"]);
  const lineFields = new Map(sources.INVENTORY_OPERATION_DOCUMENT_LINES_SOURCE.definition.fields.map((field) => [field.key, field]));
  assert.equal(lineFields.get("unitPrice")?.capabilities.aggregateOperations.includes("sum"), false);
});

test("every Inventory childSource resolves to a discoverable registration", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(sources.INVENTORY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);
  const childKeys = sources.INVENTORY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS.flatMap((registration) => (
    registration.fieldCoverage?.flatMap((item) => item.disposition === "childSource" ? [item.sourceKey] : []) ?? []
  ));
  assert.deepEqual(childKeys.toSorted(), [
    "inventory.operations.document-lines",
    "inventory.receipts.product-packaging-notes",
  ]);
  for (const childKey of childKeys) assert.ok(catalog.latest(childKey));
});

test("operations executor loads one composite snapshot, paginates it and projects requested fields", async () => {
  reset();
  const result = await loadInventoryWorkspaceAnalysisSource(request({
    sourceKey: "inventory.operations.items",
    fields: ["id", "name"],
    parameters: { companyCode: "C01", year: 2026, month: 7 },
    maxRows: 2,
    maxPages: 2,
  }));

  assert.deepEqual(workspaceCalls, [{ companyCode: "C01", year: 2026, month: 7 }]);
  assert.deepEqual(result.rows, [{ id: 1, name: "原料甲" }, { id: 2, name: "成品乙" }]);
  assert.equal(JSON.stringify(result).includes("rawSecret"), false);
  assert.deepEqual(permissionChecks[0], {
    requesterId: 7,
    resourceKey: "inventory.operations",
    action: "read",
    options: { projection: "default" },
  });
});

test("receipt executor exposes rows, report lifecycle and product catalog through the existing service", async () => {
  reset();
  const receipt = await loadInventoryWorkspaceAnalysisSource(request({
    sourceKey: "inventory.receipts",
    fields: ["id", "productName", "convertedPackages"],
    parameters: { year: 2026, month: 7, q: "  产品甲  " },
  }));
  const report = await loadInventoryWorkspaceAnalysisSource(request({
    sourceKey: "inventory.receipt-reports",
    fields: ["id", "status", "workshopName", "preparedByUserId", "reviewedBy"],
  }));
  const product = await loadInventoryWorkspaceAnalysisSource(request({
    sourceKey: "inventory.receipt-products",
    fields: ["productId", "productName", "defaultPackagingNote"],
  }));

  assert.deepEqual(receipt.rows, [{ id: 10, productName: "产品甲", convertedPackages: 500 }]);
  assert.deepEqual(report.rows, [{
    id: 11,
    status: "approved",
    workshopName: "固体制剂车间",
    preparedByUserId: 7,
    reviewedBy: "E009 审核人",
  }]);
  assert.deepEqual(product.rows, [{ productId: 12, productName: "产品甲", defaultPackagingNote: "10盒/箱" }]);
  assert.deepEqual(receiptCalls, [{ year: 2026, month: 7, q: "产品甲" }, {}, {}]);
});

test("Inventory child executors flatten document lines and packaging notes from the same public snapshots", async () => {
  reset();
  const documentLine = await loadInventoryWorkspaceAnalysisSource(request({
    sourceKey: "inventory.operations.document-lines",
    fields: ["documentId", "documentNo", "documentDate", "id", "itemCode", "amount", "paymentStatus"],
    parameters: { companyCode: "C01", year: 2026, month: 7 },
  }));
  const packagingNote = await loadInventoryWorkspaceAnalysisSource(request({
    sourceKey: "inventory.receipts.product-packaging-notes",
    fields: ["productId", "productName", "defaultPackagingNote", "packagingNote"],
  }));

  assert.deepEqual(documentLine.rows, [{
    documentId: 4,
    documentNo: "IN-001",
    documentDate: "2026-07-02",
    id: 40,
    itemCode: "FG01",
    amount: 120,
    paymentStatus: "paid",
  }]);
  assert.deepEqual(packagingNote.rows, [{
    productId: 12,
    productName: "产品甲",
    defaultPackagingNote: "10盒/箱",
    packagingNote: "10盒/箱",
  }]);
  assert.deepEqual(workspaceCalls, [{ companyCode: "C01", year: 2026, month: 7 }]);
  assert.deepEqual(receiptCalls, [{}]);
});

test("Inventory executor preserves the public GET query bounds before calling a business service", async () => {
  reset();
  await assert.rejects(
    () => loadInventoryWorkspaceAnalysisSource(request({
      sourceKey: "inventory.operations.items",
      fields: ["id"],
      parameters: { companyCode: "C01", year: 2026, month: 13 },
    })),
    (error) => error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_response_invalid",
  );
  await assert.rejects(
    () => loadInventoryWorkspaceAnalysisSource(request({
      sourceKey: "inventory.receipts",
      fields: ["id"],
      parameters: { year: 2019 },
    })),
    (error) => error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_response_invalid",
  );
  assert.equal(workspaceCalls.length, 0);
  assert.equal(receiptCalls.length, 0);
});

test("Inventory owner denies execution before loading when original read permission is absent", async () => {
  reset();
  readAllowed = false;
  await assert.rejects(
    () => loadInventoryWorkspaceAnalysisSource(request({
      sourceKey: "inventory.receipts",
      fields: ["id"],
    })),
    (error) => error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_forbidden",
  );
  assert.equal(receiptCalls.length, 0);
});

function request(input: {
  sourceKey: string;
  fields: string[];
  parameters?: Record<string, string | number | boolean>;
  maxRows?: number;
  maxPages?: number;
}): WorkspaceAnalysisSourceLoadRequest {
  return {
    requesterId: 7,
    targetType: "department",
    targetId: 20,
    ownerUnitId: "inventory",
    sourceKey: input.sourceKey,
    sourceVersion: 1,
    parameters: input.parameters ?? {},
    fields: input.fields,
    limits: {
      maxRows: input.maxRows ?? 1,
      maxGroups: 20,
      pageSize: 1,
      maxPages: input.maxPages ?? 1,
      maxBytes: 20_000,
      timeoutMs: 1_000,
    },
    signal: new AbortController().signal,
  };
}

function reset() {
  readAllowed = true;
  permissionChecks.length = 0;
  workspaceCalls.length = 0;
  receiptCalls.length = 0;
}
