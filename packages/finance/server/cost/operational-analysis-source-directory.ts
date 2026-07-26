import "server-only";

import { serviceError, serviceOk } from "@workspace/platform/server/api";
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

export function buildFinanceOperationalAnalysisSourceDirectory(input: {
  readonly remoteProviders?: readonly WorkspaceAnalysisSourceProvider[];
} = {}) {
  const financeCatalog = buildFinanceWorkspaceAnalysisSourceCatalog();
  const financeProvider = createLocalWorkspaceAnalysisSourceProvider({
    ownerUnitId: "finance",
    sourceCatalog: financeCatalog,
    canDiscover: canDiscoverFinanceWorkspaceAnalysisSource,
    loadSource: loadFinanceWorkspaceAnalysisSource,
  });
  const remoteProviders = input.remoteProviders ?? REMOTE_ANALYSIS_OWNER_UNIT_IDS.map((ownerUnitId) => (
    createRemoteWorkspaceAnalysisSourceProvider({
      ownerUnitId,
      callerUnitId: "finance",
      ...(ownerUnitId === "capital-securities" ? { apiModulePathSegment: "capitalSecurities" } : {}),
      timeoutMs: 2_000,
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
