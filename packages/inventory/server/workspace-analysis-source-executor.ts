import "server-only";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";
import { runRegisteredWorkspaceAnalysisSource } from "@workspace/platform/server/workspace-analysis-source-executor";
import {
  WorkspaceAnalysisRuntimeError,
  type WorkspaceAnalysisSourceLoadRequest,
} from "@workspace/platform/server/workspace-analysis-runtime";

import { listInventoryReceipt } from "./receipts/service";
import { inventoryScopeSchema } from "./schemas";
import { listInventoryWorkspace } from "./service";
import { canDiscoverInventoryWorkspaceAnalysisSource } from "./workspace-analysis-source-access";
import { INVENTORY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-sources";

export function buildInventoryWorkspaceAnalysisSourceCatalog() {
  const catalog = createWorkspaceAnalysisSourceCatalog(INVENTORY_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);
  catalog.validateReferences();
  return catalog;
}

export function loadInventoryWorkspaceAnalysisSource(request: WorkspaceAnalysisSourceLoadRequest) {
  const catalog = buildInventoryWorkspaceAnalysisSourceCatalog();
  let workspaceSnapshot: ReturnType<typeof listInventoryWorkspace> | null = null;
  let receiptSnapshot: ReturnType<typeof listInventoryReceipt> | null = null;
  return runRegisteredWorkspaceAnalysisSource({
    ownerUnitId: "inventory",
    sourceCatalog: catalog,
    request,
    canExecute: canDiscoverInventoryWorkspaceAnalysisSource,
    loadPage: async ({ registration, parameters, page, pageSize, signal }) => {
      assertNotAborted(signal, request.sourceKey);
      const sourceKey = registration.definition.sourceKey;
      let rows: readonly unknown[];
      if (sourceKey.startsWith("inventory.operations.")) {
        workspaceSnapshot ??= listInventoryWorkspace(operationScope(parameters, sourceKey));
        const snapshot = await workspaceSnapshot;
        rows = operationRows(sourceKey, snapshot);
      } else {
        receiptSnapshot ??= listInventoryReceipt(sourceKey === "inventory.receipts"
          ? receiptFilters(parameters, sourceKey)
          : {});
        const snapshot = await receiptSnapshot;
        rows = receiptRows(sourceKey, snapshot);
      }
      assertNotAborted(signal, request.sourceKey);
      return slicePage(rows, page, pageSize);
    },
  });
}

function operationRows(
  sourceKey: string,
  snapshot: Awaited<ReturnType<typeof listInventoryWorkspace>>,
): readonly unknown[] {
  if (sourceKey === "inventory.operations.items") return snapshot.items;
  if (sourceKey === "inventory.operations.warehouses") return snapshot.warehouses;
  if (sourceKey === "inventory.operations.documents") return snapshot.documents;
  if (sourceKey === "inventory.operations.document-lines") {
    return snapshot.documents.flatMap((document) => document.lines.map((line) => ({
      documentId: document.id,
      documentNo: document.documentNo,
      documentType: document.documentType,
      documentDate: document.documentDate,
      documentStatus: document.status,
      ...line,
    })));
  }
  if (sourceKey === "inventory.operations.batches") return snapshot.batches;
  if (sourceKey === "inventory.operations.stocktakes") return snapshot.stocktakes;
  if (sourceKey === "inventory.operations.imports") return snapshot.imports;
  throw unavailable(sourceKey);
}

function receiptRows(
  sourceKey: string,
  snapshot: Awaited<ReturnType<typeof listInventoryReceipt>>,
): readonly unknown[] {
  if (sourceKey === "inventory.receipts") return snapshot.rows;
  if (sourceKey === "inventory.receipt-reports") return snapshot.reports;
  if (sourceKey === "inventory.receipt-products") return snapshot.productCatalog;
  if (sourceKey === "inventory.receipts.product-packaging-notes") {
    return snapshot.productCatalog.flatMap(({ packagingNotes, ...product }) => packagingNotes.map((packagingNote) => ({
      ...product,
      packagingNote,
    })));
  }
  throw unavailable(sourceKey);
}

function slicePage(rows: readonly unknown[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), totalRows: rows.length };
}

function operationScope(
  parameters: Readonly<Record<string, string | number | boolean>>,
  sourceKey: string,
) {
  const parsed = inventoryScopeSchema.safeParse({
    companyCode: parameters.companyCode,
    year: parameters.year,
    month: parameters.month,
  });
  if (parsed.success) return parsed.data;
  throw new WorkspaceAnalysisRuntimeError("source_response_invalid", "库存公司或期间参数无效", sourceKey);
}

function receiptFilters(
  parameters: Readonly<Record<string, string | number | boolean>>,
  sourceKey: string,
) {
  const year = optionalBoundedInteger(parameters.year, 2020, 2100, "入库年份", sourceKey);
  const month = optionalBoundedInteger(parameters.month, 1, 12, "入库月份", sourceKey);
  const q = optionalTrimmedText(parameters.q, sourceKey);
  return {
    ...(year === undefined ? {} : { year }),
    ...(month === undefined ? {} : { month }),
    ...(q === undefined ? {} : { q }),
  };
}

function optionalBoundedInteger(
  value: string | number | boolean | undefined,
  min: number,
  max: number,
  label: string,
  sourceKey: string,
) {
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max) return value;
  throw new WorkspaceAnalysisRuntimeError("source_response_invalid", `${label}参数无效`, sourceKey);
}

function optionalTrimmedText(value: string | number | boolean | undefined, sourceKey: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new WorkspaceAnalysisRuntimeError("source_response_invalid", "入库关键词参数无效", sourceKey);
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function assertNotAborted(signal: AbortSignal, sourceKey: string) {
  if (signal.aborted) throw new WorkspaceAnalysisRuntimeError("cancelled", "经营分析运行已取消", sourceKey);
}

function unavailable(sourceKey: string) {
  return new WorkspaceAnalysisRuntimeError("source_unavailable", "Inventory 经营分析数据源不存在", sourceKey);
}
