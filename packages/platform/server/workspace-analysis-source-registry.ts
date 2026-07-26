import "server-only";

import type {
  WorkspaceAnalysisSourceDefinition,
  WorkspaceAnalysisSourceFieldDefinition,
  WorkspaceAnalysisSourceScopeType,
} from "../workspace-analysis-source-contract";
import { findApiContract } from "../api-registry";
import { validateRegisteredWorkspaceAnalysisSourcePath } from "../workspace-analysis-source-policy";
import { getWorkspaceAnalysisOwnerUnitId } from "./workspace-analysis-source-owner";
import type { WorkspaceAnalysisSourceRegistration } from "./workspace-analysis-source-registration";

export type {
  WorkspaceAnalysisOwnerDerivedAdapter,
  WorkspaceAnalysisOwnerDerivedRegistration,
  WorkspaceAnalysisSourceRegistration,
  WorkspaceAnalysisWorkspaceGetAdapter,
  WorkspaceAnalysisWorkspaceGetRegistration,
  WorkspaceApiV2MigrationDeclaration,
} from "./workspace-analysis-source-registration";

const SOURCE_KEY_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const MEMBER_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*$/;
const RESERVED_PARAMETER_KEYS = new Set([
  "departmentId",
  "projectId",
  "requesterId",
  "scopeId",
  "scopeType",
  "userId",
]);
const FORBIDDEN_MEMBER_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SCOPE_TYPES = new Set<WorkspaceAnalysisSourceScopeType>(["personal", "department", "project"]);
const SCOPE_QUERY_BINDINGS = new Set(["requesterId", "scopeId", "scopeType"]);
const NUMERIC_FIELD_KINDS = new Set(["number", "integer", "currency", "percent"]);
const NUMERIC_AGGREGATES = new Set(["sum", "average", "min", "max"]);
const OWNER_DERIVATION_KINDS = new Set(["partitionedSnapshot", "boundedRelationSnapshot"]);

export type WorkspaceAnalysisSourceCatalog = ReturnType<typeof createWorkspaceAnalysisSourceCatalog>;

export function createWorkspaceAnalysisSourceCatalog(
  initialRegistrations: readonly WorkspaceAnalysisSourceRegistration[] = [],
) {
  const registrations = new Map<string, WorkspaceAnalysisSourceRegistration>();
  const workspaceApiV2Declarations: WorkspaceAnalysisSourceRegistration[] = [];
  const catalog = {
    register(registration: WorkspaceAnalysisSourceRegistration) {
      const storedRegistration = cloneAndFreeze(registration);
      const { definition } = storedRegistration;
      validateWorkspaceAnalysisSourceDefinition(definition);
      validateWorkspaceAnalysisSourceAdapter(storedRegistration);
      validateWorkspaceApiV2Migration(storedRegistration);
      const identity = sourceIdentity(definition.sourceKey, definition.version);
      if (registrations.has(identity)) {
        throw new Error(`重复注册经营分析数据源: ${identity}`);
      }
      const ambiguous = workspaceApiV2Declarations.find((candidate) => (
        workspaceApiV2DeclarationsAreAmbiguous(candidate, storedRegistration)
      ));
      if (ambiguous) {
        throw new Error(
          `${identity} 的 workspace.api v2 迁移声明与 ${sourceIdentity(
            ambiguous.definition.sourceKey,
            ambiguous.definition.version,
          )} 重叠，无法唯一解析`,
        );
      }
      registrations.set(identity, storedRegistration);
      if (storedRegistration.migration?.workspaceApiV2) {
        workspaceApiV2Declarations.push(storedRegistration);
      }
    },
    get(sourceKey: string, version: number) {
      return registrations.get(sourceIdentity(sourceKey, version))?.definition ?? null;
    },
    resolve(sourceKey: string, version: number) {
      return registrations.get(sourceIdentity(sourceKey, version)) ?? null;
    },
    list() {
      return [...registrations.values()].map(({ definition }) => definition).sort((left, right) => (
        left.sourceKey.localeCompare(right.sourceKey) || left.version - right.version
      ));
    },
    latest(sourceKey: string) {
      return [...registrations.values()]
        .map(({ definition }) => definition)
        .filter((definition) => definition.sourceKey === sourceKey)
        .sort((left, right) => right.version - left.version)[0] ?? null;
    },
    validateReferences() {
      const sourceKeys = new Set([...registrations.values()].map(({ definition }) => definition.sourceKey));
      for (const registration of registrations.values()) {
        for (const item of registration.fieldCoverage ?? []) {
          if (item.disposition !== "childSource") continue;
          if (!sourceKeys.has(item.sourceKey)) {
            throw new Error(
              `${registration.definition.sourceKey}.${item.fieldKey} 引用了未注册的子数据源: ${item.sourceKey}`,
            );
          }
        }
      }
    },
  };
  for (const registration of initialRegistrations) catalog.register(registration);
  return catalog;
}

