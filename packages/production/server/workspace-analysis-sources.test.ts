import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";
import type { WorkspaceAnalysisSourceLoadRequest } from "@workspace/platform/server/workspace-analysis-runtime";
import { WorkspaceAnalysisRuntimeError } from "@workspace/platform/server/workspace-analysis-runtime";

import { productSourceMappingAnalysisFixture } from "./workspace-analysis-product-source-mappings.fixtures";

mock.module("server-only", { namedExports: {} } as never);

let readAllowed = true;
const permissionChecks: Array<Record<string, unknown>> = [];
const productCalls: Array<Record<string, unknown>> = [];
const productSourceMappingCalls: Array<{ page: number; pageSize: number }> = [];
const defaultProductSourceMappingRows: Array<Record<string, unknown>> = [
  {
    id: 4,
    productId: 1,
    productCode: "P01",
    productName: "产品甲",
    targetKind: "product",
    targetLabel: "产品甲",
    sourceSystem: "erp",
    sourceName: "产品甲旧名",
    sourceSpecification: "10ml",
    status: "linked",
    sourceFile: "products.xlsx",
  },
  {
    id: 3,
    productId: null,
    productCode: null,
    productName: null,
    targetKind: "pending",
    targetLabel: null,
    sourceSystem: "erp",
    sourceName: "旧产品名",
    sourceSpecification: "10ml",
    status: "pending",
    sourceFile: "products.xlsx",
  },
];
let productSourceMappingRows = structuredClone(defaultProductSourceMappingRows);
let productSourceMappingTotal: number | null = null;
let qcListCalls = 0;
let qcDetailCalls = 0;

const qcBatch = {
  id: 20,
  recordUid: "qc-20",
  batchNumber: "250701",
  productId: 1,
  productKey: "product-a",
  productName: "产品甲",
  status: "submitted",
  version: 3,
  createdAt: "2026-07-01T08:00:00.000Z",
  updatedAt: "2026-07-02T09:00:00.000Z",
  inspector: "E001 张三",
  fields: { assay_result: "98.5%" },
  signatures: [{
    id: 21,
    fieldKey: "assay_reviewer",
    scopeKey: "inspection:assay",
    scopeKind: "inspection",
    stageKey: "finished",
    testName: "含量测定",
    role: "reviewer",
    meaning: "复核通过",
    signerUserId: 9,
    signerEmployeeId: "E009",
    signerName: "E009 李四",
    signedAt: "2026-07-02T09:00:00.000Z",
    signedRecordVersion: 3,
    signedPayloadHash: "abc123",
    authMethod: "active_session",
  }],
  templateSnapshot: {
    templateId: 31,
    templateVersion: 4,
    productKey: "product-a",
    productName: "产品甲",
    capturedAt: "2026-07-01T08:00:00.000Z",
    document: { title: "成品检验记录", stages: [{ key: "finished", label: "成品" }] },
    fieldModel: { assay_result: { unit: "%", required: true, min: 98 } },
  },
} as const;

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

mock.module("./products/service", {
  namedExports: {
    listProducts: async (input: Record<string, unknown>) => {
      productCalls.push(input);
      return {
        items: [
          {
            id: 1,
            code: "P01",
            name: "产品甲",
            status: "active",
            skus: [{ id: 10, productMasterId: 1, code: "SKU01", name: "产品甲 10ml", status: "active", version: 2 }],
            sourceMappings: [{
              id: 4,
              targetKind: "product",
              targetLabel: "产品甲",
              sourceSystem: "erp",
              sourceName: "产品甲旧名",
              sourceSpecification: "10ml",
              status: "linked",
              sourceFile: "products.xlsx",
            }],
          },
          { id: 2, code: "P02", name: "产品乙", status: "inactive", skus: [], sourceMappings: [] },
        ],
        total: 2,
        skuCount: 1,
        sourceMappingCount: 2,
        pendingMappingCount: 1,
        pendingMappings: [{
          id: 3,
          targetKind: "pending",
          targetLabel: null,
          sourceSystem: "erp",
          sourceName: "旧产品名",
          sourceSpecification: "10ml",
          status: "pending",
          sourceFile: "products.xlsx",
        }],
      };
    },
  },
} as never);

