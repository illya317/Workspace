import "server-only";

import type {
  WorkspaceAnalysisRuntimeValue,
  WorkspaceAnalysisSourceDefinition,
} from "../workspace-analysis-source-contract";
import { validateWorkspaceAnalysisSourceParameterValues } from "./workspace-analysis-definition-compiler";
import type {
  WorkspaceAnalysisSourceCatalog,
  WorkspaceAnalysisSourceRegistration,
} from "./workspace-analysis-source-registry";
import {
  WorkspaceAnalysisRuntimeError,
  type WorkspaceAnalysisLoadedSource,
  type WorkspaceAnalysisSourceLoadRequest,
} from "./workspace-analysis-runtime";
import { isWorkspaceAnalysisSourceRuntimeEnabled } from "./workspace-analysis-source-enabled";
import { workspaceAnalysisSourceBelongsToUnit } from "./workspace-analysis-source-owner";

export type WorkspaceAnalysisRawSourcePage = {
  readonly rows: readonly unknown[];
  readonly totalRows: number;
};

export type WorkspaceAnalysisRawSourcePageReader = (input: {
  readonly registration: WorkspaceAnalysisSourceRegistration;
  readonly requesterId: number;
  readonly targetType: WorkspaceAnalysisSourceLoadRequest["targetType"];
  readonly targetId: number;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
  readonly page: number;
  readonly pageSize: number;
  readonly signal: AbortSignal;
}) => Promise<WorkspaceAnalysisRawSourcePage>;

