import "server-only";

import type {
  WorkspaceAnalysisParameterValue,
  WorkspaceAnalysisSourceDefinition,
  WorkspaceAnalysisSourceScopeType,
  WorkspaceApiOperationalAnalysisDefinition,
  WorkspaceApiSource,
  WorkspaceSourcesBlock,
  WorkspaceSourcesMetric,
  WorkspaceSourcesOperationalAnalysisDefinition,
} from "../workspace-analysis-source-contract";
import {
  compileWorkspaceAnalysisDefinition,
  validateWorkspaceAnalysisSourceParameterValues,
} from "./workspace-analysis-definition-compiler";
import { validateWorkspaceAnalysisSourceDefinition } from "./workspace-analysis-source-registry";

const MEMBER_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*$/;
const FORBIDDEN_MEMBER_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export type WorkspaceApiV2MigrationDiagnosticCode =
  | "source_unavailable"
  | "source_mapping_missing"
  | "source_mapping_ambiguous"
  | "scope_semantics_mismatch"
  | "query_semantics_mismatch"
  | "path_parameter_invalid"
  | "parameter_value_invalid"
  | "field_mapping_missing"
  | "field_mapping_ambiguous"
  | "identifier_collision"
  | "v3_compile_failed";

export type WorkspaceApiV2MigrationDiagnostic = {
  readonly code: WorkspaceApiV2MigrationDiagnosticCode;
  readonly path: readonly PropertyKey[];
  readonly message: string;
  readonly sourceAlias?: string;
  readonly sourceKey?: string;
  readonly fieldPath?: string;
};

export type WorkspaceApiV2MigrationNotice = {
  readonly code: "execution_policy_changed";
  readonly path: readonly PropertyKey[];
  readonly message: string;
  readonly sourceAlias: string;
  readonly sourceKey: string;
};

export type WorkspaceApiV2ResolvedSource = {
  /** Exact authorized version; callers must never substitute `latest`. */
  readonly sourceDefinition: WorkspaceAnalysisSourceDefinition;
  readonly parameters: Readonly<Record<string, WorkspaceAnalysisParameterValue>>;
  /** Legacy dotted row field path -> canonical registered field key. */
  readonly fieldMappings: Readonly<Record<string, string>>;
};

export type WorkspaceApiV2SourceResolution =
  | { readonly status: "resolved"; readonly value: WorkspaceApiV2ResolvedSource }
  | { readonly status: "needsMigration"; readonly diagnostics: readonly WorkspaceApiV2MigrationDiagnostic[] };

/**
 * This resolver must already be constrained to the current requester and
 * target space. The upgrader only translates a proven mapping; it performs no
 * discovery and cannot turn the full source registry into an authorization
 * boundary.
 */
export type WorkspaceApiV2AuthorizedSourceResolver = {
  resolve(input: {
    readonly source: WorkspaceApiSource;
    readonly scopeType: WorkspaceAnalysisSourceScopeType;
    readonly referencedFields: readonly string[];
    readonly path: readonly ["sources", number];
  }): WorkspaceApiV2SourceResolution;
};

export type WorkspaceApiV2UpgradeResult =
  | {
      readonly status: "upgraded";
      readonly definition: WorkspaceSourcesOperationalAnalysisDefinition;
      readonly notices: readonly WorkspaceApiV2MigrationNotice[];
    }
  | {
      readonly status: "needsMigration";
      readonly diagnostics: readonly WorkspaceApiV2MigrationDiagnostic[];
    };

type FieldReference = {
  readonly fieldPath: string;
  readonly path: readonly PropertyKey[];
};

/**
 * Converts one already-parsed v2 definition or returns complete diagnostics.
 * It never persists a draft and never returns a partially upgraded definition.
 */
