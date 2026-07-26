import "server-only";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";
import { runRegisteredWorkspaceAnalysisSource } from "@workspace/platform/server/workspace-analysis-source-executor";
import {
  WorkspaceAnalysisRuntimeError,
  type WorkspaceAnalysisSourceLoadRequest,
} from "@workspace/platform/server/workspace-analysis-runtime";

import { listProducts } from "./products/service";
import { ProductQuerySchema } from "./products/schemas";
import { getQcBatch, listQcBatches } from "./qc/batches";
import { listProductSourceMappingsPage } from "./workspace-analysis-product-source-mappings";
import { canDiscoverProductionWorkspaceAnalysisSource } from "./workspace-analysis-source-access";
import {
  listQcTemplateSnapshotPartitions,
  readQcTemplateSnapshotSegment,
  type QcTemplateSnapshotContext,
  type QcTemplateSnapshotSection,
} from "./workspace-analysis-qc-template-snapshot";
import { PRODUCTION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-sources";

export function buildProductionWorkspaceAnalysisSourceCatalog() {
  const catalog = createWorkspaceAnalysisSourceCatalog(PRODUCTION_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);
  catalog.validateReferences();
  return catalog;
}

export function loadProductionWorkspaceAnalysisSource(request: WorkspaceAnalysisSourceLoadRequest) {
  const catalog = buildProductionWorkspaceAnalysisSourceCatalog();
  let productSnapshot: ReturnType<typeof listProducts> | null = null;
  let qcSnapshot: ReturnType<typeof listQcBatches> | null = null;
  let templateSnapshotRows: Promise<readonly unknown[]> | null = null;
  return runRegisteredWorkspaceAnalysisSource({
    ownerUnitId: "production",
    sourceCatalog: catalog,
    request,
    canExecute: canDiscoverProductionWorkspaceAnalysisSource,
    loadPage: async ({ registration, parameters, page, pageSize, signal }) => {
      assertNotAborted(signal, request.sourceKey);
      const sourceKey = registration.definition.sourceKey;
      if (sourceKey === "production.product-source-mappings") {
        const result = await listProductSourceMappingsPage({ page, pageSize });
        assertNotAborted(signal, request.sourceKey);
        return { rows: result.rows, totalRows: result.total };
      }
      let rows: readonly unknown[];
      if (sourceKey === "production.qc.template-snapshot-partitions" || sourceKey === "production.qc.template-snapshot-values") {
        templateSnapshotRows ??= loadQcTemplateSnapshotRows(sourceKey, parameters);
        rows = await templateSnapshotRows;
      } else if (sourceKey.startsWith("production.product")) {
        productSnapshot ??= listProducts(sourceKey === "production.products" || sourceKey === "production.product-skus"
          ? productQuery(parameters, sourceKey)
          : {});
        const snapshot = await productSnapshot;
        rows = productRows(sourceKey, snapshot);
      } else if (sourceKey.startsWith("production.qc.")) {
        qcSnapshot ??= listQcBatches();
        rows = qcRows(sourceKey, await qcSnapshot);
      } else {
        throw new WorkspaceAnalysisRuntimeError("source_unavailable", "Production 经营分析数据源不存在", sourceKey);
      }
      assertNotAborted(signal, request.sourceKey);
      const start = (page - 1) * pageSize;
      return { rows: rows.slice(start, start + pageSize), totalRows: rows.length };
    },
  });
}

function productRows(
  sourceKey: string,
  snapshot: Awaited<ReturnType<typeof listProducts>>,
): readonly unknown[] {
  if (sourceKey === "production.products") return snapshot.items;
  if (sourceKey === "production.product-source-mappings.pending") return snapshot.pendingMappings;
  if (sourceKey === "production.product-skus") {
    return snapshot.items.flatMap((product) => product.skus.map((sku) => ({
      productCode: product.code,
      productName: product.name,
      ...sku,
    })));
  }
  throw new WorkspaceAnalysisRuntimeError("source_unavailable", "Production 产品分析数据源不存在", sourceKey);
}

function qcRows(
  sourceKey: string,
  snapshot: Awaited<ReturnType<typeof listQcBatches>>,
): readonly unknown[] {
  if (sourceKey === "production.qc.batches") return snapshot.batches;
  if (sourceKey === "production.qc.signatures") {
    return snapshot.batches.flatMap((batch) => batch.signatures.map((signature) => ({
      batchId: batch.id,
      recordUid: batch.recordUid,
      batchNumber: batch.batchNumber,
      productId: batch.productId,
      productKey: batch.productKey,
      productName: batch.productName,
      ...signature,
    })));
  }
  if (sourceKey === "production.qc.field-values") {
    return snapshot.batches.flatMap((batch) => Object.entries(batch.fields).map(([fieldKey, value]) => ({
      batchId: batch.id,
      recordUid: batch.recordUid,
      batchNumber: batch.batchNumber,
      productId: batch.productId,
      productKey: batch.productKey,
      productName: batch.productName,
      fieldKey,
      value,
    })));
  }
  throw new WorkspaceAnalysisRuntimeError("source_unavailable", "Production QC 分析数据源不存在", sourceKey);
}

async function loadQcTemplateSnapshotRows(
  sourceKey: string,
  parameters: Readonly<Record<string, string | number | boolean>>,
) {
  const batchId = requiredPositiveInteger(parameters.batchId, "batchId", sourceKey);
  const section = requiredTemplateSection(parameters.section, sourceKey);
  const batch = await getQcBatch(batchId);
  if (!batch) throw new WorkspaceAnalysisRuntimeError("source_unavailable", "QC 批次不存在", sourceKey);
  const snapshot = batch.templateSnapshot;
  if (!snapshot) throw new WorkspaceAnalysisRuntimeError("source_response_invalid", "QC 批次缺少模板快照", sourceKey);
  const context: QcTemplateSnapshotContext = {
    batchId: batch.id,
    recordUid: batch.recordUid,
    batchNumber: batch.batchNumber,
    productId: batch.productId,
    productKey: batch.productKey,
    productName: batch.productName,
    templateId: snapshot.templateId,
    templateVersion: snapshot.templateVersion,
  };
  if (sourceKey === "production.qc.template-snapshot-partitions") {
    return listQcTemplateSnapshotPartitions({ context, snapshot, section });
  }
  return readQcTemplateSnapshotSegment({
    context,
    snapshot,
    section,
    segment: requiredPositiveInteger(parameters.segment, "segment", sourceKey),
  });
}

function productQuery(
  parameters: Readonly<Record<string, string | number | boolean>>,
  sourceKey: string,
) {
  const parsed = ProductQuerySchema.safeParse(parameters.keyword === undefined
    ? {}
    : { keyword: parameters.keyword });
  if (parsed.success) return parsed.data;
  throw new WorkspaceAnalysisRuntimeError("source_response_invalid", "产品关键词参数无效", sourceKey);
}

function requiredPositiveInteger(
  value: string | number | boolean | undefined,
  key: string,
  sourceKey: string,
) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  throw new WorkspaceAnalysisRuntimeError("source_response_invalid", `${key} 必须是正整数`, sourceKey);
}

function requiredTemplateSection(
  value: string | number | boolean | undefined,
  sourceKey: string,
): QcTemplateSnapshotSection {
  if (value === "document" || value === "fieldModel") return value;
  throw new WorkspaceAnalysisRuntimeError("source_response_invalid", "section 必须是 document 或 fieldModel", sourceKey);
}

function assertNotAborted(signal: AbortSignal, sourceKey: string) {
  if (signal.aborted) throw new WorkspaceAnalysisRuntimeError("cancelled", "经营分析运行已取消", sourceKey);
}
