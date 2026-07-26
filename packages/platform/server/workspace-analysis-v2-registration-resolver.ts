import "server-only";

import type {
  WorkspaceAnalysisParameterValue,
  WorkspaceAnalysisSourceParameterDefinition,
  WorkspaceApiQueryValue,
} from "../workspace-analysis-source-contract";
import { validateWorkspaceAnalysisSourceParameterValues } from "./workspace-analysis-definition-compiler";
import type {
  WorkspaceAnalysisSourceRegistration,
  WorkspaceAnalysisWorkspaceGetRegistration,
} from "./workspace-analysis-source-registry";
import type {
  WorkspaceApiV2AuthorizedSourceResolver,
  WorkspaceApiV2MigrationDiagnostic,
  WorkspaceApiV2SourceResolution,
} from "./workspace-analysis-v2-upgrader";

type ResolverInput = Parameters<WorkspaceApiV2AuthorizedSourceResolver["resolve"]>[0];

type RouteMatch = {
  readonly registration: WorkspaceAnalysisWorkspaceGetRegistration;
  readonly pathValues: Readonly<Record<string, string>>;
};

/**
 * Builds a synchronous v2 resolver from an authorization result owned by the
 * caller. `authorizedRegistrations` MUST already be filtered for the current
 * requester and exact target space. This module deliberately has no catalog,
 * discovery, `latest`, or global fallback: absence from this array is denial.
 */
export function createWorkspaceApiV2AuthorizedRegistrationResolver(input: {
  readonly authorizedRegistrations: readonly WorkspaceAnalysisSourceRegistration[];
}): WorkspaceApiV2AuthorizedSourceResolver {
  const registrations = input.authorizedRegistrations
    .filter(isWorkspaceGetRegistration)
    .sort(compareRegistrations);
  return {
    resolve(resolutionInput) {
      return resolveAuthorizedRegistration(registrations, resolutionInput);
    },
  };
}

function resolveAuthorizedRegistration(
  registrations: readonly WorkspaceAnalysisWorkspaceGetRegistration[],
  input: ResolverInput,
): WorkspaceApiV2SourceResolution {
  const matches = registrations.flatMap((registration): RouteMatch[] => {
    if (registration.migration?.workspaceApiV2?.equivalence !== "directRows") return [];
    if (registration.adapter.rowsPath !== input.source.rowsPath) return [];
    const pathValues = matchConcreteRoute(registration.adapter.path, input.source.path);
    return pathValues ? [{ registration, pathValues }] : [];
  });

  if (matches.length === 0) {
    return needsMigration(diagnostic(input, {
      code: "source_mapping_missing",
      member: "path",
      message: `数据源 ${input.source.key} 没有已授权且显式声明逐行等价的 canonical 映射`,
    }));
  }
  if (matches.length > 1) {
    const identities = matches.map(({ registration }) => sourceIdentity(registration)).sort(compareText);
    return needsMigration(diagnostic(input, {
      code: "source_mapping_ambiguous",
      member: "path",
      message: `数据源 ${input.source.key} 同时匹配多个已授权 canonical 版本：${identities.join("、")}`,
    }));
  }

  const match = matches[0]!;
  const diagnostics: WorkspaceApiV2MigrationDiagnostic[] = [];
  validateScopeSemantics(match.registration, input, diagnostics);
  validatePaginationSemantics(match.registration, input, diagnostics);
  const parameters = mapParameters(match, input, diagnostics);
  const fieldMappings = mapFields(match.registration, input, diagnostics);
  if (diagnostics.length) return { status: "needsMigration", diagnostics };

  return {
    status: "resolved",
    value: {
      sourceDefinition: match.registration.definition,
      parameters,
      fieldMappings,
    },
  };
}