export function upgradeWorkspaceApiV2Definition(input: {
  readonly definition: WorkspaceApiOperationalAnalysisDefinition;
  readonly scopeType: WorkspaceAnalysisSourceScopeType;
  readonly resolver: WorkspaceApiV2AuthorizedSourceResolver;
}): WorkspaceApiV2UpgradeResult {
  const diagnostics: WorkspaceApiV2MigrationDiagnostic[] = [];
  const sourceAliases = normalizeSourceAliases(input.definition, diagnostics);
  normalizeDefinitionMemberKeys(input.definition, diagnostics);
  const fieldReferences = collectFieldReferences(input.definition, diagnostics);
  if (diagnostics.length) return { status: "needsMigration", diagnostics };

  const resolutions = new Map<string, WorkspaceApiV2ResolvedSource>();
  const resolvedDefinitions = new Map<string, WorkspaceAnalysisSourceDefinition>();
  const notices: WorkspaceApiV2MigrationNotice[] = [];
  input.definition.sources.forEach((source, sourceIndex) => {
    const path = ["sources", sourceIndex] as const;
    const references = fieldReferences.get(source.key) ?? [];
    let resolution: WorkspaceApiV2SourceResolution;
    try {
      resolution = input.resolver.resolve({
        source,
        scopeType: input.scopeType,
        referencedFields: [...new Set(references.map((reference) => reference.fieldPath))]
          .sort(compareText),
        path,
      });
    } catch {
      diagnostics.push({
        code: "source_unavailable",
        path,
        message: `数据源 ${source.key} 的授权迁移解析暂不可用`,
        sourceAlias: source.key,
      });
      return;
    }
    if (resolution.status === "needsMigration") {
      diagnostics.push(...(resolution.diagnostics.length ? resolution.diagnostics : [{
        code: "source_unavailable" as const,
        path,
        message: `数据源 ${source.key} 未返回可执行的迁移结论`,
        sourceAlias: source.key,
      }]));
      return;
    }

    const value = resolution.value;
    try {
      validateWorkspaceAnalysisSourceDefinition(value.sourceDefinition);
      validateResolvedSource(source, path, references, value, input.scopeType, diagnostics);
    } catch {
      diagnostics.push({
        code: "source_unavailable",
        path,
        message: `数据源 ${source.key} 返回了无效的 canonical 登记定义`,
        sourceAlias: source.key,
      });
      return;
    }
    resolutions.set(source.key, value);
    const identity = sourceIdentity(value.sourceDefinition);
    const existing = resolvedDefinitions.get(identity);
    if (existing && JSON.stringify(existing) !== JSON.stringify(value.sourceDefinition)) {
      diagnostics.push({
        code: "source_mapping_ambiguous",
        path,
        message: `数据源 ${source.key} 对同一 canonical 版本返回了不一致的登记定义`,
        sourceAlias: source.key,
        sourceKey: value.sourceDefinition.sourceKey,
      });
    } else {
      resolvedDefinitions.set(identity, value.sourceDefinition);
    }
    const notice = executionPolicyNotice(source, value.sourceDefinition, path);
    if (notice) notices.push(notice);
  });
  if (diagnostics.length) return { status: "needsMigration", diagnostics };

  const candidate = buildV3Definition(input.definition, sourceAliases, resolutions);
  const compiled = compileWorkspaceAnalysisDefinition({
    definition: candidate,
    scopeType: input.scopeType,
    sourceCatalog: {
      get(sourceKey, version) {
        return resolvedDefinitions.get(`${sourceKey}@${version}`) ?? null;
      },
    },
  });
  if (!compiled.ok) {
    return {
      status: "needsMigration",
      diagnostics: compiled.issues.map((issue) => ({
        code: "v3_compile_failed",
        path: issue.path,
        message: issue.message,
        ...(issue.sourceKey ? { sourceKey: issue.sourceKey } : {}),
        ...(issue.fieldKey ? { fieldPath: issue.fieldKey } : {}),
      })),
    };
  }
  return { status: "upgraded", definition: compiled.definition, notices };
}

function validateResolvedSource(
  source: WorkspaceApiSource,
  path: readonly ["sources", number],
  references: readonly FieldReference[],
  resolved: WorkspaceApiV2ResolvedSource,
  scopeType: WorkspaceAnalysisSourceScopeType,
  diagnostics: WorkspaceApiV2MigrationDiagnostic[],
) {
  const definition = resolved.sourceDefinition;
  if (!definition.scopeBindings[scopeType]) {
    diagnostics.push({
      code: "scope_semantics_mismatch",
      path,
      message: `${definition.label} 未证明支持当前空间口径`,
      sourceAlias: source.key,
      sourceKey: definition.sourceKey,
    });
  }
  const parameterIssues = validateWorkspaceAnalysisSourceParameterValues({
    values: resolved.parameters,
    sourceDefinition: definition,
    path,
  });
  diagnostics.push(...parameterIssues.map((issue) => ({
    code: "parameter_value_invalid" as const,
    path: issue.path,
    message: issue.message,
    sourceAlias: source.key,
    sourceKey: definition.sourceKey,
  })));

  const canonicalFields = new Set(definition.fields.map((field) => field.key));
  for (const reference of references) {
    if (!Object.hasOwn(resolved.fieldMappings, reference.fieldPath)) {
      diagnostics.push({
        code: "field_mapping_missing",
        path: reference.path,
        message: `旧字段 ${reference.fieldPath} 没有唯一的 canonical 字段映射`,
        sourceAlias: source.key,
        sourceKey: definition.sourceKey,
        fieldPath: reference.fieldPath,
      });
      continue;
    }
    const canonicalField = resolved.fieldMappings[reference.fieldPath]!;
    if (!canonicalFields.has(canonicalField)) {
      diagnostics.push({
        code: "field_mapping_missing",
        path: reference.path,
        message: `旧字段 ${reference.fieldPath} 映射到了未登记字段`,
        sourceAlias: source.key,
        sourceKey: definition.sourceKey,
        fieldPath: reference.fieldPath,
      });
    }
  }
}

