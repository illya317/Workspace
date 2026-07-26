import "server-only";

import type {
  WorkspaceAnalysisParameterValue,
  WorkspaceAnalysisSourceDefinition,
  WorkspaceAnalysisSourceScopeType,
  WorkspaceSourcesOperationalAnalysisDefinition,
} from "../workspace-analysis-source-contract";
import {
  compileWorkspaceAnalysisDefinition,
  type WorkspaceAnalysisDefinitionIssue,
} from "./workspace-analysis-definition-compiler";
import {
  isWorkspaceAnalysisAuthorizedSourceLookup,
  type WorkspaceAnalysisAuthorizedSourceLookup,
} from "./workspace-analysis-source-directory";

export const WORKSPACE_ANALYSIS_RUN_LIMITS = Object.freeze({
  maxSources: 4,
  maxRows: 10_000,
  maxBytes: 10 * 1024 * 1024,
  timeoutMs: 12_000,
  maxPages: 40,
  maxTableRows: 500,
  maxChartGroups: 60,
});

export type WorkspaceAnalysisExecutionScope = {
  readonly targetType: WorkspaceAnalysisSourceScopeType;
  readonly targetId: number;
};

export type WorkspaceAnalysisExecutionSourcePlan = {
  readonly alias: string;
  readonly ownerUnitId: string;
  readonly sourceKey: string;
  readonly sourceVersion: number;
  readonly parameters: Readonly<Record<string, WorkspaceAnalysisParameterValue>>;
  readonly fields: readonly string[];
  readonly definition: WorkspaceAnalysisSourceDefinition;
  readonly limits: {
    readonly maxRows: number;
    readonly maxBytes: number;
    readonly timeoutMs: number;
    readonly maxPages: number;
    readonly pageSize: number;
    readonly maxGroups: number;
  };
};

export type WorkspaceAnalysisExecutionPlan = {
  readonly requesterId: number;
  readonly scope: WorkspaceAnalysisExecutionScope;
  readonly definition: WorkspaceSourcesOperationalAnalysisDefinition;
  readonly filterValues: Readonly<Record<string, string>>;
  readonly sources: readonly WorkspaceAnalysisExecutionSourcePlan[];
  readonly limits: typeof WORKSPACE_ANALYSIS_RUN_LIMITS;
  readonly authorizedSources: WorkspaceAnalysisAuthorizedSourceLookup;
};

export type WorkspaceAnalysisExecutionPlanIssue = WorkspaceAnalysisDefinitionIssue | {
  readonly code: "invalid_context" | "filter_unknown" | "filter_value_invalid" | "limit_exceeded" | "source_executor_unavailable";
  readonly path: readonly PropertyKey[];
  readonly message: string;
};

export type WorkspaceAnalysisExecutionPlanResult =
  | { readonly ok: true; readonly plan: WorkspaceAnalysisExecutionPlan }
  | { readonly ok: false; readonly issues: readonly WorkspaceAnalysisExecutionPlanIssue[] };

export function buildWorkspaceAnalysisExecutionPlan(input: {
  readonly authorizedSources: WorkspaceAnalysisAuthorizedSourceLookup;
  readonly definition: unknown;
  readonly filterValues?: Readonly<Record<string, string>>;
}): WorkspaceAnalysisExecutionPlanResult {
  if (!isWorkspaceAnalysisAuthorizedSourceLookup(input.authorizedSources)) {
    return {
      ok: false,
      issues: [{ code: "invalid_context", path: ["authorizedSources"], message: "经营分析数据源尚未按当前用户和空间授权" }],
    };
  }
  const { requesterId, targetType, targetId } = input.authorizedSources.context;
  const scope = { targetType, targetId };
  const contextIssues = validateContext(requesterId, scope);
  if (contextIssues.length) return { ok: false, issues: contextIssues };

  const compiled = compileWorkspaceAnalysisDefinition({
    definition: input.definition,
    scopeType: targetType,
    sourceCatalog: input.authorizedSources,
  });
  if (!compiled.ok) return compiled;

  const issues: WorkspaceAnalysisExecutionPlanIssue[] = [];
  const filterValues = normalizeFilterValues(compiled.definition, input.filterValues ?? {}, issues);
  validateRenderLimits(compiled.definition, issues);
  compiled.definition.sources.forEach((source, index) => {
    if (!input.authorizedSources.canLoad(source.sourceKey, source.sourceVersion)) {
      issues.push({
        code: "source_executor_unavailable",
        path: ["sources", index, "sourceKey"],
        message: `数据源 ${source.sourceKey}@${source.sourceVersion} 暂无服务端执行器`,
      });
    }
  });
  if (issues.length) return { ok: false, issues };

  const requiredFields = collectRequiredFields(compiled.definition);
  const sources = compiled.definition.sources.map((source): WorkspaceAnalysisExecutionSourcePlan => {
    const definition = compiled.resolvedSources.get(source.key)!;
    const ownerUnitId = input.authorizedSources.providerOwnerUnitId(source.sourceKey, source.sourceVersion);
    if (!ownerUnitId) throw new Error(`Authorized workspace analysis source lost provider binding: ${source.sourceKey}@${source.sourceVersion}`);
    return {
      alias: source.key,
      ownerUnitId,
      sourceKey: source.sourceKey,
      sourceVersion: source.sourceVersion,
      parameters: { ...(source.parameters ?? {}) },
      fields: [...(requiredFields.get(source.key) ?? [])].sort(),
      definition,
      limits: {
        maxRows: Math.min(definition.limits.maxRows, WORKSPACE_ANALYSIS_RUN_LIMITS.maxRows),
        maxBytes: Math.min(definition.limits.maxBytes, WORKSPACE_ANALYSIS_RUN_LIMITS.maxBytes),
        timeoutMs: Math.min(definition.limits.timeoutMs, WORKSPACE_ANALYSIS_RUN_LIMITS.timeoutMs),
        maxPages: Math.min(definition.limits.maxPages, WORKSPACE_ANALYSIS_RUN_LIMITS.maxPages),
        pageSize: Math.min(definition.limits.maxPageSize, definition.limits.maxRows),
        maxGroups: Math.min(definition.limits.maxGroups, WORKSPACE_ANALYSIS_RUN_LIMITS.maxChartGroups),
      },
    };
  });

  return {
    ok: true,
    plan: {
      requesterId,
      scope,
      definition: compiled.definition,
      filterValues,
      sources,
      limits: WORKSPACE_ANALYSIS_RUN_LIMITS,
      authorizedSources: input.authorizedSources,
    },
  };
}

