import "server-only";

import { workspaceSourcesOperationalAnalysisDefinitionSchema } from "../workspace-analysis-definition-schema";
import type {
  WorkspaceAnalysisSourceDefinition,
  WorkspaceAnalysisSourceFieldDefinition,
  WorkspaceAnalysisSourceParameterDefinition,
  WorkspaceAnalysisSourceScopeType,
  WorkspaceSourcesMetric,
  WorkspaceSourcesOperationalAnalysisDefinition,
} from "../workspace-analysis-source-contract";

export type WorkspaceAnalysisDefinitionIssueCode =
  | "invalid_shape"
  | "source_not_found"
  | "source_scope_unsupported"
  | "parameter_unknown"
  | "parameter_required"
  | "parameter_type_invalid"
  | "parameter_relation_invalid"
  | "source_alias_not_found"
  | "source_unused"
  | "field_not_found"
  | "filter_not_allowed"
  | "field_not_groupable"
  | "aggregate_not_allowed"
  | "field_not_displayable"
  | "format_not_allowed"
  | "limit_exceeded";

export type WorkspaceAnalysisDefinitionIssue = {
  readonly code: WorkspaceAnalysisDefinitionIssueCode;
  readonly path: readonly PropertyKey[];
  readonly message: string;
  readonly sourceKey?: string;
  readonly fieldKey?: string;
};

export type WorkspaceAnalysisSourceLookup = {
  get(sourceKey: string, version: number): WorkspaceAnalysisSourceDefinition | null;
};

export type WorkspaceAnalysisDefinitionCompileResult =
  | {
      readonly ok: true;
      readonly definition: WorkspaceSourcesOperationalAnalysisDefinition;
      readonly resolvedSources: ReadonlyMap<string, WorkspaceAnalysisSourceDefinition>;
    }
  | {
      readonly ok: false;
      readonly issues: readonly WorkspaceAnalysisDefinitionIssue[];
    };

type ResolvedSource = {
  readonly definition: WorkspaceAnalysisSourceDefinition;
};

const FILTER_OPERATORS = {
  search: "contains",
  select: "equals",
  year: "year",
  month: "month",
} as const;
const NUMERIC_FIELD_KINDS = new Set(["number", "integer", "currency", "percent"]);
const COUNT_OPERATIONS = new Set(["count", "distinctCount"]);

/**
 * Performs shape and source-capability validation only. It is not an
 * authorization boundary. Executable plans must be built from the scoped
 * lookup emitted by WorkspaceAnalysisSourceDirectory for the current
 * requester and target.
 */