function buildV3Definition(
  legacy: WorkspaceApiOperationalAnalysisDefinition,
  aliases: ReadonlyMap<string, string>,
  resolutions: ReadonlyMap<string, WorkspaceApiV2ResolvedSource>,
): WorkspaceSourcesOperationalAnalysisDefinition {
  return {
    schemaVersion: 3,
    dataset: "workspace.sources",
    ...(legacy.layout ? { layout: legacy.layout } : {}),
    sources: legacy.sources.map((source) => {
      const resolved = resolutions.get(source.key)!;
      return {
        key: aliases.get(source.key)!,
        ...(source.label ? { label: source.label } : {}),
        sourceKey: resolved.sourceDefinition.sourceKey,
        sourceVersion: resolved.sourceDefinition.version,
        ...(Object.keys(resolved.parameters).length ? { parameters: { ...resolved.parameters } } : {}),
      };
    }),
    filters: legacy.filters.map((filter) => ({
      ...filter,
      key: normalizeIdentifier(filter.key)!,
      source: aliases.get(filter.source)!,
      field: mapField(resolutions, filter.source, filter.field),
    })),
    blocks: legacy.blocks.map((block, index): WorkspaceSourcesBlock => {
      const key = `block${index + 1}`;
      if (block.kind === "note") return { key, kind: "note", ...copyNote(block) };
      const source = aliases.get(block.source)!;
      if (block.kind === "apiMetrics") {
        return { key, kind: "metrics", source, metrics: mapMetrics(block.metrics, block.source, resolutions) };
      }
      if (block.kind === "apiChart") {
        return {
          key,
          kind: "chart",
          source,
          title: block.title,
          dimension: {
            field: mapField(resolutions, block.source, block.dimension.field),
            ...(block.dimension.label ? { label: block.dimension.label } : {}),
            ...(block.dimension.bucket ? { bucket: block.dimension.bucket } : {}),
          },
          metrics: mapMetrics(block.metrics, block.source, resolutions),
          ...(block.comparison ? { comparison: block.comparison } : {}),
          ...(block.sort ? { sort: block.sort } : {}),
          ...(block.limit ? { limit: block.limit } : {}),
        };
      }
      return {
        key,
        kind: "table",
        source,
        title: block.title,
        columns: block.columns.map((column) => ({
          ...column,
          key: normalizeIdentifier(column.key)!,
          field: mapField(resolutions, block.source, column.field),
        })),
        ...(block.limit ? { limit: block.limit } : {}),
      };
    }),
  };
}

function mapMetrics(
  metrics: readonly WorkspaceSourcesMetric[],
  sourceAlias: string,
  resolutions: ReadonlyMap<string, WorkspaceApiV2ResolvedSource>,
): WorkspaceSourcesMetric[] {
  return metrics.map((metric) => ({
    ...metric,
    key: normalizeIdentifier(metric.key)!,
    ...(metric.field ? { field: mapField(resolutions, sourceAlias, metric.field) } : {}),
  }));
}

function mapField(
  resolutions: ReadonlyMap<string, WorkspaceApiV2ResolvedSource>,
  sourceAlias: string,
  fieldPath: string,
) {
  return resolutions.get(sourceAlias)!.fieldMappings[fieldPath]!;
}

function copyNote(block: { readonly title?: string; readonly content: string }) {
  return {
    ...(block.title ? { title: block.title } : {}),
    content: block.content,
  };
}