function validateWorkspaceApiV2Migration(registration: WorkspaceAnalysisSourceRegistration) {
  const migration = registration.migration;
  if (migration === undefined) return;
  if (registration.adapter.kind !== "workspaceGet") {
    throw new Error(`${registration.definition.sourceKey} ownerDerived 数据源不能声明 workspaceApiV2 迁移`);
  }
  if (!isPlainRecord(migration) || !hasOnlyKeys(migration, ["workspaceApiV2"]) || !migration.workspaceApiV2) {
    throw new Error(`${registration.definition.sourceKey} migration 只能声明 workspaceApiV2`);
  }
  const declaration = migration.workspaceApiV2;
  if (
    !isPlainRecord(declaration)
    || !hasOnlyKeys(declaration, ["equivalence", "pathParameters", "fields"])
    || declaration.equivalence !== "directRows"
  ) {
    throw new Error(`${registration.definition.sourceKey} workspaceApiV2 必须显式声明 directRows 等价关系`);
  }

  const definitionFields = new Set(registration.definition.fields.map((field) => field.key));
  if (declaration.fields !== "all") {
    if (!Array.isArray(declaration.fields) || declaration.fields.length === 0) {
      throw new Error(`${registration.definition.sourceKey} workspaceApiV2 fields 必须是 all 或非空字段子集`);
    }
    const seen = new Set<string>();
    for (const fieldKey of declaration.fields) {
      if (typeof fieldKey !== "string" || !definitionFields.has(fieldKey)) {
        throw new Error(`${registration.definition.sourceKey} workspaceApiV2 引用了未登记字段: ${String(fieldKey)}`);
      }
      if (seen.has(fieldKey)) {
        throw new Error(`${registration.definition.sourceKey} workspaceApiV2 字段重复: ${fieldKey}`);
      }
      seen.add(fieldKey);
    }
  }

  const placeholders = extractRoutePlaceholders(registration.adapter.path, registration.definition.sourceKey);
  const pathParameters = declaration.pathParameters ?? {};
  if (!isPlainRecord(pathParameters)) {
    throw new Error(`${registration.definition.sourceKey} workspaceApiV2 pathParameters 必须是对象`);
  }
  const mappedPlaceholders = Object.keys(pathParameters);
  if (!sameStringSet(placeholders, mappedPlaceholders)) {
    throw new Error(`${registration.definition.sourceKey} workspaceApiV2 必须完整映射动态路径参数`);
  }
  const parameters = new Map(registration.definition.parameters.map((parameter) => [parameter.key, parameter]));
  const mappedParameters = new Set<string>();
  for (const [placeholder, parameterKey] of Object.entries(pathParameters)) {
    validateMemberKey(placeholder, `${registration.definition.sourceKey} route placeholder`);
    if (typeof parameterKey !== "string" || !parameters.get(parameterKey)?.required) {
      throw new Error(`${registration.definition.sourceKey} workspaceApiV2 路径映射引用了未登记参数或非必填参数: ${String(parameterKey)}`);
    }
    if (mappedParameters.has(parameterKey)) {
      throw new Error(`${registration.definition.sourceKey} workspaceApiV2 多个路径段不能映射同一参数: ${parameterKey}`);
    }
    mappedParameters.add(parameterKey);
  }
}

function extractRoutePlaceholders(path: string, sourceKey: string) {
  const placeholders = [...path.matchAll(/\[([a-z][a-zA-Z0-9]*)\]/g)].map((match) => match[1]!);
  const remainder = path.replace(/\[[a-z][a-zA-Z0-9]*\]/g, "");
  if (remainder.includes("[") || remainder.includes("]") || new Set(placeholders).size !== placeholders.length) {
    throw new Error(`${sourceKey} workspaceApiV2 只支持唯一的简单动态路径占位符`);
  }
  return placeholders;
}