mock.module("./workspace-analysis-product-source-mappings", {
  namedExports: {
    listProductSourceMappingsPage: async (input: { page: number; pageSize: number }) => {
      productSourceMappingCalls.push(input);
      const start = (input.page - 1) * input.pageSize;
      return {
        rows: productSourceMappingRows.slice(start, start + input.pageSize),
        total: productSourceMappingTotal ?? productSourceMappingRows.length,
      };
    },
  },
} as never);

mock.module("./qc/batches", {
  namedExports: {
    listQcBatches: async () => {
      qcListCalls += 1;
      return {
        batches: [qcBatch],
        counts: { total: 1, draft: 0, submitted: 1, signatureCount: 1, fieldValueCount: 1 },
      };
    },
    getQcBatch: async (batchId: number) => {
      qcDetailCalls += 1;
      return batchId === qcBatch.id ? qcBatch : null;
    },
  },
} as never);

const sources = await import("./workspace-analysis-sources");
const { loadProductionWorkspaceAnalysisSource } = await import("./workspace-analysis-source-executor");

test("registers products, pending mappings and QC batches with their original read contracts", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(sources.PRODUCTION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);
  assert.deepEqual(catalog.list().map((source) => source.sourceKey), [
    "production.product-skus",
    "production.product-source-mappings",
    "production.product-source-mappings.pending",
    "production.products",
    "production.qc.batches",
    "production.qc.field-values",
    "production.qc.signatures",
    "production.qc.template-snapshot-partitions",
    "production.qc.template-snapshot-values",
  ]);
  assert.deepEqual(sources.PRODUCTION_PRODUCTS_SOURCE.definition.authorization, {
    resourceKey: "production.products",
    requiredActions: ["read"],
    projection: "default",
    enforcement: "gateway",
  });
  assert.deepEqual(
    sources.PRODUCTION_PRODUCT_SOURCE_MAPPINGS_SOURCE.definition.authorization,
    sources.PRODUCTION_PRODUCTS_SOURCE.definition.authorization,
  );
  assert.deepEqual(sources.PRODUCTION_QC_BATCHES_SOURCE.definition.authorization, {
    resourceKey: "production.qc",
    requiredActions: ["read"],
    projection: "default",
    enforcement: "gateway",
  });
  for (const registration of [
    sources.PRODUCTION_QC_TEMPLATE_SNAPSHOT_PARTITIONS_SOURCE,
    sources.PRODUCTION_QC_TEMPLATE_SNAPSHOT_VALUES_SOURCE,
  ]) {
    assert.equal(registration.adapter.kind, "ownerDerived");
    assert.equal(registration.adapter.path, "/api/modules/production/qc/[batchId]");
    assert.equal("rowsPath" in registration.adapter, false);
    assert.equal("totalPath" in registration.adapter.pagination, false);
    assert.equal("parameterQuery" in registration.adapter, false);
    assert.equal(registration.migration, undefined);
  }
  assert.equal(sources.PRODUCTION_PRODUCT_SOURCE_MAPPINGS_SOURCE.adapter.kind, "ownerDerived");
  assert.equal(sources.PRODUCTION_PRODUCT_SOURCE_MAPPINGS_SOURCE.adapter.derivation.kind, "boundedRelationSnapshot");
  assert.equal("rowsPath" in sources.PRODUCTION_PRODUCT_SOURCE_MAPPINGS_SOURCE.adapter, false);
  assert.equal("totalPath" in sources.PRODUCTION_PRODUCT_SOURCE_MAPPINGS_SOURCE.adapter.pagination, false);
  assert.equal(sources.PRODUCTION_PRODUCT_SOURCE_MAPPINGS_SOURCE.migration, undefined);
  assert.equal(sources.PRODUCTION_PENDING_PRODUCT_MAPPINGS_SOURCE.definition.limits.maxRows, 200);
  for (const source of catalog.list()) {
    assert.deepEqual(Object.values(source.scopeBindings).map((scope) => scope?.mode), ["workspace", "workspace", "workspace"]);
  }
});