export async function runRegisteredWorkspaceAnalysisSource(input: {
  readonly ownerUnitId: string;
  readonly sourceCatalog: Pick<WorkspaceAnalysisSourceCatalog, "resolve">;
  readonly request: WorkspaceAnalysisSourceLoadRequest;
  readonly canExecute: (context: {
    readonly requesterId: number;
    readonly targetType: WorkspaceAnalysisSourceLoadRequest["targetType"];
    readonly targetId: number;
    readonly source: WorkspaceAnalysisSourceDefinition;
  }) => Promise<boolean> | boolean;
  readonly loadPage: WorkspaceAnalysisRawSourcePageReader;
}): Promise<WorkspaceAnalysisLoadedSource> {
  const { request } = input;
  if (request.ownerUnitId !== input.ownerUnitId) {
    throw sourceError("source_response_invalid", "经营分析数据源 owner 不匹配", request.sourceKey);
  }
  const registration = input.sourceCatalog.resolve(request.sourceKey, request.sourceVersion);
  if (!registration || !workspaceAnalysisSourceBelongsToUnit(registration.definition.ownerModuleKey, input.ownerUnitId)) {
    throw sourceError("source_unavailable", "经营分析数据源版本不存在或暂不可用", request.sourceKey);
  }
  const { definition } = registration;
  if (!isWorkspaceAnalysisSourceRuntimeEnabled(definition)) {
    throw sourceError("source_forbidden", `${definition.label}所属模块未启用`, request.sourceKey);
  }
  if (!definition.scopeBindings[request.targetType]) {
    throw sourceError("source_forbidden", `${definition.label}不支持当前空间`, request.sourceKey);
  }
  validateRequestLimits(request, definition);
  validateRequestedFields(request, definition);
  const parameterIssues = validateWorkspaceAnalysisSourceParameterValues({
    values: request.parameters,
    sourceDefinition: definition,
    path: ["parameters"],
  });
  if (parameterIssues.length) {
    throw sourceError("source_response_invalid", `${definition.label}参数无效`, request.sourceKey);
  }

  let allowed: boolean;
  try {
    allowed = await Promise.resolve().then(() => input.canExecute({
      requesterId: request.requesterId,
      targetType: request.targetType,
      targetId: request.targetId,
      source: definition,
    }));
  } catch {
    throw sourceError("source_unavailable", `${definition.label}授权服务暂不可用`, request.sourceKey);
  }
  if (!allowed) throw sourceError("source_forbidden", `无权限读取${definition.label}`, request.sourceKey);

  const startedAt = Date.now();
  const controller = linkedAbortController(request.signal);
  const timer = setTimeout(() => controller.abort("timeout"), request.limits.timeoutMs);
  const rows: Array<Readonly<Record<string, WorkspaceAnalysisRuntimeValue>>> = [];
  let totalRows: number | null = null;
  let byteCount = 0;
  let pageCount = 0;
  try {
    while (totalRows === null || rows.length < totalRows) {
      if (pageCount >= request.limits.maxPages) {
        throw sourceError("source_limit_exceeded", `${definition.label}超过登记分页上限`, request.sourceKey);
      }
      const page = await readPage(input.loadPage, {
        registration,
        requesterId: request.requesterId,
        targetType: request.targetType,
        targetId: request.targetId,
        parameters: request.parameters,
        page: pageCount + 1,
        pageSize: request.limits.pageSize,
        signal: controller.signal,
      }, definition);
      pageCount += 1;
      validateRawPage(page, request.limits.pageSize, definition);
      if (totalRows === null) {
        totalRows = page.totalRows;
        if (totalRows > request.limits.maxRows) {
          throw sourceError("source_limit_exceeded", `${definition.label}超过登记行数上限`, request.sourceKey);
        }
      } else if (page.totalRows !== totalRows) {
        throw sourceError("source_response_invalid", `${definition.label}分页总数在运行期间发生变化`, request.sourceKey);
      }
      if (rows.length + page.rows.length > (totalRows ?? 0)) {
        throw sourceError("source_response_invalid", `${definition.label}返回行数超过分页总数`, request.sourceKey);
      }
      const projected = page.rows.map((row) => projectRow(row, request.fields, registration));
      byteCount += serializedByteCount(projected);
      if (byteCount > request.limits.maxBytes) {
        throw sourceError("source_limit_exceeded", `${definition.label}超过登记字节上限`, request.sourceKey);
      }
      rows.push(...projected);
      if (rows.length < (totalRows ?? 0) && page.rows.length < request.limits.pageSize) {
        throw sourceError("source_response_invalid", `${definition.label}未返回完整分页数据`, request.sourceKey);
      }
    }
  } finally {
    clearTimeout(timer);
  }

  if (Date.now() - startedAt > request.limits.timeoutMs) {
    throw sourceError("timeout", `${definition.label}读取超时`, request.sourceKey);
  }
  return {
    sourceKey: request.sourceKey,
    sourceVersion: request.sourceVersion,
    rows,
    pageCount,
    byteCount,
  };
}

function validateRequestLimits(
  request: WorkspaceAnalysisSourceLoadRequest,
  definition: WorkspaceAnalysisSourceDefinition,
) {
  const requested = request.limits;
  const registered = definition.limits;
  const valid = Number.isInteger(requested.maxRows) && requested.maxRows > 0 && requested.maxRows <= registered.maxRows
    && Number.isInteger(requested.maxPages) && requested.maxPages > 0 && requested.maxPages <= registered.maxPages
    && Number.isInteger(requested.maxBytes) && requested.maxBytes > 0 && requested.maxBytes <= registered.maxBytes
    && Number.isInteger(requested.timeoutMs) && requested.timeoutMs > 0 && requested.timeoutMs <= registered.timeoutMs
    && Number.isInteger(requested.pageSize) && requested.pageSize > 0 && requested.pageSize <= registered.maxPageSize
    && Number.isInteger(requested.maxGroups) && requested.maxGroups > 0 && requested.maxGroups <= registered.maxGroups;
  if (!valid) throw sourceError("source_response_invalid", `${definition.label}执行预算无效`, request.sourceKey);
}