export function compileWorkspaceAnalysisDefinition(input: {
  readonly definition: unknown;
  readonly scopeType: WorkspaceAnalysisSourceScopeType;
  readonly sourceCatalog: WorkspaceAnalysisSourceLookup;
}): WorkspaceAnalysisDefinitionCompileResult {
  const parsed = workspaceSourcesOperationalAnalysisDefinitionSchema.safeParse(input.definition);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: "invalid_shape",
        path: issue.path,
        message: issue.message,
      })),
    };
  }

  const definition = parsed.data;
  const issues: WorkspaceAnalysisDefinitionIssue[] = [];
  const resolvedSources = new Map<string, WorkspaceAnalysisSourceDefinition>();
  const sourceState = new Map<string, ResolvedSource>();
  const usedSources = new Set<string>();

  definition.sources.forEach((source, index) => {
    const path = ["sources", index] as const;
    let sourceDefinition: WorkspaceAnalysisSourceDefinition | null = null;
    try {
      sourceDefinition = input.sourceCatalog.get(source.sourceKey, source.sourceVersion);
    } catch {
      sourceDefinition = null;
    }
    if (!sourceDefinition) {
      addIssue(issues, "source_not_found", [...path, "sourceKey"], `数据源 ${source.sourceKey}@${source.sourceVersion} 不存在或暂不可用`, source.sourceKey);
      return;
    }
    if (!sourceDefinition.scopeBindings[input.scopeType]) {
      addIssue(issues, "source_scope_unsupported", [...path, "sourceKey"], `${sourceDefinition.label} 不支持当前空间类型`, source.sourceKey);
    }
    issues.push(...validateWorkspaceAnalysisSourceParameterValues({
      values: source.parameters ?? {},
      sourceDefinition,
      path,
    }));
    resolvedSources.set(source.key, sourceDefinition);
    sourceState.set(source.key, { definition: sourceDefinition });
  });

  definition.filters.forEach((filter, index) => {
    const path = ["filters", index] as const;
    const source = sourceState.get(filter.source);
    usedSources.add(filter.source);
    if (!source) return;
    const field = resolveField(source.definition, filter.field, [...path, "field"], issues);
    if (!field) return;
    const requiredOperator = FILTER_OPERATORS[filter.kind];
    if (!field.capabilities.filterOperators.includes(requiredOperator)) {
      addIssue(issues, "filter_not_allowed", [...path, "kind"], `${field.label} 不支持该筛选方式`, source.definition.sourceKey, field.key);
    }
    if (filter.kind === "search" && field.kind !== "text") {
      addIssue(issues, "filter_not_allowed", [...path, "kind"], "搜索筛选只能用于文本字段", source.definition.sourceKey, field.key);
    }
    if ((filter.kind === "year" || filter.kind === "month") && field.kind !== "date") {
      addIssue(issues, "filter_not_allowed", [...path, "kind"], `${filter.kind === "year" ? "年份" : "月份"}筛选只能用于日期字段`, source.definition.sourceKey, field.key);
    }
    validateFilterDefaults(filter, path, issues);
  });

  definition.blocks.forEach((block, blockIndex) => {
    if (block.kind === "note") return;
    const path = ["blocks", blockIndex] as const;
    usedSources.add(block.source);
    const source = sourceState.get(block.source);
    if (!source) return;
    const sourceDefinition = source.definition;

    if (block.kind === "metrics") {
      block.metrics.forEach((metric, metricIndex) => validateMetric(
        metric,
        sourceDefinition,
        [...path, "metrics", metricIndex],
        issues,
      ));
      return;
    }

    if (block.kind === "chart") {
      const dimension = resolveField(sourceDefinition, block.dimension.field, [...path, "dimension", "field"], issues);
      if (dimension && !dimension.capabilities.groupable) {
        addIssue(issues, "field_not_groupable", [...path, "dimension", "field"], `${dimension.label} 不能作为分组维度`, sourceDefinition.sourceKey, dimension.key);
      }
      if (dimension && block.dimension.bucket && dimension.kind !== "date") {
        addIssue(issues, "field_not_groupable", [...path, "dimension", "bucket"], "时间分桶只能用于日期字段", sourceDefinition.sourceKey, dimension.key);
      }
      if (block.limit && block.limit > sourceDefinition.limits.maxGroups) {
        addIssue(issues, "limit_exceeded", [...path, "limit"], `图表分组数不能超过 ${sourceDefinition.limits.maxGroups}`, sourceDefinition.sourceKey);
      }
      block.metrics.forEach((metric, metricIndex) => validateMetric(
        metric,
        sourceDefinition,
        [...path, "metrics", metricIndex],
        issues,
      ));
      return;
    }

    if (block.limit && block.limit > sourceDefinition.limits.maxRows) {
      addIssue(issues, "limit_exceeded", [...path, "limit"], `表格行数不能超过 ${sourceDefinition.limits.maxRows}`, sourceDefinition.sourceKey);
    }
    block.columns.forEach((column, columnIndex) => {
      const columnPath = [...path, "columns", columnIndex] as const;
      const field = resolveField(sourceDefinition, column.field, [...columnPath, "field"], issues);
      if (!field) return;
      if (!field.capabilities.displayable) {
        addIssue(issues, "field_not_displayable", [...columnPath, "field"], `${field.label} 不能展示`, sourceDefinition.sourceKey, field.key);
      }
      if (column.format && !isCompatibleFormat(column.format, field.kind)) {
        addIssue(issues, "format_not_allowed", [...columnPath, "format"], `${field.label} 不能使用 ${column.format} 格式`, sourceDefinition.sourceKey, field.key);
      }
    });
  });

  definition.sources.forEach((source, index) => {
    if (!usedSources.has(source.key)) {
      addIssue(issues, "source_unused", ["sources", index, "key"], `数据源别名 ${source.key} 未被任何筛选器或区块使用`, source.sourceKey);
    }
  });

  return issues.length
    ? { ok: false, issues }
    : { ok: true, definition, resolvedSources };
}