test("coverage resolves every stable nested product and QC fact through child sources", () => {
  assert.deepEqual(
    sources.PRODUCTION_PRODUCTS_SOURCE.fieldCoverage?.filter((item) => item.disposition !== "analytical"),
    [
      {
        fieldKey: "skus",
        disposition: "childSource",
        sourceKey: "production.product-skus",
        description: "SKU 由 production.product-skus 从同一产品目录快照稳定展开并独立分页。",
      },
      {
        fieldKey: "sourceMappings",
        disposition: "childSource",
        sourceKey: "production.product-source-mappings",
        description: "全部已关联与待关联来源映射由 production.product-source-mappings 稳定展开。",
      },
    ],
  );
  assert.deepEqual(
    sources.PRODUCTION_QC_BATCHES_SOURCE.fieldCoverage?.filter((item) => item.disposition !== "analytical").map((item) => [item.fieldKey, item.disposition, "reason" in item ? item.reason : null]),
    [
      ["templateSnapshot", "childSource", null],
      ["fields", "childSource", null],
      ["signatures", "childSource", null],
    ],
  );
  const skuFields = new Map(sources.PRODUCTION_PRODUCT_SKUS_SOURCE.definition.fields.map((field) => [field.key, field]));
  assert.equal(skuFields.get("unitsPerPackage")?.capabilities.aggregateOperations.includes("sum"), false);
});

test("every Production childSource resolves to a discoverable registration", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(sources.PRODUCTION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);
  const childKeys = sources.PRODUCTION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS.flatMap((registration) => (
    registration.fieldCoverage?.flatMap((item) => item.disposition === "childSource" ? [item.sourceKey] : []) ?? []
  ));
  assert.deepEqual(childKeys.toSorted(), [
    "production.product-skus",
    "production.product-source-mappings",
    "production.qc.field-values",
    "production.qc.signatures",
    "production.qc.template-snapshot-values",
  ]);
  for (const childKey of childKeys) assert.ok(catalog.latest(childKey));
});

test("product executor paginates one product snapshot and projects only requested fields", async () => {
  reset();
  const result = await loadProductionWorkspaceAnalysisSource(request({
    sourceKey: "production.products",
    fields: ["id", "code", "name"],
    parameters: { keyword: "  产品  " },
    maxRows: 2,
    maxPages: 2,
  }));

  assert.deepEqual(productCalls, [{ keyword: "产品" }]);
  assert.deepEqual(result.rows, [
    { id: 1, code: "P01", name: "产品甲" },
    { id: 2, code: "P02", name: "产品乙" },
  ]);
  assert.deepEqual(permissionChecks[0], {
    requesterId: 7,
    resourceKey: "production.products",
    action: "read",
    options: { projection: "default" },
  });
});

test("Production executor preserves the public product keyword limit before service execution", async () => {
  reset();
  await assert.rejects(
    () => loadProductionWorkspaceAnalysisSource(request({
      sourceKey: "production.products",
      fields: ["id"],
      parameters: { keyword: "x".repeat(121) },
    })),
    (error) => error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_response_invalid",
  );
  assert.equal(productCalls.length, 0);
});

test("pending mappings and QC batches reuse their existing list services without exposing nested payloads", async () => {
  reset();
  const mapping = await loadProductionWorkspaceAnalysisSource(request({
    sourceKey: "production.product-source-mappings.pending",
    fields: ["id", "sourceSystem", "sourceName", "status"],
  }));
  const qc = await loadProductionWorkspaceAnalysisSource(request({
    sourceKey: "production.qc.batches",
    fields: ["id", "batchNumber", "productName", "status", "inspector", "templateId", "templateCapturedAt"],
  }));

  assert.deepEqual(mapping.rows, [{ id: 3, sourceSystem: "erp", sourceName: "旧产品名", status: "pending" }]);
  assert.deepEqual(qc.rows, [{
    id: 20,
    batchNumber: "250701",
    productName: "产品甲",
    status: "submitted",
    inspector: "E001 张三",
    templateId: 31,
    templateCapturedAt: "2026-07-01T08:00:00.000Z",
  }]);
  assert.equal(JSON.stringify(qc).includes("dynamic"), false);
  assert.deepEqual(productCalls, [{}]);
  assert.equal(qcListCalls, 1);
  assert.equal(qcDetailCalls, 0);
});