function validateScopeSemantics(
  registration: WorkspaceAnalysisWorkspaceGetRegistration,
  input: ResolverInput,
  diagnostics: WorkspaceApiV2MigrationDiagnostic[],
) {
  const binding = registration.definition.scopeBindings[input.scopeType];
  const query = input.source.query ?? {};
  const boundEntries = sortedEntries(query).filter(([, value]) => typeof value === "object");
  if (!binding) {
    diagnostics.push(diagnostic(input, {
      code: "scope_semantics_mismatch",
      member: "query",
      message: `${registration.definition.label} 未声明当前空间口径`,
      sourceKey: registration.definition.sourceKey,
    }));
    return;
  }
  if (binding.mode === "viewer") {
    diagnostics.push(diagnostic(input, {
      code: "scope_semantics_mismatch",
      member: "query",
      message: `${registration.definition.label} 使用查看者口径，v2 scopeId 不能推断 requesterId`,
      sourceKey: registration.definition.sourceKey,
    }));
    return;
  }

  const expected = registration.adapter.scopeQuery[input.scopeType] ?? {};
  if (binding.mode === "workspace") {
    if (Object.keys(expected).length || boundEntries.length) {
      diagnostics.push(diagnostic(input, {
        code: "scope_semantics_mismatch",
        member: "query",
        message: `${registration.definition.label} 的 workspace 口径不能伪装成目标空间绑定`,
        sourceKey: registration.definition.sourceKey,
      }));
    }
    return;
  }

  const expectedEntries = sortedEntries(expected);
  const exact = expectedEntries.length === boundEntries.length && expectedEntries.every(([queryKey, value], index) => {
    if (value === "requesterId") return false;
    const actual = boundEntries[index];
    return actual?.[0] === queryKey && isExactBinding(actual[1], value);
  });
  if (!exact) {
    diagnostics.push(diagnostic(input, {
      code: "scope_semantics_mismatch",
      member: "query",
      message: `${registration.definition.label} 的目标空间查询绑定与 v2 模板不完全一致`,
      sourceKey: registration.definition.sourceKey,
    }));
  }
}

function validatePaginationSemantics(
  registration: WorkspaceAnalysisWorkspaceGetRegistration,
  input: ResolverInput,
  diagnostics: WorkspaceApiV2MigrationDiagnostic[],
) {
  const legacy = input.source.pagination;
  const canonical = registration.adapter.pagination;
  if (
    !legacy
    || legacy.totalPath !== canonical.totalPath
    || (legacy.pageParam ?? "page") !== canonical.pageParam
    || (legacy.pageSizeParam ?? "pageSize") !== canonical.pageSizeParam
  ) {
    diagnostics.push(diagnostic(input, {
      code: "query_semantics_mismatch",
      member: "pagination",
      message: `${registration.definition.label} 的总数、页码或每页数量参数与 v2 模板不一致`,
      sourceKey: registration.definition.sourceKey,
    }));
  }
}

