import "server-only";

import type {
  WorkspaceAnalysisRuntimeDTO,
  WorkspaceAnalysisRuntimeSourceMeta,
  WorkspaceAnalysisRuntimeValue,
  WorkspaceAnalysisSourceFieldDefinition,
} from "../workspace-analysis-source-contract";
import type {
  WorkspaceAnalysisExecutionPlan,
  WorkspaceAnalysisExecutionSourcePlan,
} from "./workspace-analysis-execution-plan";
import {
  parseWorkspaceAnalysisDateParts,
  renderWorkspaceAnalysisRuntime,
  type WorkspaceAnalysisCanonicalRow,
} from "./workspace-analysis-runtime-renderer";
import {
  WorkspaceAnalysisRuntimeError,
  type WorkspaceAnalysisRuntimeErrorCode,
} from "./workspace-analysis-runtime-error";
import type {
  WorkspaceAnalysisLoadedSource,
  WorkspaceAnalysisSourceLoadRequest,
  WorkspaceAnalysisSourceLoader,
} from "./workspace-analysis-source-execution-contract";

export { WorkspaceAnalysisRuntimeError } from "./workspace-analysis-runtime-error";
export type { WorkspaceAnalysisRuntimeErrorCode } from "./workspace-analysis-runtime-error";
export type {
  WorkspaceAnalysisLoadedSource,
  WorkspaceAnalysisSourceExecutionLimits,
  WorkspaceAnalysisSourceLoadRequest,
  WorkspaceAnalysisSourceLoader,
} from "./workspace-analysis-source-execution-contract";

type CanonicalRow = WorkspaceAnalysisCanonicalRow;

export type WorkspaceAnalysisRuntimeAudit = {
  readonly status: "succeeded" | "failed";
  readonly requesterId: number;
  readonly targetType: WorkspaceAnalysisExecutionPlan["scope"]["targetType"];
  readonly targetId: number;
  readonly durationMs: number;
  readonly rowCount: number;
  readonly pageCount: number;
  readonly byteCount: number;
  readonly sources: readonly WorkspaceAnalysisRuntimeSourceMeta[];
  readonly errorCode?: WorkspaceAnalysisRuntimeErrorCode;
};

export async function runWorkspaceAnalysisExecutionPlan(input: {
  readonly plan: WorkspaceAnalysisExecutionPlan;
  readonly signal?: AbortSignal;
  readonly onAudit?: (audit: WorkspaceAnalysisRuntimeAudit) => Promise<void> | void;
}): Promise<WorkspaceAnalysisRuntimeDTO> {
  const startedAt = Date.now();
  const sources = new Map<string, CanonicalRow[]>();
  const sourceMeta: WorkspaceAnalysisRuntimeSourceMeta[] = [];
  let rowCount = 0;
  let pageCount = 0;
  let byteCount = 0;

  try {
    for (const source of input.plan.sources) {
      if (input.signal?.aborted) throw runtimeError("cancelled", "经营分析运行已取消");
      const result = await loadSourceRows({
        plan: input.plan,
        source,
        loadSource: input.plan.authorizedSources.loadSource,
        signal: input.signal,
        remaining: {
          rows: input.plan.limits.maxRows - rowCount,
          pages: input.plan.limits.maxPages - pageCount,
          bytes: input.plan.limits.maxBytes - byteCount,
          durationMs: input.plan.limits.timeoutMs - (Date.now() - startedAt),
        },
      });
      sources.set(source.alias, result.rows);
      sourceMeta.push(result.meta);
      rowCount += result.meta.rowCount;
      pageCount += result.meta.pageCount;
      byteCount += result.meta.byteCount;
    }

    const rendered = renderWorkspaceAnalysisRuntime(input.plan, sources);
    const durationMs = Date.now() - startedAt;
    if (durationMs > input.plan.limits.timeoutMs) {
      throw runtimeError("timeout", "经营分析运行超过 12 秒");
    }
    const runtime = {
      schemaVersion: 1,
      layout: input.plan.definition.layout ?? "stack",
      filters: rendered.filters,
      blocks: rendered.blocks,
      execution: { rowCount, pageCount, byteCount, durationMs, sources: sourceMeta },
    } as const satisfies WorkspaceAnalysisRuntimeDTO;
    await recordAudit(input.onAudit, {
      status: "succeeded",
      requesterId: input.plan.requesterId,
      targetType: input.plan.scope.targetType,
      targetId: input.plan.scope.targetId,
      durationMs,
      rowCount,
      pageCount,
      byteCount,
      sources: sourceMeta,
    });
    return runtime;
  } catch (cause) {
    const error = normalizeRuntimeError(cause);
    await recordAudit(input.onAudit, {
      status: "failed",
      requesterId: input.plan.requesterId,
      targetType: input.plan.scope.targetType,
      targetId: input.plan.scope.targetId,
      durationMs: Date.now() - startedAt,
      rowCount,
      pageCount,
      byteCount,
      sources: sourceMeta,
      errorCode: error.code,
    });
    throw error;
  }
}