test("Production child executors flatten SKU, mappings, QC signatures, values and template semantics", async () => {
  reset();
  const sku = await loadProductionWorkspaceAnalysisSource(request({
    sourceKey: "production.product-skus",
    fields: ["id", "productMasterId", "productCode", "productName", "code", "name", "version"],
    parameters: { keyword: "产品" },
  }));
  const mappings = await loadProductionWorkspaceAnalysisSource(request({
    sourceKey: "production.product-source-mappings",
    fields: ["id", "productId", "productCode", "sourceSystem", "sourceName", "status"],
    maxRows: 2,
    maxPages: 2,
  }));
  const signature = await loadProductionWorkspaceAnalysisSource(request({
    sourceKey: "production.qc.signatures",
    fields: ["batchId", "recordUid", "id", "signerUserId", "signerName", "signedAt", "signedPayloadHash"],
  }));
  const fieldValue = await loadProductionWorkspaceAnalysisSource(request({
    sourceKey: "production.qc.field-values",
    fields: ["batchId", "recordUid", "fieldKey", "value"],
  }));
  const templatePartitions = await loadProductionWorkspaceAnalysisSource(request({
    sourceKey: "production.qc.template-snapshot-partitions",
    fields: ["batchId", "section", "segment", "leafStart", "leafEnd", "leafCount"],
    parameters: { batchId: 20, section: "document" },
  }));
  const documentValues = await loadProductionWorkspaceAnalysisSource(request({
    sourceKey: "production.qc.template-snapshot-values",
    fields: ["batchId", "templateId", "templateVersion", "section", "path", "valueKind", "textValue", "numberValue", "booleanValue"],
    parameters: { batchId: 20, section: "document", segment: 1 },
    maxRows: 3,
    maxPages: 3,
  }));
  const fieldModelValues = await loadProductionWorkspaceAnalysisSource(request({
    sourceKey: "production.qc.template-snapshot-values",
    fields: ["batchId", "templateId", "templateVersion", "section", "path", "valueKind", "textValue", "numberValue", "booleanValue"],
    parameters: { batchId: 20, section: "fieldModel", segment: 1 },
    maxRows: 3,
    maxPages: 3,
  }));

  assert.deepEqual(sku.rows, [{
    id: 10,
    productMasterId: 1,
    productCode: "P01",
    productName: "产品甲",
    code: "SKU01",
    name: "产品甲 10ml",
    version: 2,
  }]);
  assert.deepEqual(mappings.rows, [
    { id: 4, productId: 1, productCode: "P01", sourceSystem: "erp", sourceName: "产品甲旧名", status: "linked" },
    { id: 3, productId: null, productCode: null, sourceSystem: "erp", sourceName: "旧产品名", status: "pending" },
  ]);
  assert.deepEqual(signature.rows, [{
    batchId: 20,
    recordUid: "qc-20",
    id: 21,
    signerUserId: 9,
    signerName: "E009 李四",
    signedAt: "2026-07-02T09:00:00.000Z",
    signedPayloadHash: "abc123",
  }]);
  assert.deepEqual(fieldValue.rows, [{ batchId: 20, recordUid: "qc-20", fieldKey: "assay_result", value: "98.5%" }]);
  assert.deepEqual(templatePartitions.rows, [{
    batchId: 20,
    section: "document",
    segment: 1,
    leafStart: 1,
    leafEnd: 3,
    leafCount: 3,
  }]);
  assert.deepEqual([...documentValues.rows, ...fieldModelValues.rows], [
    { batchId: 20, templateId: 31, templateVersion: 4, section: "document", path: "$.stages[0].key", valueKind: "text", textValue: "finished", numberValue: null, booleanValue: null },
    { batchId: 20, templateId: 31, templateVersion: 4, section: "document", path: "$.stages[0].label", valueKind: "text", textValue: "成品", numberValue: null, booleanValue: null },
    { batchId: 20, templateId: 31, templateVersion: 4, section: "document", path: "$.title", valueKind: "text", textValue: "成品检验记录", numberValue: null, booleanValue: null },
    { batchId: 20, templateId: 31, templateVersion: 4, section: "fieldModel", path: "$.assay_result.min", valueKind: "number", textValue: "98", numberValue: 98, booleanValue: null },
    { batchId: 20, templateId: 31, templateVersion: 4, section: "fieldModel", path: "$.assay_result.required", valueKind: "boolean", textValue: "true", numberValue: null, booleanValue: true },
    { batchId: 20, templateId: 31, templateVersion: 4, section: "fieldModel", path: "$.assay_result.unit", valueKind: "text", textValue: "%", numberValue: null, booleanValue: null },
  ]);
  assert.deepEqual(productCalls, [{ keyword: "产品" }]);
  assert.deepEqual(productSourceMappingCalls, [{ page: 1, pageSize: 1 }, { page: 2, pageSize: 1 }]);
  assert.equal(qcListCalls, 2);
  assert.equal(qcDetailCalls, 3);
});

