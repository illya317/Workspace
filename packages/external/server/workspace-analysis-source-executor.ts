import "server-only";

import { runRegisteredWorkspaceAnalysisSource } from "@workspace/platform/server/workspace-analysis-source-executor";
import { WorkspaceAnalysisRuntimeError, type WorkspaceAnalysisSourceLoadRequest } from "@workspace/platform/server/workspace-analysis-runtime";

import { listExternalParties } from "./external-party-service";
import { listExternalRelatedParties } from "./related-parties";
import {
  buildExternalWorkspaceAnalysisSourceCatalog,
  canDiscoverExternalWorkspaceAnalysisSource,
} from "./workspace-analysis-source-access";
import { iterateExternalPartyRoleAnalysisRows } from "./workspace-analysis-sources";

const PARENT_PAGE_SIZE = 500;
const PARENT_MAX_PAGES = 10;
const PARENT_MAX_ROWS = PARENT_PAGE_SIZE * PARENT_MAX_PAGES;

export function loadExternalWorkspaceAnalysisSource(request: WorkspaceAnalysisSourceLoadRequest) {
  let roleRows: Promise<readonly unknown[]> | null = null;
  return runRegisteredWorkspaceAnalysisSource({
    ownerUnitId: "external",
    sourceCatalog: buildExternalWorkspaceAnalysisSourceCatalog(),
    request,
    canExecute: canDiscoverExternalWorkspaceAnalysisSource,
    loadPage: async ({ registration, requesterId, parameters, page, pageSize, signal }) => {
      if (signal.aborted) throw new WorkspaceAnalysisRuntimeError("cancelled", "经营分析运行已取消", request.sourceKey);
      const sourceKey = registration.definition.sourceKey;
      if (sourceKey === "external.related-parties") {
        const result = await listExternalRelatedParties({
          keyword: typeof parameters.keyword === "string" ? parameters.keyword : undefined,
          relatedPartyType: relatedPartyTypeParameter(parameters.relatedPartyType),
          asOfDate: typeof parameters.asOfDate === "string" ? parameters.asOfDate : undefined,
          page,
          pageSize,
        });
        return { rows: result.items, totalRows: result.total };
      }
      const category = sourceKey === "external.customers" || sourceKey === "external.customer-roles"
        ? "customer"
        : sourceKey === "external.suppliers" || sourceKey === "external.supplier-roles"
          ? "supplier"
          : null;
      if (!category) throw new WorkspaceAnalysisRuntimeError("source_unavailable", "外部关系经营分析数据源暂不可用", sourceKey);
      if (sourceKey.endsWith("-roles")) {
        roleRows ??= loadVisiblePartyRoleRows({
          category,
          userId: requesterId,
          keyword: typeof parameters.keyword === "string" ? parameters.keyword : undefined,
          signal,
          sourceKey,
        });
        const rows = await roleRows;
        const start = (page - 1) * pageSize;
        return { rows: rows.slice(start, start + pageSize), totalRows: rows.length };
      }
      const result = await listExternalParties({
        category,
        userId: requesterId,
        keyword: typeof parameters.keyword === "string" ? parameters.keyword : undefined,
        page,
        pageSize,
      });
      return { rows: result.items, totalRows: result.total };
    },
  });
}

function relatedPartyTypeParameter(value: string | number | boolean | undefined) {
  return value === "group"
    || value === "joint_venture_associate"
    || value === "investor_influence"
    || value === "key_management_related"
    || value === "other_related"
    ? value
    : undefined;
}

async function loadVisiblePartyRoleRows(input: {
  readonly category: "customer" | "supplier";
  readonly userId: number;
  readonly keyword: string | undefined;
  readonly signal: AbortSignal;
  readonly sourceKey: string;
}) {
  const parties: Awaited<ReturnType<typeof listExternalParties>>["items"] = [];
  const seenIds = new Set<number>();
  let total: number | null = null;
  for (let page = 1; total === null || parties.length < total; page += 1) {
    if (input.signal.aborted) {
      throw new WorkspaceAnalysisRuntimeError("cancelled", "经营分析运行已取消", input.sourceKey);
    }
    if (page > PARENT_MAX_PAGES) {
      throw new WorkspaceAnalysisRuntimeError("source_limit_exceeded", "往来主体超过角色来源父集上限", input.sourceKey);
    }
    const result = await listExternalParties({
      category: input.category,
      userId: input.userId,
      keyword: input.keyword,
      page,
      pageSize: PARENT_PAGE_SIZE,
    });
    if (!Number.isInteger(result.total) || result.total < 0 || result.total > PARENT_MAX_ROWS) {
      throw new WorkspaceAnalysisRuntimeError("source_limit_exceeded", "往来主体角色来源父集总数无效或超限", input.sourceKey);
    }
    if (total === null) total = result.total;
    else if (result.total !== total) {
      throw new WorkspaceAnalysisRuntimeError("source_response_invalid", "往来主体角色来源父集分页总数发生变化", input.sourceKey);
    }
    if (result.items.length > PARENT_PAGE_SIZE || parties.length + result.items.length > total) {
      throw new WorkspaceAnalysisRuntimeError("source_response_invalid", "往来主体角色来源父集分页无效", input.sourceKey);
    }
    for (const party of result.items) {
      if (seenIds.has(party.id)) {
        throw new WorkspaceAnalysisRuntimeError("source_response_invalid", "往来主体角色来源父集存在重复记录", input.sourceKey);
      }
      seenIds.add(party.id);
      parties.push(party);
    }
    if (parties.length < total && result.items.length < PARENT_PAGE_SIZE) {
      throw new WorkspaceAnalysisRuntimeError("source_response_invalid", "往来主体角色来源父集未返回完整分页", input.sourceKey);
    }
  }
  return [...iterateExternalPartyRoleAnalysisRows(parties)];
}