function workspaceApiV2DeclarationsAreAmbiguous(
  left: WorkspaceAnalysisSourceRegistration,
  right: WorkspaceAnalysisSourceRegistration,
) {
  const leftDeclaration = left.migration?.workspaceApiV2;
  const rightDeclaration = right.migration?.workspaceApiV2;
  if (!leftDeclaration || !rightDeclaration) return false;
  if (left.adapter.kind !== "workspaceGet" || right.adapter.kind !== "workspaceGet") return false;
  if (legacyRouteShape(left.adapter.path) !== legacyRouteShape(right.adapter.path)) return false;
  return left.adapter.rowsPath === right.adapter.rowsPath;
}

function legacyRouteShape(path: string) {
  return path.replace(/\[[a-z][a-zA-Z0-9]*\]/g, "[]");
}

function hasOnlyKeys(value: Readonly<Record<string, unknown>>, allowed: readonly string[]) {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function validateWorkspaceAnalysisSourceDefinition(definition: WorkspaceAnalysisSourceDefinition) {
  if (!SOURCE_KEY_PATTERN.test(definition.sourceKey)) {
    throw new Error(`经营分析 sourceKey 无效: ${definition.sourceKey}`);
  }
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new Error(`经营分析数据源版本无效: ${definition.sourceKey}`);
  }
  requireText(definition.label, `${definition.sourceKey} 缺少名称`);
  requireText(definition.description, `${definition.sourceKey} 缺少业务口径`);
  requireText(definition.ownerModuleKey, `${definition.sourceKey} 缺少 ownerModuleKey`);
  if (definition.sourceKey.split(".")[0] !== getWorkspaceAnalysisOwnerUnitId(definition.ownerModuleKey)) {
    throw new Error(`${definition.sourceKey} 的 sourceKey 前缀必须等于 ownerModuleKey 的规范化命名`);
  }
  requireText(definition.authorization.resourceKey, `${definition.sourceKey} 缺少授权资源`);
  validateAuthorization(definition);
  validateScopeBindings(definition);
  validateParameters(definition);
  validateParameterConstraints(definition);
  validateFields(definition);
  validateLimits(definition);
}

