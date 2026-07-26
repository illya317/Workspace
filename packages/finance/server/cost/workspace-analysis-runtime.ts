import "server-only";

import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { buildWorkspaceAnalysisExecutionPlan } from "@workspace/platform/server/workspace-analysis-execution-plan";
import type { WorkspaceAnalysisSourceDirectoryResult } from "@workspace/platform/server/workspace-analysis-source-directory";
import {
  runWorkspaceAnalysisExecutionPlan,
  WorkspaceAnalysisRuntimeError,
  type WorkspaceAnalysisRuntimeAudit,
} from "@workspace/platform/server/workspace-analysis-runtime";

import {
  canReadOperationalAnalytics,
  canUseOperationalAnalyticsApi,
  type OperationalAnalyticsScopeType,
} from "./operational-analytics";
import { buildFinanceOperationalAnalysisSourceDirectory } from "./operational-analysis-source-directory";

type AnalysisScope = {
  readonly scopeType: OperationalAnalyticsScopeType;
  readonly scopeId: number;
};

type SourceDirectory = {
  list(context: {
    readonly requesterId: number;
    readonly targetType: OperationalAnalyticsScopeType;
    readonly targetId: number;
  }): Promise<WorkspaceAnalysisSourceDirectoryResult>;
};

export async function runFinanceWorkspaceAnalysisRuntime(input: {
  readonly userId: number;
  readonly scope: AnalysisScope;
  readonly definition: unknown;
  readonly filterValues?: Readonly<Record<string, string>>;
  readonly viaApiKey?: boolean;
  readonly signal?: AbortSignal;
  readonly onAudit?: (audit: WorkspaceAnalysisRuntimeAudit) => Promise<void> | void;
  readonly directory?: SourceDirectory;
}) {
  const prepared = await compileAuthorizedFinanceWorkspaceAnalysisDefinition(input);
  if (!prepared.ok) return prepared;

  try {
    const runtime = await runWorkspaceAnalysisExecutionPlan({
      plan: prepared.data,
      signal: input.signal,
      onAudit: input.onAudit,
    });
    return serviceOk({ success: true, data: runtime });
  } catch (cause) {
    if (!(cause instanceof WorkspaceAnalysisRuntimeError)) {
      return serviceError("经营分析运行失败", 503);
    }
    const status = cause.code === "source_forbidden"
      ? 403
      : cause.code === "source_limit_exceeded" || cause.code === "run_limit_exceeded"
        ? 413
        : cause.code === "timeout"
          ? 504
          : cause.code === "source_response_invalid"
            ? 502
            : 503;
    return serviceError(cause.message, status);
  }
}

/**
 * Resolves the current requester's authorized source directory and compiles an
 * executable plan without loading business rows. Template saves and runtime
 * execution deliberately share this seam so source/version, field capability,
 * scope, limits, and executor availability cannot drift between the two paths.
 */
export async function compileAuthorizedFinanceWorkspaceAnalysisDefinition(input: {
  readonly userId: number;
  readonly scope: AnalysisScope;
  readonly definition: unknown;
  readonly filterValues?: Readonly<Record<string, string>>;
  readonly viaApiKey?: boolean;
  readonly directory?: SourceDirectory;
}) {
  if (!await canReadOperationalAnalytics(input.userId, input.scope.scopeType, input.scope.scopeId)) {
    return serviceError("无权限查看该空间的经营分析", 403);
  }
  if (input.viaApiKey && !await canUseOperationalAnalyticsApi(input.userId, input.scope.scopeType, input.scope.scopeId)) {
    return serviceError("当前 API 凭证没有该空间的经营分析 API 使用权限", 403);
  }

  let directory: WorkspaceAnalysisSourceDirectoryResult;
  try {
    directory = await (input.directory ?? buildFinanceOperationalAnalysisSourceDirectory()).list({
      requesterId: input.userId,
      targetType: input.scope.scopeType,
      targetId: input.scope.scopeId,
    });
  } catch {
    return serviceError("经营分析数据源目录暂不可用", 503);
  }
  const compiled = buildWorkspaceAnalysisExecutionPlan({
    authorizedSources: directory.authorizedSources,
    definition: input.definition,
    filterValues: input.filterValues,
  });
  if (!compiled.ok) {
    return executionPlanError(directory, compiled.issues);
  }
  return serviceOk(compiled.plan);
}

function executionPlanError(
  directory: WorkspaceAnalysisSourceDirectoryResult,
  issues: readonly { readonly code: string; readonly message: string; readonly sourceKey?: string }[],
) {
  const firstIssue = issues[0];
  const requestIssue = issues.find((issue) => ["invalid_context", "filter_unknown", "filter_value_invalid"].includes(issue.code));
  if (requestIssue) {
    return serviceError(requestIssue.message, 400);
  }
  const unavailableOwners = new Set(directory.providers
    .filter((provider) => provider.status === "unavailable")
    .map((provider) => provider.ownerUnitId));
  const referencedProviderUnavailable = issues.some((issue) => (
    issue.code === "source_not_found"
    && issue.sourceKey !== undefined
    && unavailableOwners.has(issue.sourceKey.split(".")[0] ?? "")
  ));
  if (referencedProviderUnavailable || issues.some((issue) => issue.code === "source_executor_unavailable")) {
    return serviceError("经营分析数据源服务暂不可用", 503);
  }
  return serviceError(firstIssue?.message ?? "经营分析模板不可执行", 409);
}