function validateContext(
  requesterId: number,
  scope: WorkspaceAnalysisExecutionScope,
): WorkspaceAnalysisExecutionPlanIssue[] {
  const issues: WorkspaceAnalysisExecutionPlanIssue[] = [];
  if (!Number.isInteger(requesterId) || requesterId <= 0) {
    issues.push({ code: "invalid_context", path: ["requesterId"], message: "经营分析请求用户无效" });
  }
  if (!Number.isInteger(scope.targetId) || scope.targetId <= 0) {
    issues.push({ code: "invalid_context", path: ["scope", "targetId"], message: "经营分析目标空间无效" });
  }
  if (!["personal", "department", "project"].includes(scope.targetType)) {
    issues.push({ code: "invalid_context", path: ["scope", "targetType"], message: "经营分析空间类型无效" });
  }
  return issues;
}

function normalizeFilterValues(
  definition: WorkspaceSourcesOperationalAnalysisDefinition,
  suppliedValues: Readonly<Record<string, string>>,
  issues: WorkspaceAnalysisExecutionPlanIssue[],
) {
  const filtersByKey = new Map(definition.filters.map((filter) => [filter.key, filter]));
  for (const key of Object.keys(suppliedValues)) {
    if (!filtersByKey.has(key)) {
      issues.push({ code: "filter_unknown", path: ["filterValues", key], message: `模板未声明筛选器 ${key}` });
    }
  }

  const normalized: Record<string, string> = {};
  definition.filters.forEach((filter) => {
    const raw = suppliedValues[filter.key] ?? filter.defaultValue ?? "";
    const value = raw === "__all" ? "" : raw.trim();
    if (value.length > 120) {
      issues.push({ code: "filter_value_invalid", path: ["filterValues", filter.key], message: `${filter.label}筛选值过长` });
    } else if (filter.kind === "select" && value && !filter.options?.some((option) => option.value === value)) {
      issues.push({ code: "filter_value_invalid", path: ["filterValues", filter.key], message: `${filter.label}筛选值不在可选项中` });
    } else if (filter.kind === "year" && value && !/^\d{4}$/.test(value)) {
      issues.push({ code: "filter_value_invalid", path: ["filterValues", filter.key], message: `${filter.label}必须是四位年份` });
    } else if (filter.kind === "month" && value && !/^(?:[1-9]|1[0-2])$/.test(value)) {
      issues.push({ code: "filter_value_invalid", path: ["filterValues", filter.key], message: `${filter.label}必须是 1-12` });
    }
    normalized[filter.key] = value;
  });
  return normalized;
}

function validateRenderLimits(
  definition: WorkspaceSourcesOperationalAnalysisDefinition,
  issues: WorkspaceAnalysisExecutionPlanIssue[],
) {
  definition.blocks.forEach((block, index) => {
    if (block.kind === "table" && (block.limit ?? 100) > WORKSPACE_ANALYSIS_RUN_LIMITS.maxTableRows) {
      issues.push({
        code: "limit_exceeded",
        path: ["blocks", index, "limit"],
        message: `单个表格最多展示 ${WORKSPACE_ANALYSIS_RUN_LIMITS.maxTableRows} 行`,
      });
    }
    if (block.kind === "chart" && (block.limit ?? 36) > WORKSPACE_ANALYSIS_RUN_LIMITS.maxChartGroups) {
      issues.push({
        code: "limit_exceeded",
        path: ["blocks", index, "limit"],
        message: `单个图表最多展示 ${WORKSPACE_ANALYSIS_RUN_LIMITS.maxChartGroups} 个分组`,
      });
    }
  });
}

function collectRequiredFields(definition: WorkspaceSourcesOperationalAnalysisDefinition) {
  const fields = new Map<string, Set<string>>();
  const add = (alias: string, field: string | undefined) => {
    if (!field) return;
    const sourceFields = fields.get(alias) ?? new Set<string>();
    sourceFields.add(field);
    fields.set(alias, sourceFields);
  };
  definition.filters.forEach((filter) => add(filter.source, filter.field));
  definition.blocks.forEach((block) => {
    if (block.kind === "note") return;
    if (block.kind === "metrics") block.metrics.forEach((metric) => add(block.source, metric.field));
    if (block.kind === "chart") {
      add(block.source, block.dimension.field);
      block.metrics.forEach((metric) => add(block.source, metric.field));
    }
    if (block.kind === "table") block.columns.forEach((column) => add(block.source, column.field));
  });
  return fields;
}