function validateWorkspaceAnalysisSourceAdapter(registration: WorkspaceAnalysisSourceRegistration) {
  const { definition, adapter } = registration;
  const pathError = validateRegisteredWorkspaceAnalysisSourcePath(adapter.path);
  if (pathError) throw new Error(`${definition.sourceKey} adapter: ${pathError}`);
  const contract = findApiContract("GET", adapter.path);
  if (!contract) throw new Error(`${definition.sourceKey} adapter 缺少 API contract`);
  if (contract.ownerModuleKey !== definition.ownerModuleKey) {
    throw new Error(`${definition.sourceKey} ownerModuleKey 与 API contract 不一致`);
  }
  if (contract.resourceKey !== definition.authorization.resourceKey) {
    throw new Error(`${definition.sourceKey} 授权资源与 API contract 不一致`);
  }
  if (!sameStringSet(contract.requiredActions, definition.authorization.requiredActions)) {
    throw new Error(`${definition.sourceKey} 授权动作与 API contract 不一致`);
  }
  if (contract.runtimeEnforcement !== definition.authorization.enforcement) {
    throw new Error(`${definition.sourceKey} 授权执行层与 API contract 不一致`);
  }
  if (contract.authorization.projection !== definition.authorization.projection) {
    throw new Error(`${definition.sourceKey} 授权投影与 API contract 不一致`);
  }
  if (adapter.kind === "workspaceGet") {
    validateFieldPath(adapter.rowsPath, `${definition.sourceKey}.rowsPath`);
    validateFieldPath(adapter.pagination.totalPath, `${definition.sourceKey}.totalPath`);
  } else {
    if (!OWNER_DERIVATION_KINDS.has(adapter.derivation.kind)) {
      throw new Error(`${definition.sourceKey} ownerDerived 派生类型无效: ${String(adapter.derivation.kind)}`);
    }
    requireText(adapter.derivation.description, `${definition.sourceKey} ownerDerived 缺少派生口径`);
  }
  const fieldKeys = new Set(definition.fields.map((field) => field.key));
  const rawFieldPaths = new Set<string>();
  for (const [fieldKey, fieldPath] of Object.entries(adapter.fieldPaths)) {
    if (!fieldKeys.has(fieldKey)) {
      throw new Error(`${definition.sourceKey} adapter 映射了未登记字段: ${fieldKey}`);
    }
    validateFieldPath(fieldPath, `${definition.sourceKey}.${fieldKey} fieldPath`);
    if (rawFieldPaths.has(fieldPath)) {
      throw new Error(`${definition.sourceKey} 多个字段不能映射到同一原始字段: ${fieldPath}`);
    }
    rawFieldPaths.add(fieldPath);
  }
  for (const fieldKey of fieldKeys) {
    if (!Object.hasOwn(adapter.fieldPaths, fieldKey)) {
      throw new Error(`${definition.sourceKey} 字段 ${fieldKey} 缺少 adapter 映射`);
    }
  }
  validateFieldCoverage(registration, fieldKeys);
  if (adapter.pagination.pageSize > definition.limits.maxPageSize) {
    throw new Error(`${definition.sourceKey} adapter pageSize 超过登记上限`);
  }
  if (adapter.pagination.maxPages > definition.limits.maxPages) {
    throw new Error(`${definition.sourceKey} adapter maxPages 超过登记上限`);
  }
  if (adapter.pagination.pageSize * adapter.pagination.maxPages < definition.limits.maxRows) {
    throw new Error(`${definition.sourceKey} adapter 分页容量小于 maxRows`);
  }
  if (adapter.kind === "ownerDerived") return;

  validateMemberKey(adapter.pagination.pageParam, `${definition.sourceKey} pageParam`);
  validateMemberKey(adapter.pagination.pageSizeParam, `${definition.sourceKey} pageSizeParam`);
  if (adapter.pagination.pageParam === adapter.pagination.pageSizeParam) {
    throw new Error(`${definition.sourceKey} 的分页参数不能重名`);
  }
  const paginationQueryKeys = new Set([adapter.pagination.pageParam, adapter.pagination.pageSizeParam]);
  const scopeQueryKeys = new Set<string>();
  for (const scopeType of Object.keys(adapter.scopeQuery) as WorkspaceAnalysisSourceScopeType[]) {
    if (!SCOPE_TYPES.has(scopeType)) {
      throw new Error(`${definition.sourceKey} adapter 声明了未知空间: ${scopeType}`);
    }
    if (!definition.scopeBindings[scopeType]) {
      throw new Error(`${definition.sourceKey} adapter 声明了不支持的 ${scopeType} 空间`);
    }
    for (const [queryKey, binding] of Object.entries(adapter.scopeQuery[scopeType] ?? {})) {
      validateMemberKey(queryKey, `${definition.sourceKey} scope query`);
      if (!SCOPE_QUERY_BINDINGS.has(binding)) {
        throw new Error(`${definition.sourceKey} scope query ${queryKey} 的绑定无效`);
      }
      if (paginationQueryKeys.has(queryKey)) {
        throw new Error(`${definition.sourceKey} scope query ${queryKey} 与系统查询参数冲突`);
      }
      scopeQueryKeys.add(queryKey);
    }
  }
  for (const scopeType of Object.keys(definition.scopeBindings) as WorkspaceAnalysisSourceScopeType[]) {
    const binding = definition.scopeBindings[scopeType]!;
    const scopeQuery = adapter.scopeQuery[scopeType] ?? {};
    const values = Object.values(scopeQuery);
    if (binding.mode === "target" && !values.includes("scopeId")) {
      throw new Error(`${definition.sourceKey} 的 ${scopeType} target 空间必须强制绑定 scopeId`);
    }
    if (binding.mode === "viewer" && !values.includes("requesterId")) {
      throw new Error(`${definition.sourceKey} 的 ${scopeType} viewer 空间必须强制绑定 requesterId`);
    }
    if (binding.mode === "workspace" && values.length) {
      throw new Error(`${definition.sourceKey} 的 ${scopeType} workspace 数据不能伪装空间查询条件`);
    }
  }
  const systemQueryKeys = new Set([...paginationQueryKeys, ...scopeQueryKeys]);
  const parameterKeys = new Set(definition.parameters.map((parameter) => parameter.key));
  const parameterQueryKeys = new Set<string>();
  for (const [parameterKey, queryKey] of Object.entries(adapter.parameterQuery)) {
    if (!parameterKeys.has(parameterKey)) {
      throw new Error(`${definition.sourceKey} adapter 引用了未登记参数: ${parameterKey}`);
    }
    validateMemberKey(queryKey, `${definition.sourceKey} query`);
    if (RESERVED_PARAMETER_KEYS.has(queryKey) || systemQueryKeys.has(queryKey)) {
      throw new Error(`${definition.sourceKey} 参数 ${parameterKey} 会覆盖系统查询条件 ${queryKey}`);
    }
    if (parameterQueryKeys.has(queryKey)) {
      throw new Error(`${definition.sourceKey} 多个参数映射到同一查询条件: ${queryKey}`);
    }
    parameterQueryKeys.add(queryKey);
  }
  for (const parameterKey of parameterKeys) {
    if (!Object.hasOwn(adapter.parameterQuery, parameterKey)) {
      throw new Error(`${definition.sourceKey} 参数 ${parameterKey} 缺少 adapter 映射`);
    }
  }
}