function validateRequestedFields(
  request: WorkspaceAnalysisSourceLoadRequest,
  definition: WorkspaceAnalysisSourceDefinition,
) {
  if (new Set(request.fields).size !== request.fields.length) {
    throw sourceError("source_response_invalid", `${definition.label}请求字段重复`, request.sourceKey);
  }
  const definitions = new Map(definition.fields.map((field) => [field.key, field]));
  for (const fieldKey of request.fields) {
    const field = definitions.get(fieldKey);
    if (!field) {
      throw sourceError("source_forbidden", `${definition.label}请求了不可用字段`, request.sourceKey);
    }
  }
}

async function readPage(
  reader: WorkspaceAnalysisRawSourcePageReader,
  request: Parameters<WorkspaceAnalysisRawSourcePageReader>[0],
  definition: WorkspaceAnalysisSourceDefinition,
) {
  const aborted = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(request.signal.reason === "timeout"
      ? sourceError("timeout", `${definition.label}读取超时`, definition.sourceKey)
      : sourceError("cancelled", "经营分析运行已取消", definition.sourceKey));
    if (request.signal.aborted) onAbort();
    else request.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve().then(() => reader(request)), aborted]);
  } catch (cause) {
    if (cause instanceof WorkspaceAnalysisRuntimeError) throw cause;
    throw sourceError("source_unavailable", `${definition.label}暂不可用`, definition.sourceKey);
  }
}

function validateRawPage(
  page: WorkspaceAnalysisRawSourcePage,
  pageSize: number,
  definition: WorkspaceAnalysisSourceDefinition,
) {
  if (!page || typeof page !== "object" || !Array.isArray(page.rows)) {
    throw sourceError("source_response_invalid", `${definition.label}返回内容无效`, definition.sourceKey);
  }
  if (!Number.isInteger(page.totalRows) || page.totalRows < 0) {
    throw sourceError("source_response_invalid", `${definition.label}分页总数无效`, definition.sourceKey);
  }
  if (page.rows.length > pageSize || page.rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw sourceError("source_response_invalid", `${definition.label}单页数据无效`, definition.sourceKey);
  }
}

function projectRow(
  row: unknown,
  fields: readonly string[],
  registration: WorkspaceAnalysisSourceRegistration,
) {
  const definitions = new Map(registration.definition.fields.map((field) => [field.key, field]));
  const result: Record<string, WorkspaceAnalysisRuntimeValue> = {};
  for (const fieldKey of fields) {
    const definition = definitions.get(fieldKey)!;
    const rawValue = readPath(row, registration.adapter.fieldPaths[fieldKey]!);
    const value = definition.kind === "date" && rawValue instanceof Date
      ? rawValue.toISOString()
      : rawValue ?? null;
    if (!isCanonicalValue(value, definition.kind)) {
      throw sourceError(
        "source_response_invalid",
        `${registration.definition.label}字段 ${definition.label} 类型无效`,
        registration.definition.sourceKey,
      );
    }
    result[fieldKey] = value;
  }
  return result;
}

function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, member) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[member];
  }, value);
}

function isCanonicalValue(value: unknown, kind: WorkspaceAnalysisSourceDefinition["fields"][number]["kind"]): value is WorkspaceAnalysisRuntimeValue {
  if (value === null) return true;
  if (kind === "text") return typeof value === "string";
  if (kind === "boolean") return typeof value === "boolean";
  if (kind === "integer") return typeof value === "number" && Number.isInteger(value);
  if (["number", "currency", "percent"].includes(kind)) return typeof value === "number" && Number.isFinite(value);
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function serializedByteCount(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function linkedAbortController(signal: AbortSignal) {
  const controller = new AbortController();
  if (signal.aborted) controller.abort(signal.reason);
  else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  return controller;
}

function sourceError(
  code: ConstructorParameters<typeof WorkspaceAnalysisRuntimeError>[0],
  message: string,
  sourceKey?: string,
) {
  return new WorkspaceAnalysisRuntimeError(code, message, sourceKey);
}