function collectFieldReferences(
  definition: WorkspaceApiOperationalAnalysisDefinition,
  diagnostics: WorkspaceApiV2MigrationDiagnostic[],
) {
  const references = new Map(definition.sources.map((source) => [source.key, [] as FieldReference[]]));
  const add = (sourceAlias: string, fieldPath: string, path: readonly PropertyKey[]) => {
    const sourceReferences = references.get(sourceAlias);
    if (!sourceReferences) {
      diagnostics.push({
        code: "source_mapping_missing",
        path,
        message: `字段引用了不存在的旧数据源 ${sourceAlias}`,
        sourceAlias,
        fieldPath,
      });
      return;
    }
    sourceReferences.push({ fieldPath, path });
  };
  definition.filters.forEach((filter, index) => add(filter.source, filter.field, ["filters", index, "field"]));
  definition.blocks.forEach((block, blockIndex) => {
    if (block.kind === "note") return;
    if (block.kind === "apiChart") {
      add(block.source, block.dimension.field, ["blocks", blockIndex, "dimension", "field"]);
    }
    if (block.kind === "apiMetrics" || block.kind === "apiChart") {
      block.metrics.forEach((metric, metricIndex) => {
        if (metric.field) add(block.source, metric.field, ["blocks", blockIndex, "metrics", metricIndex, "field"]);
      });
    } else {
      block.columns.forEach((column, columnIndex) => (
        add(block.source, column.field, ["blocks", blockIndex, "columns", columnIndex, "field"])
      ));
    }
  });
  return references;
}

function normalizeSourceAliases(
  definition: WorkspaceApiOperationalAnalysisDefinition,
  diagnostics: WorkspaceApiV2MigrationDiagnostic[],
) {
  const aliases = new Map<string, string>();
  const seen = new Map<string, string>();
  definition.sources.forEach((source, index) => {
    const normalized = normalizeAndTrack(source.key, ["sources", index, "key"], "数据源", seen, diagnostics);
    if (normalized) aliases.set(source.key, normalized);
  });
  return aliases;
}

function normalizeDefinitionMemberKeys(
  definition: WorkspaceApiOperationalAnalysisDefinition,
  diagnostics: WorkspaceApiV2MigrationDiagnostic[],
) {
  const filters = new Map<string, string>();
  definition.filters.forEach((filter, index) => {
    normalizeAndTrack(filter.key, ["filters", index, "key"], "筛选器", filters, diagnostics);
  });
  definition.blocks.forEach((block, blockIndex) => {
    if (block.kind === "apiMetrics" || block.kind === "apiChart") {
      const metrics = new Map<string, string>();
      block.metrics.forEach((metric, metricIndex) => {
        normalizeAndTrack(metric.key, ["blocks", blockIndex, "metrics", metricIndex, "key"], "指标", metrics, diagnostics);
      });
    }
    if (block.kind === "apiTable") {
      const columns = new Map<string, string>();
      block.columns.forEach((column, columnIndex) => {
        normalizeAndTrack(column.key, ["blocks", blockIndex, "columns", columnIndex, "key"], "表格列", columns, diagnostics);
      });
    }
  });
}

function normalizeAndTrack(
  value: string,
  path: readonly PropertyKey[],
  label: string,
  seen: Map<string, string>,
  diagnostics: WorkspaceApiV2MigrationDiagnostic[],
) {
  const normalized = normalizeIdentifier(value);
  if (!normalized) {
    diagnostics.push({ code: "identifier_collision", path, message: `${label} key ${value} 无法安全转换为 camelCase` });
    return null;
  }
  const existing = seen.get(normalized);
  if (existing && existing !== value) {
    diagnostics.push({
      code: "identifier_collision",
      path,
      message: `${label} key ${value} 与 ${existing} 转换后同名 ${normalized}`,
    });
    return null;
  }
  seen.set(normalized, value);
  return normalized;
}

function normalizeIdentifier(value: string) {
  const normalized = value.replace(/[-_]+([a-zA-Z0-9])/g, (_match, member: string) => member.toUpperCase());
  return MEMBER_KEY_PATTERN.test(normalized) && !FORBIDDEN_MEMBER_KEYS.has(normalized) ? normalized : null;
}

function executionPolicyNotice(
  source: WorkspaceApiSource,
  definition: WorkspaceAnalysisSourceDefinition,
  path: readonly ["sources", number],
): WorkspaceApiV2MigrationNotice | null {
  const pagination = source.pagination;
  const legacyPageSize = pagination?.pageSize ?? 500;
  const legacyMaxPages = pagination?.maxPages ?? 20;
  const changed = !pagination
    || legacyPageSize !== definition.limits.maxPageSize
    || legacyMaxPages !== definition.limits.maxPages
    || legacyPageSize * legacyMaxPages !== definition.limits.maxRows;
  if (!changed) return null;
  return {
    code: "execution_policy_changed",
    path,
    message: `${definition.label} 升级后使用登记数据源的有界分页和行数上限`,
    sourceAlias: source.key,
    sourceKey: definition.sourceKey,
  };
}

function sourceIdentity(definition: WorkspaceAnalysisSourceDefinition) {
  return `${definition.sourceKey}@${definition.version}`;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