function validateParameterConstraints(
  values: Readonly<Record<string, string | number | boolean>>,
  sourceDefinition: WorkspaceAnalysisSourceDefinition,
  sourcePath: readonly PropertyKey[],
  issues: WorkspaceAnalysisDefinitionIssue[],
) {
  for (const constraint of sourceDefinition.parameterConstraints ?? []) {
    const from = values[constraint.from];
    const to = values[constraint.to];
    if (typeof from !== "string" || typeof to !== "string" || !isIsoDate(from) || !isIsoDate(to)) continue;
    if (from > to) {
      addIssue(
        issues,
        "parameter_relation_invalid",
        [...sourcePath, "parameters", constraint.to],
        constraint.description,
        sourceDefinition.sourceKey,
      );
    }
  }
}

function validateParameters(
  values: Readonly<Record<string, string | number | boolean>>,
  definitions: readonly WorkspaceAnalysisSourceParameterDefinition[],
  sourcePath: readonly PropertyKey[],
  sourceKey: string,
  issues: WorkspaceAnalysisDefinitionIssue[],
) {
  const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  for (const key of Object.keys(values)) {
    const definition = definitionsByKey.get(key);
    if (!definition) {
      addIssue(issues, "parameter_unknown", [...sourcePath, "parameters", key], `数据源未登记参数 ${key}`, sourceKey);
      continue;
    }
    if (!isParameterValue(definition.kind, values[key])) {
      addIssue(issues, "parameter_type_invalid", [...sourcePath, "parameters", key], `${definition.label} 参数类型或格式无效`, sourceKey);
    }
    for (const relatedKey of definition.requiredWith ?? []) {
      if (!Object.hasOwn(values, relatedKey)) {
        addIssue(issues, "parameter_required", [...sourcePath, "parameters", relatedKey], `${definition.label} 必须与 ${definitionsByKey.get(relatedKey)?.label ?? relatedKey} 同时填写`, sourceKey);
      }
    }
  }
  for (const definition of definitions) {
    if (definition.required && !Object.hasOwn(values, definition.key)) {
      addIssue(issues, "parameter_required", [...sourcePath, "parameters", definition.key], `缺少必填参数 ${definition.label}`, sourceKey);
    }
  }
}

export function validateWorkspaceAnalysisSourceParameterValues(input: {
  readonly values: Readonly<Record<string, string | number | boolean>>;
  readonly sourceDefinition: WorkspaceAnalysisSourceDefinition;
  readonly path?: readonly PropertyKey[];
}) {
  const issues: WorkspaceAnalysisDefinitionIssue[] = [];
  const path = input.path ?? [];
  validateParameters(input.values, input.sourceDefinition.parameters, path, input.sourceDefinition.sourceKey, issues);
  validateParameterConstraints(input.values, input.sourceDefinition, path, issues);
  return issues;
}