function mapParameters(
  match: RouteMatch,
  input: ResolverInput,
  diagnostics: WorkspaceApiV2MigrationDiagnostic[],
): Readonly<Record<string, WorkspaceAnalysisParameterValue>> {
  const { registration } = match;
  const declaration = registration.migration!.workspaceApiV2!;
  const definitions = new Map(registration.definition.parameters.map((parameter) => [parameter.key, parameter]));
  const parameters: Record<string, WorkspaceAnalysisParameterValue> = {};
  const pathMappings = declaration.pathParameters ?? {};
  const pathNames = Object.keys(match.pathValues).sort(compareText);
  if (!sameKeys(pathNames, Object.keys(pathMappings).sort(compareText))) {
    diagnostics.push(diagnostic(input, {
      code: "path_parameter_invalid",
      member: "path",
      message: `${registration.definition.label} 的动态路径参数没有完整迁移声明`,
      sourceKey: registration.definition.sourceKey,
    }));
  } else {
    for (const placeholder of pathNames) {
      const parameterKey = pathMappings[placeholder]!;
      const definition = definitions.get(parameterKey);
      const value = definition?.required
        ? parsePathValue(match.pathValues[placeholder]!, definition)
        : null;
      if (value === null || Object.hasOwn(parameters, parameterKey)) {
        diagnostics.push(diagnostic(input, {
          code: "path_parameter_invalid",
          member: "path",
          message: `${registration.definition.label} 的路径段 ${placeholder} 不能唯一映射为必填参数`,
          sourceKey: registration.definition.sourceKey,
        }));
        continue;
      }
      parameters[parameterKey] = value;
    }
  }

  const reverseQuery = reverseParameterQuery(registration);
  const paginationKeys = new Set([
    registration.adapter.pagination.pageParam,
    registration.adapter.pagination.pageSizeParam,
  ]);
  for (const [queryKey, rawValue] of sortedEntries(input.source.query ?? {})) {
    if (typeof rawValue === "object") continue;
    const parameterKeys = reverseQuery.get(queryKey) ?? [];
    const parameterKey = parameterKeys[0];
    const definition = parameterKey ? definitions.get(parameterKey) : undefined;
    if (paginationKeys.has(queryKey) || parameterKeys.length !== 1 || !definition || !isExactQueryValue(rawValue, definition)) {
      diagnostics.push(diagnostic(input, {
        code: "query_semantics_mismatch",
        member: "query",
        message: `${registration.definition.label} 的查询条件 ${queryKey} 没有唯一且同类型的 canonical 参数映射`,
        sourceKey: registration.definition.sourceKey,
      }));
      continue;
    }
    if (Object.hasOwn(parameters, parameterKey) && parameters[parameterKey] !== rawValue) {
      diagnostics.push(diagnostic(input, {
        code: "query_semantics_mismatch",
        member: "query",
        message: `${registration.definition.label} 的查询条件 ${queryKey} 与动态路径参数不一致`,
        sourceKey: registration.definition.sourceKey,
      }));
      continue;
    }
    parameters[parameterKey] = rawValue;
  }

  const parameterIssues = validateWorkspaceAnalysisSourceParameterValues({
    values: parameters,
    sourceDefinition: registration.definition,
    path: input.path,
  });
  diagnostics.push(...parameterIssues.map((issue) => ({
    code: "parameter_value_invalid" as const,
    path: issue.path,
    message: issue.message,
    sourceAlias: input.source.key,
    sourceKey: registration.definition.sourceKey,
  })));
  return parameters;
}

function mapFields(
  registration: WorkspaceAnalysisWorkspaceGetRegistration,
  input: ResolverInput,
  diagnostics: WorkspaceApiV2MigrationDiagnostic[],
): Readonly<Record<string, string>> {
  const declaration = registration.migration!.workspaceApiV2!;
  const allowed = new Set(declaration.fields === "all"
    ? registration.definition.fields.map((field) => field.key)
    : declaration.fields);
  const mappings: Record<string, string> = {};
  for (const rawField of [...new Set(input.referencedFields)].sort(compareText)) {
    const canonicalFields = Object.entries(registration.adapter.fieldPaths)
      .filter(([fieldKey, fieldPath]) => allowed.has(fieldKey) && fieldPath === rawField)
      .map(([fieldKey]) => fieldKey)
      .sort(compareText);
    if (canonicalFields.length === 0) {
      diagnostics.push(diagnostic(input, {
        code: "field_mapping_missing",
        member: "rowsPath",
        message: `旧字段 ${rawField} 没有获准迁移到 ${registration.definition.label}`,
        sourceKey: registration.definition.sourceKey,
        fieldPath: rawField,
      }));
    } else if (canonicalFields.length > 1) {
      diagnostics.push(diagnostic(input, {
        code: "field_mapping_ambiguous",
        member: "rowsPath",
        message: `旧字段 ${rawField} 对应多个 canonical 字段`,
        sourceKey: registration.definition.sourceKey,
        fieldPath: rawField,
      }));
    } else {
      mappings[rawField] = canonicalFields[0]!;
    }
  }
  return mappings;
}