async function loadSourceRows(input: {
  readonly plan: WorkspaceAnalysisExecutionPlan;
  readonly source: WorkspaceAnalysisExecutionSourcePlan;
  readonly loadSource: WorkspaceAnalysisSourceLoader;
  readonly signal?: AbortSignal;
  readonly remaining: { readonly rows: number; readonly pages: number; readonly bytes: number; readonly durationMs: number };
}) {
  if (input.remaining.rows <= 0 || input.remaining.pages <= 0 || input.remaining.bytes <= 0) {
    throw runtimeError("run_limit_exceeded", "经营分析运行总量已达到上限", input.source.sourceKey);
  }
  if (input.remaining.durationMs <= 0) {
    throw runtimeError("timeout", "经营分析运行超过 12 秒", input.source.sourceKey);
  }

  const startedAt = Date.now();
  const controller = linkedAbortController(input.signal);
  const request = {
    requesterId: input.plan.requesterId,
    targetType: input.plan.scope.targetType,
    targetId: input.plan.scope.targetId,
    ownerUnitId: input.source.ownerUnitId,
    sourceKey: input.source.sourceKey,
    sourceVersion: input.source.sourceVersion,
    parameters: input.source.parameters,
    fields: input.source.fields,
    limits: {
      ...input.source.limits,
      maxRows: Math.min(input.source.limits.maxRows, input.remaining.rows),
      maxPages: Math.min(input.source.limits.maxPages, input.remaining.pages),
      maxBytes: Math.min(input.source.limits.maxBytes, input.remaining.bytes),
      timeoutMs: Math.min(input.source.limits.timeoutMs, input.remaining.durationMs),
    },
    signal: controller.signal,
  } satisfies WorkspaceAnalysisSourceLoadRequest;
  const loaded = await withTimeout(
    Promise.resolve().then(() => input.loadSource(request)),
    request.limits.timeoutMs,
    controller,
    input.source,
  );
  validateLoadedSource(loaded, input.source, input.remaining);
  const rows = loaded.rows.map((row) => projectCanonicalRow(row, input.source));
  if (serializedByteCount(rows) > loaded.byteCount) {
    throw runtimeError(
      "source_response_invalid",
      `${input.source.definition.label}返回的字节计数小于 canonical payload`,
      input.source.sourceKey,
    );
  }

  return {
    rows,
    meta: {
      sourceKey: input.source.sourceKey,
      sourceVersion: input.source.sourceVersion,
      rowCount: rows.length,
      pageCount: loaded.pageCount,
      byteCount: loaded.byteCount,
      durationMs: Date.now() - startedAt,
    } satisfies WorkspaceAnalysisRuntimeSourceMeta,
  };
}

function validateLoadedSource(
  loaded: WorkspaceAnalysisLoadedSource,
  source: WorkspaceAnalysisExecutionSourcePlan,
  remaining: { readonly rows: number; readonly pages: number; readonly bytes: number },
) {
  if (!loaded || typeof loaded !== "object") {
    throw runtimeError("source_response_invalid", `${source.definition.label}返回内容无效`, source.sourceKey);
  }
  if (loaded.sourceKey !== source.sourceKey || loaded.sourceVersion !== source.sourceVersion) {
    throw runtimeError("source_response_invalid", `${source.definition.label}返回了错误的数据源版本`, source.sourceKey);
  }
  if (!Number.isInteger(loaded.pageCount) || loaded.pageCount < 1) {
    throw runtimeError("source_response_invalid", `${source.definition.label}分页数量无效`, source.sourceKey);
  }
  if (!Number.isInteger(loaded.byteCount) || loaded.byteCount < 0) {
    throw runtimeError("source_response_invalid", `${source.definition.label}响应字节数无效`, source.sourceKey);
  }
  if (!Array.isArray(loaded.rows)) {
    throw runtimeError("source_response_invalid", `${source.definition.label}返回行无效`, source.sourceKey);
  }
  if (loaded.rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw runtimeError("source_response_invalid", `${source.definition.label}返回了无效数据行`, source.sourceKey);
  }
  if (loaded.rows.length > source.limits.maxRows) {
    throw runtimeError("source_limit_exceeded", `${source.definition.label}超过登记行数上限`, source.sourceKey);
  }
  if (loaded.pageCount > source.limits.maxPages) {
    throw runtimeError("source_limit_exceeded", `${source.definition.label}超过登记分页上限`, source.sourceKey);
  }
  if (loaded.byteCount > source.limits.maxBytes) {
    throw runtimeError("source_limit_exceeded", `${source.definition.label}超过登记字节上限`, source.sourceKey);
  }
  if (loaded.rows.length > remaining.rows) {
    throw runtimeError("run_limit_exceeded", "经营分析运行超过 10,000 行", source.sourceKey);
  }
  if (loaded.pageCount > remaining.pages) {
    throw runtimeError("run_limit_exceeded", "经营分析运行超过 40 页", source.sourceKey);
  }
  if (loaded.byteCount > remaining.bytes) {
    throw runtimeError("run_limit_exceeded", "经营分析运行超过 10 MiB 输入上限", source.sourceKey);
  }
}

