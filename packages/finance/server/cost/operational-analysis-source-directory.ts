import "server-only";

import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { matchText } from "@workspace/platform/search";
import type { WorkspaceAnalysisSourceDefinition } from "@workspace/platform/workspace-analysis-source-contract";
import {
  createLocalWorkspaceAnalysisSourceProvider,
  createWorkspaceAnalysisSourceDirectory,
  WorkspaceAnalysisSourceDirectoryConflictError,
  type WorkspaceAnalysisSourceProvider,
} from "@workspace/platform/server/workspace-analysis-source-directory";
import { createRemoteWorkspaceAnalysisSourceProvider } from "@workspace/platform/server/workspace-analysis-source-rpc";
import {
  canReadOperationalAnalytics,
  canUseOperationalAnalyticsApi,
  type OperationalAnalyticsScopeType,
} from "./operational-analytics";
import {
  buildFinanceWorkspaceAnalysisSourceCatalog,
  canDiscoverFinanceWorkspaceAnalysisSource,
  loadFinanceWorkspaceAnalysisSource,
} from "./workspace-analysis-source-executor";

type AnalysisScope = {
  readonly scopeType: OperationalAnalyticsScopeType;
  readonly scopeId: number;
};

const REMOTE_ANALYSIS_OWNER_UNIT_IDS = [
  "administration",
  "capital-securities",
  "external",
  "hr",
  "inventory",
  "library",
  "production",
  "work",
] as const;

export type FinanceOperationalAnalysisRemoteOwnerUnitId = typeof REMOTE_ANALYSIS_OWNER_UNIT_IDS[number];

const DISCOVERY_PROVIDER_TIMEOUT_MS = 2_000;

export const OPERATIONAL_ANALYSIS_RUNTIME_PROVIDER_TIMEOUT_MS = 10_000;

export function isFinanceOperationalAnalysisRemoteOwnerUnitId(
  value: string,
): value is FinanceOperationalAnalysisRemoteOwnerUnitId {
  return (REMOTE_ANALYSIS_OWNER_UNIT_IDS as readonly string[]).includes(value);
}

export function buildFinanceOperationalAnalysisSourceDirectory(input: {
  readonly remoteProviders?: readonly WorkspaceAnalysisSourceProvider[];
  /**
   * Runtime compilation only needs the owners referenced by the template. A
   * full catalog discovery deliberately omits this filter so one unavailable
   * optional owner can still be reported without hiding the others.
   */
  readonly remoteOwnerUnitIds?: readonly FinanceOperationalAnalysisRemoteOwnerUnitId[];
  readonly remoteProviderTimeoutMs?: number;
} = {}) {
  const financeCatalog = buildFinanceWorkspaceAnalysisSourceCatalog();
  const financeProvider = createLocalWorkspaceAnalysisSourceProvider({
    ownerUnitId: "finance",
    sourceCatalog: financeCatalog,
    canDiscover: canDiscoverFinanceWorkspaceAnalysisSource,
    loadSource: loadFinanceWorkspaceAnalysisSource,
  });
  const requestedOwnerUnitIds = input.remoteOwnerUnitIds ?? REMOTE_ANALYSIS_OWNER_UNIT_IDS;
  const remoteProviders = input.remoteProviders ?? requestedOwnerUnitIds.map((ownerUnitId) => (
    createRemoteWorkspaceAnalysisSourceProvider({
      ownerUnitId,
      callerUnitId: "finance",
      ...(ownerUnitId === "capital-securities" ? { apiModulePathSegment: "capitalSecurities" } : {}),
      timeoutMs: input.remoteProviderTimeoutMs ?? DISCOVERY_PROVIDER_TIMEOUT_MS,
    })
  ));
  return createWorkspaceAnalysisSourceDirectory([financeProvider, ...remoteProviders]);
}

