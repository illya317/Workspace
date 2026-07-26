import "server-only";

import type { WorkspaceAnalysisSourceDefinition } from "@workspace/platform/workspace-analysis-source-contract";
import { canEnterResource, evaluatePermissionAction } from "@workspace/platform/server/auth";
import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";
import { runRegisteredWorkspaceAnalysisSource } from "@workspace/platform/server/workspace-analysis-source-executor";
import {
  WorkspaceAnalysisRuntimeError,
  type WorkspaceAnalysisSourceLoadRequest,
} from "@workspace/platform/server/workspace-analysis-runtime";

import { listCostAnalysis } from "./cost-analysis";
import { listCostStructure } from "./cost-structure";
import {
  canReadOperationalAnalytics,
  executeOperationalAnalyticsShipmentList,
} from "./operational-analytics";
import { listSalesSalaries } from "./sales-salary";
import { listShipments } from "./shipments";
import { listWorkshopReports } from "./workshop-reports";
import { FINANCE_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-sources";
import { FINANCE_GENERAL_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "../workspace-analysis-source-registrations";
import {
  isFinanceGeneralWorkspaceAnalysisSource,
  loadFinanceGeneralWorkspaceAnalysisSourcePage,
} from "../workspace-analysis-source-pages";

export function buildFinanceWorkspaceAnalysisSourceCatalog() {
  const catalog = createWorkspaceAnalysisSourceCatalog([
    ...FINANCE_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS,
    ...FINANCE_GENERAL_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS,
  ]);
  catalog.validateReferences();
  return catalog;
}

export async function canDiscoverFinanceWorkspaceAnalysisSource(input: {
  readonly requesterId: number;
  readonly targetType: WorkspaceAnalysisSourceLoadRequest["targetType"];
  readonly targetId: number;
  readonly source: WorkspaceAnalysisSourceDefinition;
}) {
  if (input.source.ownerModuleKey !== "finance") return false;
  if (input.source.sourceKey === "finance.shipments") {
    return canReadOperationalAnalytics(input.requesterId, input.targetType, input.targetId);
  }
  return canReadFinanceBusinessSource(input.requesterId, input.source);
}

export function loadFinanceWorkspaceAnalysisSource(request: WorkspaceAnalysisSourceLoadRequest) {
  const catalog = buildFinanceWorkspaceAnalysisSourceCatalog();
  return runRegisteredWorkspaceAnalysisSource({
    ownerUnitId: "finance",
    sourceCatalog: catalog,
    request,
    canExecute: canDiscoverFinanceWorkspaceAnalysisSource,
    loadPage: async ({ registration, requesterId, targetType, targetId, parameters, page, pageSize, signal }) => {
      assertNotAborted(signal, request.sourceKey);
      const result = await loadFinanceSourcePage({
        sourceKey: registration.definition.sourceKey,
        requesterId,
        targetType,
        targetId,
        parameters,
        page,
        pageSize,
      });
      assertNotAborted(signal, request.sourceKey);
      return result;
    },
  });
}

async function canReadFinanceBusinessSource(
  requesterId: number,
  source: WorkspaceAnalysisSourceDefinition,
) {
  for (const action of source.authorization.requiredActions) {
    const allowed = action === "entry"
      ? await canEnterResource(requesterId, source.authorization.resourceKey)
      : await evaluatePermissionAction(requesterId, source.authorization.resourceKey, action, {
          projection: source.authorization.projection,
        });
    if (!allowed) return false;
  }
  return true;
}

async function loadFinanceSourcePage(input: {
  sourceKey: string;
  requesterId: number;
  targetType: WorkspaceAnalysisSourceLoadRequest["targetType"];
  targetId: number;
  parameters: Readonly<Record<string, string | number | boolean>>;
  page: number;
  pageSize: number;
}) {
  const { sourceKey, parameters, page, pageSize } = input;
  if (isFinanceGeneralWorkspaceAnalysisSource(sourceKey)) {
    return loadFinanceGeneralWorkspaceAnalysisSourcePage({ sourceKey, parameters, page, pageSize });
  }
  if (sourceKey === "finance.shipments") {
    const result = await executeOperationalAnalyticsShipmentList(input.requesterId, {
      scopeType: input.targetType,
      scopeId: input.targetId,
      ...shipmentParameters(parameters),
      page,
      pageSize,
    });
    if (!result.ok) {
      throw new WorkspaceAnalysisRuntimeError(
        result.status === 403 ? "source_forbidden" : "source_unavailable",
        result.error,
        sourceKey,
      );
    }
    return { rows: result.data.data, totalRows: result.data.pagination.total };
  }

  if (sourceKey === "finance.cost.shipments") {
    return asSourcePage(await listShipments({ ...shipmentParameters(parameters), page, pageSize }));
  }

  const period = {
    importId: integerParameter(parameters.importId),
    year: integerParameter(parameters.year),
    month: integerParameter(parameters.month),
    sourceFile: textParameter(parameters.sourceFile),
    page,
    pageSize,
  };
  if (sourceKey === "finance.cost.analysis") {
    return asSourcePage(await listCostAnalysis(period));
  }
  if (sourceKey === "finance.cost.structure") {
    return asSourcePage(await listCostStructure({
      ...period,
      productName: textParameter(parameters.productName),
    }));
  }
  if (sourceKey === "finance.cost.sales-salary") {
    return asSourcePage(await listSalesSalaries(period));
  }
  if (sourceKey === "finance.cost.workshop-reports") {
    return asSourcePage(await listWorkshopReports({
      ...period,
      productName: textParameter(parameters.productName),
    }));
  }
  throw new WorkspaceAnalysisRuntimeError("source_unavailable", "Finance 经营分析数据源不存在", sourceKey);
}

function shipmentParameters(parameters: Readonly<Record<string, string | number | boolean>>) {
  return {
    importId: integerParameter(parameters.importId),
    dateFrom: textParameter(parameters.dateFrom),
    dateTo: textParameter(parameters.dateTo),
    productName: textParameter(parameters.productName),
    customerName: textParameter(parameters.customerName),
  };
}

function asSourcePage<T>(result: { data: T[]; pagination: { total: number } }) {
  return { rows: result.data, totalRows: result.pagination.total };
}

function textParameter(value: string | number | boolean | undefined) {
  return typeof value === "string" ? value : undefined;
}

function integerParameter(value: string | number | boolean | undefined) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function assertNotAborted(signal: AbortSignal, sourceKey: string) {
  if (signal.aborted) {
    throw new WorkspaceAnalysisRuntimeError("cancelled", "经营分析运行已取消", sourceKey);
  }
}