function validateFilterDefaults(
  filter: WorkspaceSourcesOperationalAnalysisDefinition["filters"][number],
  path: readonly ["filters", number],
  issues: WorkspaceAnalysisDefinitionIssue[],
) {
  if (filter.kind === "select") {
    const optionValues = filter.options?.map((option) => option.value) ?? [];
    if (new Set(optionValues).size !== optionValues.length) {
      addIssue(issues, "invalid_shape", [...path, "options"], "select 筛选器的 option value 不能重复");
    }
    if (filter.defaultValue !== undefined && !optionValues.includes(filter.defaultValue)) {
      addIssue(issues, "invalid_shape", [...path, "defaultValue"], "select 默认值必须来自 options");
    }
  }
  if (filter.kind === "year" && filter.defaultValue !== undefined && !/^\d{4}$/.test(filter.defaultValue)) {
    addIssue(issues, "invalid_shape", [...path, "defaultValue"], "年份默认值必须是四位年份");
  }
  if (filter.kind === "month" && filter.defaultValue !== undefined && !/^(?:[1-9]|1[0-2])$/.test(filter.defaultValue)) {
    addIssue(issues, "invalid_shape", [...path, "defaultValue"], "月份默认值必须是 1-12");
  }
}

function validateMetric(
  metric: WorkspaceSourcesMetric,
  sourceDefinition: WorkspaceAnalysisSourceDefinition,
  path: readonly PropertyKey[],
  issues: WorkspaceAnalysisDefinitionIssue[],
) {
  if (!metric.field) {
    if (metric.operation !== "count") {
      addIssue(issues, "aggregate_not_allowed", [...path, "field"], `${metric.operation} 指标必须指定字段`, sourceDefinition.sourceKey);
    }
    if (metric.format && !["number", "integer"].includes(metric.format)) {
      addIssue(issues, "format_not_allowed", [...path, "format"], "行数统计只能使用数字或整数格式", sourceDefinition.sourceKey);
    }
    return;
  }
  const field = resolveField(sourceDefinition, metric.field, [...path, "field"], issues);
  if (!field) return;
  if (!field.capabilities.aggregateOperations.includes(metric.operation)) {
    addIssue(issues, "aggregate_not_allowed", [...path, "operation"], `${field.label} 不支持 ${metric.operation} 聚合`, sourceDefinition.sourceKey, field.key);
  }
  if (metric.format) {
    const compatible = COUNT_OPERATIONS.has(metric.operation)
      ? ["number", "integer"].includes(metric.format)
      : NUMERIC_FIELD_KINDS.has(field.kind) && isCompatibleFormat(metric.format, field.kind);
    if (!compatible) {
      addIssue(issues, "format_not_allowed", [...path, "format"], `${metric.label} 的展示格式与字段口径不一致`, sourceDefinition.sourceKey, field.key);
    }
  }
}

function resolveField(
  sourceDefinition: WorkspaceAnalysisSourceDefinition,
  fieldKey: string,
  path: readonly PropertyKey[],
  issues: WorkspaceAnalysisDefinitionIssue[],
) {
  const field = sourceDefinition.fields.find((candidate) => candidate.key === fieldKey);
  if (!field) {
    addIssue(issues, "field_not_found", path, `数据源中不存在字段 ${fieldKey}`, sourceDefinition.sourceKey, fieldKey);
    return null;
  }
  return field;
}

function isParameterValue(kind: WorkspaceAnalysisSourceParameterDefinition["kind"], value: unknown) {
  if (kind === "boolean") return typeof value === "boolean";
  if (kind === "integer") return typeof value === "number" && Number.isInteger(value);
  if (kind === "number") return typeof value === "number" && Number.isFinite(value);
  if (kind === "text") return typeof value === "string" && Boolean(value.trim());
  return typeof value === "string" && isIsoDate(value);
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isCompatibleFormat(format: string, fieldKind: WorkspaceAnalysisSourceFieldDefinition["kind"]) {
  if (fieldKind === "text" || fieldKind === "boolean") return format === "text";
  if (fieldKind === "date") return format === "date";
  if (fieldKind === "integer") return format === "integer" || format === "number";
  if (fieldKind === "currency") return format === "currency" || format === "number";
  if (fieldKind === "percent") return format === "percent" || format === "number";
  return format === "number";
}

function addIssue(
  issues: WorkspaceAnalysisDefinitionIssue[],
  code: WorkspaceAnalysisDefinitionIssueCode,
  path: readonly PropertyKey[],
  message: string,
  sourceKey?: string,
  fieldKey?: string,
) {
  issues.push({ code, path, message, sourceKey, fieldKey });
}