export async function listOperationalAnalysisSources(
  userId: number,
  scope: AnalysisScope,
  options: { readonly viaApiKey?: boolean } = {},
  directory = buildFinanceOperationalAnalysisSourceDirectory(),
) {
  if (!await canReadOperationalAnalytics(userId, scope.scopeType, scope.scopeId)) {
    return serviceError("无权限查看该空间的经营分析数据源", 403);
  }
  if (options.viaApiKey && !await canUseOperationalAnalyticsApi(userId, scope.scopeType, scope.scopeId)) {
    return serviceError("当前 API 凭证没有该空间的经营分析 API 使用权限", 403);
  }
  try {
    const result = await directory.list({
      requesterId: userId,
      targetType: scope.scopeType,
      targetId: scope.scopeId,
    });
    return serviceOk({
      success: true,
      data: {
        scope,
        sources: result.sources,
        providers: result.providers,
      },
    });
  } catch (error) {
    if (error instanceof WorkspaceAnalysisSourceDirectoryConflictError) {
      return serviceError("经营分析数据源目录配置冲突", 500);
    }
    return serviceError("经营分析数据源目录暂不可用", 503);
  }
}

export async function discoverOperationalAnalysisSources(
  userId: number,
  scope: AnalysisScope,
  query: {
    readonly keyword: string;
    readonly page: number;
    readonly pageSize: number;
    readonly selected: readonly { sourceKey: string; sourceVersion: number }[];
  },
  options: { readonly viaApiKey?: boolean } = {},
  directory = buildFinanceOperationalAnalysisSourceDirectory(),
) {
  const listed = await listOperationalAnalysisSources(userId, scope, options, directory);
  if (!listed.ok) return listed;
  const catalog = listed.data.data;
  const matched = catalog.sources
    .filter((source) => matchText(sourceSearchText(source), query.keyword))
    .sort((left, right) => sourceIdentity(left).localeCompare(sourceIdentity(right)));
  const start = (query.page - 1) * query.pageSize;
  const pageItems = matched.slice(start, start + query.pageSize);
  const byIdentity = new Map(catalog.sources.map((source) => [sourceIdentity(source), source]));
  const selected = query.selected.map((reference) => (
    byIdentity.get(`${reference.sourceKey}@${reference.sourceVersion}`)
  ));
  const missing = query.selected.find((_, index) => !selected[index]);
  if (missing) {
    return serviceError(`${missing.sourceKey}@${missing.sourceVersion} 不在当前空间可用数据源中`, 404);
  }
  return serviceOk({
    success: true,
    data: {
      scope,
      query: { keyword: query.keyword, page: query.page, pageSize: query.pageSize },
      total: matched.length,
      hasMore: start + pageItems.length < matched.length,
      sources: pageItems.map(sourceSummary),
      selected: selected.filter((source): source is WorkspaceAnalysisSourceDefinition => Boolean(source)),
      providers: catalog.providers,
      links: {
        templateContract: `/api/modules/finance/cost/operational-analytics/spaces/${scope.scopeType}/${scope.scopeId}/templates/contract`,
      },
      rule: "模板只能引用 selected 中已展开的精确 sourceKey、sourceVersion、参数和字段。",
    },
  });
}

function sourceIdentity(source: Pick<WorkspaceAnalysisSourceDefinition, "sourceKey" | "version">) {
  return `${source.sourceKey}@${source.version}`;
}

function sourceSearchText(source: WorkspaceAnalysisSourceDefinition) {
  return [source.sourceKey, source.label, source.description, source.ownerModuleKey]
    .join(" ")
    .toLocaleLowerCase();
}

function sourceSummary(source: WorkspaceAnalysisSourceDefinition) {
  return {
    sourceKey: source.sourceKey,
    sourceVersion: source.version,
    label: source.label,
    description: source.description,
    ownerModuleKey: source.ownerModuleKey,
    supportedScopes: Object.keys(source.scopeBindings),
    resourceKey: source.authorization.resourceKey,
    requiredActions: source.authorization.requiredActions,
    fieldCount: source.fields.length,
    parameterCount: source.parameters.length,
    limits: source.limits,
  };
}