function validateFieldCoverage(
  registration: WorkspaceAnalysisSourceRegistration,
  analyticalFieldKeys: ReadonlySet<string>,
) {
  if (!registration.fieldCoverage) return;
  const seen = new Set<string>();
  const coveredAnalytical = new Set<string>();
  for (const item of registration.fieldCoverage) {
    validateMemberKey(item.fieldKey, `${registration.definition.sourceKey} public DTO field`);
    if (seen.has(item.fieldKey)) {
      throw new Error(`${registration.definition.sourceKey} public DTO 字段重复分类: ${item.fieldKey}`);
    }
    seen.add(item.fieldKey);
    if (item.disposition === "analytical") {
      coveredAnalytical.add(item.fieldKey);
      continue;
    }
    requireText(item.description, `${registration.definition.sourceKey}.${item.fieldKey} 缺少分类说明`);
    if (item.disposition === "childSource") {
      if (!SOURCE_KEY_PATTERN.test(item.sourceKey)) {
        throw new Error(`${registration.definition.sourceKey}.${item.fieldKey} 子数据源 key 无效`);
      }
    } else {
      requireText(item.reason, `${registration.definition.sourceKey}.${item.fieldKey} 缺少排除原因`);
    }
  }
  if (!sameStringSet([...coveredAnalytical], [...analyticalFieldKeys])) {
    throw new Error(`${registration.definition.sourceKey} public DTO 分析字段与 source definition 不一致`);
  }
}

function validateAuthorization(definition: WorkspaceAnalysisSourceDefinition) {
  const actions = definition.authorization.requiredActions;
  if (!actions.length) throw new Error(`${definition.sourceKey} 必须继承业务 GET 的授权动作`);
  if (new Set(actions).size !== actions.length) {
    throw new Error(`${definition.sourceKey} 的授权动作不能重复`);
  }
}

function validateScopeBindings(definition: WorkspaceAnalysisSourceDefinition) {
  const entries = Object.entries(definition.scopeBindings) as Array<[
    WorkspaceAnalysisSourceScopeType,
    NonNullable<WorkspaceAnalysisSourceDefinition["scopeBindings"][WorkspaceAnalysisSourceScopeType]>,
  ]>;
  if (!entries.length) throw new Error(`${definition.sourceKey} 至少需要支持一种空间`);
  for (const [scopeType, binding] of entries) {
    if (!SCOPE_TYPES.has(scopeType)) {
      throw new Error(`${definition.sourceKey} 声明了未知空间: ${scopeType}`);
    }
    requireText(binding.description, `${definition.sourceKey} 的 ${scopeType} 空间绑定缺少说明`);
  }
}

function validateParameters(definition: WorkspaceAnalysisSourceDefinition) {
  const keys = new Set<string>();
  for (const parameter of definition.parameters) {
    validateMemberKey(parameter.key, `${definition.sourceKey} 参数`);
    if (RESERVED_PARAMETER_KEYS.has(parameter.key)) {
      throw new Error(`${definition.sourceKey} 参数 ${parameter.key} 会覆盖系统空间绑定`);
    }
    if (keys.has(parameter.key)) throw new Error(`${definition.sourceKey} 参数重复: ${parameter.key}`);
    keys.add(parameter.key);
    requireText(parameter.label, `${definition.sourceKey} 参数 ${parameter.key} 缺少名称`);
    requireText(parameter.description, `${definition.sourceKey} 参数 ${parameter.key} 缺少口径`);
  }
  for (const parameter of definition.parameters) {
    const requiredWith = parameter.requiredWith ?? [];
    if (new Set(requiredWith).size !== requiredWith.length) {
      throw new Error(`${definition.sourceKey} 参数 ${parameter.key} 的联动参数不能重复`);
    }
    for (const relatedKey of requiredWith) {
      if (relatedKey === parameter.key || !keys.has(relatedKey)) {
        throw new Error(`${definition.sourceKey} 参数 ${parameter.key} 引用了无效联动参数: ${relatedKey}`);
      }
    }
  }
}