function projectCanonicalRow(
  row: Readonly<Record<string, unknown>>,
  source: WorkspaceAnalysisExecutionSourcePlan,
): CanonicalRow {
  const definitions = new Map(source.definition.fields.map((field) => [field.key, field]));
  const projected: Record<string, WorkspaceAnalysisRuntimeValue> = {};
  for (const fieldKey of source.fields) {
    const field = definitions.get(fieldKey);
    if (!field) throw runtimeError("source_response_invalid", `${source.definition.label}字段定义失效`, source.sourceKey);
    const value = row[fieldKey] ?? null;
    if (!isRuntimeValueForField(value, field)) {
      throw runtimeError("source_response_invalid", `${source.definition.label}字段 ${field.label} 类型无效`, source.sourceKey);
    }
    projected[fieldKey] = value;
  }
  return projected;
}

function isRuntimeValueForField(value: unknown, field: WorkspaceAnalysisSourceFieldDefinition): value is WorkspaceAnalysisRuntimeValue {
  if (value === null) return true;
  if (field.kind === "text") return typeof value === "string";
  if (field.kind === "boolean") return typeof value === "boolean";
  if (field.kind === "integer") return typeof value === "number" && Number.isInteger(value);
  if (["number", "currency", "percent"].includes(field.kind)) return typeof value === "number" && Number.isFinite(value);
  return typeof value === "string" && Boolean(parseWorkspaceAnalysisDateParts(value));
}

function linkedAbortController(signal?: AbortSignal) {
  const controller = new AbortController();
  if (signal?.aborted) controller.abort(signal.reason);
  else signal?.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  return controller;
}

function serializedByteCount(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  controller: AbortController,
  source: WorkspaceAnalysisExecutionSourcePlan,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    const rejectForAbort = () => reject(controller.signal.reason === "timeout"
      ? runtimeError("timeout", `${source.definition.label}读取超时`, source.sourceKey)
      : runtimeError("cancelled", "经营分析运行已取消", source.sourceKey));
    if (controller.signal.aborted) rejectForAbort();
    else controller.signal.addEventListener("abort", rejectForAbort, { once: true });
    timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  });
  try {
    return await Promise.race([promise, aborted]);
  } catch (cause) {
    if (cause instanceof WorkspaceAnalysisRuntimeError) throw cause;
    if (controller.signal.aborted && controller.signal.reason !== "timeout") {
      throw runtimeError("cancelled", "经营分析运行已取消", source.sourceKey);
    }
    throw runtimeError("source_unavailable", `${source.definition.label}暂不可用`, source.sourceKey);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function runtimeError(code: WorkspaceAnalysisRuntimeErrorCode, message: string, sourceKey?: string) {
  return new WorkspaceAnalysisRuntimeError(code, message, sourceKey);
}

function normalizeRuntimeError(cause: unknown) {
  return cause instanceof WorkspaceAnalysisRuntimeError
    ? cause
    : runtimeError("source_unavailable", "经营分析数据源暂不可用");
}

async function recordAudit(
  recorder: ((audit: WorkspaceAnalysisRuntimeAudit) => Promise<void> | void) | undefined,
  audit: WorkspaceAnalysisRuntimeAudit,
) {
  if (!recorder) return;
  try {
    await recorder(audit);
  } catch {
    // Audit sinks must not expose payloads or turn a successful read into a failed response.
  }
}