test("complete product source mapping pages include more than the catalog 100/200 relation caps", async () => {
  reset();
  const linked = Array.from({ length: 121 }, (_, index) => productSourceMappingAnalysisFixture(index + 1, "linked"));
  const pending = Array.from({ length: 221 }, (_, index) => productSourceMappingAnalysisFixture(index + 122, "pending"));
  productSourceMappingRows = [...linked, ...pending];

  const result = await loadProductionWorkspaceAnalysisSource(request({
    sourceKey: "production.product-source-mappings",
    fields: ["id", "productId", "productCode", "sourceName", "status"],
    maxRows: 342,
    pageSize: 100,
    maxPages: 4,
    maxBytes: 1_000_000,
  }));

  assert.equal(result.rows.length, 342);
  assert.equal(result.rows.filter((row) => row.status === "linked").length, 121);
  assert.equal(result.rows.filter((row) => row.status === "pending").length, 221);
  assert.equal(result.rows[0]?.id, 1);
  assert.equal(result.rows.at(-1)?.id, 342);
  assert.deepEqual(productSourceMappingCalls, [
    { page: 1, pageSize: 100 },
    { page: 2, pageSize: 100 },
    { page: 3, pageSize: 100 },
    { page: 4, pageSize: 100 },
  ]);
  assert.deepEqual(productCalls, []);
  assert.deepEqual(permissionChecks, [{
    requesterId: 7,
    resourceKey: "production.products",
    action: "read",
    options: { projection: "default" },
  }]);
});

test("complete product source mappings fail closed when the true total exceeds 4000", async () => {
  reset();
  productSourceMappingTotal = 4_001;
  await assert.rejects(
    () => loadProductionWorkspaceAnalysisSource(request({
      sourceKey: "production.product-source-mappings",
      fields: ["id"],
      maxRows: 4_000,
      pageSize: 200,
      maxPages: 20,
      maxBytes: 1_000_000,
    })),
    (error) => error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_limit_exceeded",
  );
  assert.deepEqual(productSourceMappingCalls, [{ page: 1, pageSize: 200 }]);
  assert.deepEqual(productCalls, []);
});

test("QC template snapshot partitions fail closed for an unknown segment", async () => {
  reset();
  await assert.rejects(
    () => loadProductionWorkspaceAnalysisSource(request({
      sourceKey: "production.qc.template-snapshot-values",
      fields: ["path"],
      parameters: { batchId: 20, section: "document", segment: 2 },
    })),
    (error) => error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_response_invalid",
  );
  assert.equal(qcListCalls, 0);
  assert.equal(qcDetailCalls, 1);
});

test("Production owner denies execution before loading when original read permission is absent", async () => {
  reset();
  readAllowed = false;
  await assert.rejects(
    () => loadProductionWorkspaceAnalysisSource(request({ sourceKey: "production.qc.batches", fields: ["id"] })),
    (error) => error instanceof WorkspaceAnalysisRuntimeError && error.code === "source_forbidden",
  );
  assert.equal(qcListCalls, 0);
  assert.equal(qcDetailCalls, 0);
});

function request(input: {
  sourceKey: string;
  fields: string[];
  parameters?: Record<string, string | number | boolean>;
  maxRows?: number;
  pageSize?: number;
  maxPages?: number;
  maxBytes?: number;
}): WorkspaceAnalysisSourceLoadRequest {
  return {
    requesterId: 7,
    targetType: "project",
    targetId: 30,
    ownerUnitId: "production",
    sourceKey: input.sourceKey,
    sourceVersion: 1,
    parameters: input.parameters ?? {},
    fields: input.fields,
    limits: {
      maxRows: input.maxRows ?? 1,
      maxGroups: 20,
      pageSize: input.pageSize ?? 1,
      maxPages: input.maxPages ?? 1,
      maxBytes: input.maxBytes ?? 20_000,
      timeoutMs: 1_000,
    },
    signal: new AbortController().signal,
  };
}

function reset() {
  readAllowed = true;
  permissionChecks.length = 0;
  productCalls.length = 0;
  productSourceMappingCalls.length = 0;
  productSourceMappingRows = structuredClone(defaultProductSourceMappingRows);
  productSourceMappingTotal = null;
  qcListCalls = 0;
  qcDetailCalls = 0;
}