function validateParameterConstraints(definition: WorkspaceAnalysisSourceDefinition) {
  const parameters = new Map(definition.parameters.map((parameter) => [parameter.key, parameter]));
  const identities = new Set<string>();
  for (const constraint of definition.parameterConstraints ?? []) {
    requireText(constraint.description, `${definition.sourceKey} 参数约束缺少说明`);
    const from = parameters.get(constraint.from);
    const to = parameters.get(constraint.to);
    if (!from || !to || from.key === to.key) {
      throw new Error(`${definition.sourceKey} orderedDates 引用了无效参数`);
    }
    if (from.kind !== "date" || to.kind !== "date") {
      throw new Error(`${definition.sourceKey} orderedDates 只能约束日期参数`);
    }
    const identity = `${constraint.kind}:${constraint.from}:${constraint.to}`;
    if (identities.has(identity)) throw new Error(`${definition.sourceKey} 参数约束重复: ${identity}`);
    identities.add(identity);
  }
}

function validateFields(definition: WorkspaceAnalysisSourceDefinition) {
  if (!definition.fields.length) throw new Error(`${definition.sourceKey} 至少需要登记一个字段`);
  const keys = new Set<string>();
  for (const field of definition.fields) {
    validateMemberKey(field.key, `${definition.sourceKey} 字段`);
    if (keys.has(field.key)) throw new Error(`${definition.sourceKey} 字段重复: ${field.key}`);
    keys.add(field.key);
    requireText(field.label, `${definition.sourceKey} 字段 ${field.key} 缺少名称`);
    requireText(field.description, `${definition.sourceKey} 字段 ${field.key} 缺少口径`);
    validateFieldCapabilities(definition.sourceKey, field);
  }
}

function validateFieldCapabilities(sourceKey: string, field: WorkspaceAnalysisSourceFieldDefinition) {
  const filters = field.capabilities.filterOperators;
  const aggregates = field.capabilities.aggregateOperations;
  if (new Set(filters).size !== filters.length) throw new Error(`${sourceKey}.${field.key} 筛选能力重复`);
  if (new Set(aggregates).size !== aggregates.length) throw new Error(`${sourceKey}.${field.key} 聚合能力重复`);
  if (aggregates.some((operation) => NUMERIC_AGGREGATES.has(operation)) && !NUMERIC_FIELD_KINDS.has(field.kind)) {
    throw new Error(`${sourceKey}.${field.key} 不是数值字段，不能声明数值聚合`);
  }
}

function validateLimits(definition: WorkspaceAnalysisSourceDefinition) {
  const { maxRows, maxGroups, maxPageSize, maxPages, maxBytes, timeoutMs } = definition.limits;
  validateIntegerLimit(maxRows, 1, 10_000, `${definition.sourceKey}.maxRows`);
  validateIntegerLimit(maxGroups, 1, 1_000, `${definition.sourceKey}.maxGroups`);
  validateIntegerLimit(maxPageSize, 1, 500, `${definition.sourceKey}.maxPageSize`);
  validateIntegerLimit(maxPages, 1, 100, `${definition.sourceKey}.maxPages`);
  validateIntegerLimit(maxBytes, 1_024, 10 * 1024 * 1024, `${definition.sourceKey}.maxBytes`);
  validateIntegerLimit(timeoutMs, 100, 30_000, `${definition.sourceKey}.timeoutMs`);
  if (maxRows > maxPageSize * maxPages) {
    throw new Error(`${definition.sourceKey} 的分页容量小于 maxRows`);
  }
}

function validateIntegerLimit(value: number, min: number, max: number, label: string) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} 必须是 ${min}-${max} 的整数`);
  }
}

function validateMemberKey(value: string, label: string) {
  if (!MEMBER_KEY_PATTERN.test(value) || FORBIDDEN_MEMBER_KEYS.has(value)) {
    throw new Error(`${label} key 无效: ${value}`);
  }
}

function validateFieldPath(value: string, label: string) {
  const members = value.split(".");
  if (
    !/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(value)
    || members.some((member) => FORBIDDEN_MEMBER_KEYS.has(member))
  ) {
    throw new Error(`${label} 无效: ${value}`);
  }
}

function requireText(value: string, error: string) {
  if (!value.trim()) throw new Error(error);
}

function sourceIdentity(sourceKey: string, version: number) {
  return `${sourceKey}@${version}`;
}

function sameStringSet(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function cloneAndFreeze<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