function reverseParameterQuery(registration: WorkspaceAnalysisWorkspaceGetRegistration) {
  const reverse = new Map<string, string[]>();
  for (const [parameterKey, queryKey] of sortedEntries(registration.adapter.parameterQuery)) {
    reverse.set(queryKey, [...(reverse.get(queryKey) ?? []), parameterKey].sort(compareText));
  }
  return reverse;
}

function matchConcreteRoute(pattern: string, concrete: string): Readonly<Record<string, string>> | null {
  const placeholders: string[] = [];
  let cursor = 0;
  let expression = "^";
  for (const match of pattern.matchAll(/\[([a-z][a-zA-Z0-9]*)\]/g)) {
    expression += escapeRegExp(pattern.slice(cursor, match.index)) + "([^/]+)";
    placeholders.push(match[1]!);
    cursor = match.index! + match[0].length;
  }
  expression += escapeRegExp(pattern.slice(cursor)) + "$";
  const values = new RegExp(expression).exec(concrete);
  if (!values) return null;
  const result: Record<string, string> = {};
  for (let index = 0; index < placeholders.length; index += 1) {
    try {
      result[placeholders[index]!] = decodeURIComponent(values[index + 1]!);
    } catch {
      return null;
    }
  }
  return result;
}

function parsePathValue(
  value: string,
  definition: WorkspaceAnalysisSourceParameterDefinition,
): WorkspaceAnalysisParameterValue | null {
  if (definition.kind === "text" || definition.kind === "date") return value;
  if (definition.kind === "boolean") return value === "true" ? true : value === "false" ? false : null;
  if (definition.kind === "integer") {
    if (!/^-?(?:0|[1-9]\d*)$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isExactQueryValue(value: WorkspaceApiQueryValue, definition: WorkspaceAnalysisSourceParameterDefinition) {
  if (definition.kind === "boolean") return typeof value === "boolean";
  if (definition.kind === "integer") return typeof value === "number" && Number.isSafeInteger(value);
  if (definition.kind === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === "string";
}

function isExactBinding(value: WorkspaceApiQueryValue, expected: "scopeId" | "scopeType") {
  return isPlainRecord(value)
    && Object.keys(value).length === 1
    && value.binding === expected;
}

function diagnostic(
  input: ResolverInput,
  detail: {
    readonly code: WorkspaceApiV2MigrationDiagnostic["code"];
    readonly member: "path" | "rowsPath" | "query" | "pagination";
    readonly message: string;
    readonly sourceKey?: string;
    readonly fieldPath?: string;
  },
): WorkspaceApiV2MigrationDiagnostic {
  return {
    code: detail.code,
    path: [...input.path, detail.member],
    message: detail.message,
    sourceAlias: input.source.key,
    ...(detail.sourceKey ? { sourceKey: detail.sourceKey } : {}),
    ...(detail.fieldPath ? { fieldPath: detail.fieldPath } : {}),
  };
}

function needsMigration(diagnostics: WorkspaceApiV2MigrationDiagnostic | readonly WorkspaceApiV2MigrationDiagnostic[]) {
  return {
    status: "needsMigration" as const,
    diagnostics: Array.isArray(diagnostics) ? diagnostics : [diagnostics],
  };
}

function sortedEntries<T>(record: Readonly<Record<string, T>>) {
  return Object.entries(record).sort(([left], [right]) => compareText(left, right));
}

function compareRegistrations(
  left: WorkspaceAnalysisWorkspaceGetRegistration,
  right: WorkspaceAnalysisWorkspaceGetRegistration,
) {
  return compareText(sourceIdentity(left), sourceIdentity(right))
    || compareText(left.adapter.path, right.adapter.path)
    || compareText(left.adapter.rowsPath, right.adapter.rowsPath);
}

function sourceIdentity(registration: WorkspaceAnalysisSourceRegistration) {
  return `${registration.definition.sourceKey}@${registration.definition.version}`;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameKeys(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isWorkspaceGetRegistration(
  registration: WorkspaceAnalysisSourceRegistration,
): registration is WorkspaceAnalysisWorkspaceGetRegistration {
  return registration.adapter.kind === "workspaceGet";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
