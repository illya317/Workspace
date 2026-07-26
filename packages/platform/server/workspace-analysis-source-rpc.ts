import "server-only";

import { z } from "zod";

import { workspaceAnalysisSourceDefinitionSchema } from "../workspace-analysis-definition-schema";
import type {
  WorkspaceAnalysisSourceDefinition,
  WorkspaceAnalysisSourceScopeType,
} from "../workspace-analysis-source-contract";
import { serviceError } from "./api";
import { createInternalApiRoute } from "./api-route";
import { getSessionUserFromAuthPayload } from "./auth";
import {
  callWorkspaceInternalJson,
  isWorkspaceInternalRequestAuthorized,
  WorkspaceInternalRpcError,
} from "./internal-unit-rpc";
import type {
  WorkspaceAnalysisSourceDirectoryContext,
  WorkspaceAnalysisSourceProvider,
} from "./workspace-analysis-source-directory";
import { validateWorkspaceAnalysisUnitId } from "./workspace-analysis-source-directory";
import { isWorkspaceAnalysisSourceRuntimeEnabled } from "./workspace-analysis-source-enabled";
import { validateWorkspaceAnalysisSourceDefinition } from "./workspace-analysis-source-registry";
import { workspaceAnalysisSourceBelongsToUnit } from "./workspace-analysis-source-owner";
import {
  WorkspaceAnalysisRuntimeError,
  type WorkspaceAnalysisLoadedSource,
  type WorkspaceAnalysisSourceLoadRequest,
  type WorkspaceAnalysisSourceLoader,
} from "./workspace-analysis-runtime";

const CATALOG_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
const EXECUTION_ROWS_MAX_BYTES = 10 * 1024 * 1024;
const EXECUTION_RESPONSE_ENVELOPE_BYTES = 64 * 1024;
const targetTypeSchema = z.enum(["personal", "department", "project"]);
const catalogRequestSchema = z.object({
  schemaVersion: z.literal(1),
  operation: z.literal("catalog"),
  requesterId: z.number().int().positive(),
  targetType: targetTypeSchema,
  targetId: z.number().int().positive(),
}).strict();
const memberKeySchema = z.string().min(1).max(60).regex(/^[a-z][a-zA-Z0-9]*$/);
const parameterValueSchema = z.union([z.string().max(300), z.number().finite(), z.boolean()]);
const executionLimitsSchema = z.object({
  maxRows: z.number().int().min(1).max(10_000),
  maxGroups: z.number().int().min(1).max(1_000),
  pageSize: z.number().int().min(1).max(500),
  maxPages: z.number().int().min(1).max(40),
  maxBytes: z.number().int().min(1).max(10 * 1024 * 1024),
  timeoutMs: z.number().int().min(1).max(12_000),
}).strict();
const executeRequestSchema = z.object({
  schemaVersion: z.literal(1),
  operation: z.literal("execute"),
  requesterId: z.number().int().positive(),
  targetType: targetTypeSchema,
  targetId: z.number().int().positive(),
  sourceKey: z.string().min(3).max(120).regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/),
  sourceVersion: z.number().int().positive().max(1_000_000),
  parameters: z.record(memberKeySchema, parameterValueSchema).superRefine((value, context) => {
    if (Object.keys(value).length > 20) context.addIssue({ code: "custom", message: "too many parameters" });
  }),
  fields: z.array(memberKeySchema).max(200).superRefine((fields, context) => {
    if (new Set(fields).size !== fields.length) context.addIssue({ code: "custom", message: "duplicate fields" });
  }),
  limits: executionLimitsSchema,
}).strict();
const rpcRequestSchema = z.discriminatedUnion("operation", [catalogRequestSchema, executeRequestSchema]);
const rpcResponseSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("workspace-analysis-source-catalog"),
  ownerUnitId: z.string().regex(/^[a-z][a-z0-9-]*$/),
  targetType: targetTypeSchema,
  targetId: z.number().int().positive(),
  sources: z.array(workspaceAnalysisSourceDefinitionSchema).max(100),
}).strict();
const runtimeValueSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const canonicalRowSchema = z.record(memberKeySchema, runtimeValueSchema).superRefine((row, context) => {
  if (Object.keys(row).length > 200) context.addIssue({ code: "custom", message: "too many fields" });
});
const executeResponseSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("workspace-analysis-source-result"),
  ownerUnitId: z.string().regex(/^[a-z][a-z0-9-]*$/),
  targetType: targetTypeSchema,
  targetId: z.number().int().positive(),
  sourceKey: z.string().min(3).max(120),
  sourceVersion: z.number().int().positive(),
  rows: z.array(canonicalRowSchema).max(10_000),
  pageCount: z.number().int().min(1).max(40),
  byteCount: z.number().int().min(0).max(10 * 1024 * 1024),
}).strict();

type WorkspaceAnalysisSourceRpcResponse = z.infer<typeof rpcResponseSchema>;

export function createWorkspaceAnalysisSourceRpcHandler(config: {
  readonly ownerUnitId: string;
  readonly allowedCallerUnitIds: readonly string[];
  readonly sourceCatalog: { list(): readonly WorkspaceAnalysisSourceDefinition[] };
  readonly canDiscover: (context: WorkspaceAnalysisSourceDirectoryContext & {
    readonly source: WorkspaceAnalysisSourceDefinition;
  }) => Promise<boolean> | boolean;
  readonly executeSource?: WorkspaceAnalysisSourceLoader;
  readonly requesterExists?: (requesterId: number) => Promise<boolean>;
}) {
  validateWorkspaceAnalysisUnitId(config.ownerUnitId);
  if (!config.allowedCallerUnitIds.length) throw new Error("经营分析 RPC 必须声明调用方白名单");
  config.allowedCallerUnitIds.forEach(validateWorkspaceAnalysisUnitId);

  return createInternalApiRoute({
    authorize: async ({ request }) => isWorkspaceInternalRequestAuthorized(
      request,
      await request.clone().text(),
      {
        allowedCallerUnitIds: config.allowedCallerUnitIds,
        audienceUnitId: config.ownerUnitId,
      },
    ),
    authorizeError: "Internal service authentication failed",
    handler: async ({ request }) => {
      const body = rpcRequestSchema.safeParse(await request.json().catch(() => null));
      if (!body.success) return serviceError("Invalid workspace analysis source request", 400);
      const requesterExists = config.requesterExists
        ? await config.requesterExists(body.data.requesterId)
        : Boolean(await getSessionUserFromAuthPayload({
            userId: body.data.requesterId,
            wxUserId: "",
            departmentId: 0,
          }));
      if (!requesterExists) return serviceError("Workspace analysis requester is unavailable", 403);

      if (body.data.operation === "execute") {
        if (!config.executeSource) return serviceError("Workspace analysis source execution is unavailable", 503);
        const executionRequest = body.data;
        const source = config.sourceCatalog.list().find((candidate) => (
          candidate.sourceKey === executionRequest.sourceKey
          && candidate.version === executionRequest.sourceVersion
        ));
        if (source && !isWorkspaceAnalysisSourceRuntimeEnabled(source)) {
          return serviceError("Workspace analysis source is disabled", 403);
        }
        try {
          const result = await config.executeSource({
            requesterId: body.data.requesterId,
            targetType: body.data.targetType,
            targetId: body.data.targetId,
            ownerUnitId: config.ownerUnitId,
            sourceKey: body.data.sourceKey,
            sourceVersion: body.data.sourceVersion,
            parameters: body.data.parameters,
            fields: body.data.fields,
            limits: body.data.limits,
            signal: request.signal,
          });
          if (
            result.sourceKey !== body.data.sourceKey
            || result.sourceVersion !== body.data.sourceVersion
            || !hasExactRequestedFields(result.rows, body.data.fields)
          ) {
            return serviceError("Workspace analysis source returned an invalid result", 502);
          }
          const response = {
            schemaVersion: 1,
            kind: "workspace-analysis-source-result",
            ownerUnitId: config.ownerUnitId,
            targetType: body.data.targetType,
            targetId: body.data.targetId,
            sourceKey: result.sourceKey,
            sourceVersion: result.sourceVersion,
            rows: result.rows.map((row) => ({ ...row })),
            pageCount: result.pageCount,
            byteCount: result.byteCount,
          } as const;
          const checked = executeResponseSchema.safeParse(response);
          return checked.success
            ? checked.data
            : serviceError("Workspace analysis source returned an invalid result", 502);
        } catch (cause) {
          return mapExecutionError(cause);
        }
      }

      const context = {
        requesterId: body.data.requesterId,
        targetType: body.data.targetType,
        targetId: body.data.targetId,
      } satisfies WorkspaceAnalysisSourceDirectoryContext;
      let candidates: readonly WorkspaceAnalysisSourceDefinition[];
      try {
        const registered = config.sourceCatalog.list();
        registered.forEach((source) => {
          validateWorkspaceAnalysisSourceDefinition(source);
          if (!workspaceAnalysisSourceBelongsToUnit(source.ownerModuleKey, config.ownerUnitId)) {
            throw new Error("source owner mismatch");
          }
        });
        candidates = registered.filter((source) => (
          source.scopeBindings[context.targetType]
          && isWorkspaceAnalysisSourceRuntimeEnabled(source)
        ));
      } catch {
        return serviceError("Workspace analysis source catalog is invalid", 500);
      }
      let decisions: readonly boolean[];
      try {
        decisions = await Promise.all(candidates.map((source) => (
          Promise.resolve().then(() => config.canDiscover({ ...context, source }))
        )));
      } catch {
        return serviceError("Workspace analysis source authorization is unavailable", 503);
      }
      const sources = candidates.filter((_source, index) => decisions[index] === true);
      return {
        schemaVersion: 1,
        kind: "workspace-analysis-source-catalog",
        ownerUnitId: config.ownerUnitId,
        targetType: context.targetType,
        targetId: context.targetId,
        sources,
      } satisfies WorkspaceAnalysisSourceRpcResponse;
    },
  });
}

export function createRemoteWorkspaceAnalysisSourceProvider(input: {
  readonly callerUnitId: string;
  readonly ownerUnitId: string;
  readonly apiModulePathSegment?: string;
  readonly supportedTargetTypes?: readonly WorkspaceAnalysisSourceScopeType[];
  readonly timeoutMs?: number;
}): WorkspaceAnalysisSourceProvider {
  validateWorkspaceAnalysisUnitId(input.ownerUnitId);
  validateWorkspaceAnalysisUnitId(input.callerUnitId);
  return {
    ownerUnitId: input.ownerUnitId,
    supportedTargetTypes: input.supportedTargetTypes,
    timeoutMs: input.timeoutMs,
    listAvailableSources: (context, signal) => loadRemoteWorkspaceAnalysisSources({ ...input, ...context, signal }),
    loadSource: (request) => loadRemoteWorkspaceAnalysisSource({
      ownerUnitId: input.ownerUnitId,
      callerUnitId: input.callerUnitId,
      apiModulePathSegment: input.apiModulePathSegment,
      request,
    }),
  };
}

export async function loadRemoteWorkspaceAnalysisSources(input: {
  readonly callerUnitId: string;
  readonly ownerUnitId: string;
  readonly apiModulePathSegment?: string;
  readonly requesterId: number;
  readonly targetType: WorkspaceAnalysisSourceScopeType;
  readonly targetId: number;
  readonly signal?: AbortSignal;
}) {
  validateWorkspaceAnalysisUnitId(input.ownerUnitId);
  validateWorkspaceAnalysisUnitId(input.callerUnitId);
  const apiModulePathSegment = resolveApiModulePathSegment(input.ownerUnitId, input.apiModulePathSegment);
  const raw = await callWorkspaceInternalJson<unknown>({
    callerUnitId: input.callerUnitId,
    path: `/api/modules/${apiModulePathSegment}/internal/workspace-analysis-sources`,
    targetUnitId: input.ownerUnitId,
    maxResponseBytes: CATALOG_RESPONSE_MAX_BYTES,
    body: {
      schemaVersion: 1,
      operation: "catalog",
      requesterId: input.requesterId,
      targetType: input.targetType,
      targetId: input.targetId,
    },
    signal: input.signal,
  });
  const parsed = rpcResponseSchema.safeParse(raw);
  if (!parsed.success
    || parsed.data.ownerUnitId !== input.ownerUnitId
    || parsed.data.targetType !== input.targetType
    || parsed.data.targetId !== input.targetId) {
    throw new Error(`${input.ownerUnitId} returned an invalid workspace analysis source catalog`);
  }
  try {
    for (const source of parsed.data.sources) {
      validateWorkspaceAnalysisSourceDefinition(source);
      if (!workspaceAnalysisSourceBelongsToUnit(source.ownerModuleKey, input.ownerUnitId)
        || !source.scopeBindings[input.targetType]) {
        throw new Error("owner or scope mismatch");
      }
    }
  } catch {
    throw new Error(`${input.ownerUnitId} returned an invalid workspace analysis source catalog`);
  }
  return parsed.data.sources;
}

export async function loadRemoteWorkspaceAnalysisSource(input: {
  readonly callerUnitId: string;
  readonly ownerUnitId: string;
  readonly apiModulePathSegment?: string;
  readonly request: WorkspaceAnalysisSourceLoadRequest;
}): Promise<WorkspaceAnalysisLoadedSource> {
  validateWorkspaceAnalysisUnitId(input.ownerUnitId);
  validateWorkspaceAnalysisUnitId(input.callerUnitId);
  const apiModulePathSegment = resolveApiModulePathSegment(input.ownerUnitId, input.apiModulePathSegment);
  if (input.request.ownerUnitId !== input.ownerUnitId) {
    throw new WorkspaceAnalysisRuntimeError("source_response_invalid", "经营分析数据源 owner 不匹配", input.request.sourceKey);
  }
  let raw: unknown;
  try {
    raw = await callWorkspaceInternalJson<unknown>({
      callerUnitId: input.callerUnitId,
      path: `/api/modules/${apiModulePathSegment}/internal/workspace-analysis-sources`,
      targetUnitId: input.ownerUnitId,
      maxResponseBytes: executionResponseMaxBytes(input.request.limits.maxBytes),
      body: {
        schemaVersion: 1,
        operation: "execute",
        requesterId: input.request.requesterId,
        targetType: input.request.targetType,
        targetId: input.request.targetId,
        sourceKey: input.request.sourceKey,
        sourceVersion: input.request.sourceVersion,
        parameters: input.request.parameters,
        fields: input.request.fields,
        limits: input.request.limits,
      },
      signal: input.request.signal,
    });
  } catch (cause) {
    if (cause instanceof WorkspaceInternalRpcError) {
      if (cause.status === 403) throw new WorkspaceAnalysisRuntimeError("source_forbidden", "无权限读取远端经营分析数据源", input.request.sourceKey);
      if (cause.status === 413) throw new WorkspaceAnalysisRuntimeError("source_limit_exceeded", "远端经营分析数据源超过运行上限", input.request.sourceKey);
      if (cause.status === 504) throw new WorkspaceAnalysisRuntimeError("timeout", "远端经营分析数据源读取超时", input.request.sourceKey);
      if (cause.status === 502) throw new WorkspaceAnalysisRuntimeError("source_response_invalid", "远端经营分析数据源契约异常", input.request.sourceKey);
    }
    throw new WorkspaceAnalysisRuntimeError("source_unavailable", "远端经营分析数据源暂不可用", input.request.sourceKey);
  }
  const parsed = executeResponseSchema.safeParse(raw);
  if (!parsed.success
    || parsed.data.ownerUnitId !== input.ownerUnitId
    || parsed.data.targetType !== input.request.targetType
    || parsed.data.targetId !== input.request.targetId
    || parsed.data.sourceKey !== input.request.sourceKey
    || parsed.data.sourceVersion !== input.request.sourceVersion
    || !hasExactRequestedFields(parsed.data.rows, input.request.fields)) {
    throw new WorkspaceAnalysisRuntimeError("source_response_invalid", "远端经营分析数据源返回内容无效", input.request.sourceKey);
  }
  return {
    sourceKey: parsed.data.sourceKey,
    sourceVersion: parsed.data.sourceVersion,
    rows: parsed.data.rows,
    pageCount: parsed.data.pageCount,
    byteCount: parsed.data.byteCount,
  };
}

function executionResponseMaxBytes(requestedRowsBytes: number) {
  const boundedRowsBytes = Number.isSafeInteger(requestedRowsBytes) && requestedRowsBytes > 0
    ? Math.min(requestedRowsBytes, EXECUTION_ROWS_MAX_BYTES)
    : 1;
  return boundedRowsBytes + EXECUTION_RESPONSE_ENVELOPE_BYTES;
}

function resolveApiModulePathSegment(ownerUnitId: string, value: string | undefined) {
  const segment = value ?? ownerUnitId;
  if (!/^[a-z][a-zA-Z0-9-]*$/.test(segment)) {
    throw new Error(`经营分析 API 模块路径无效: ${segment}`);
  }
  return segment;
}

function hasExactRequestedFields(
  rows: readonly Readonly<Record<string, unknown>>[],
  requestedFields: readonly string[],
) {
  const expected = new Set(requestedFields);
  return rows.every((row) => {
    const keys = Object.keys(row);
    return keys.length === expected.size && keys.every((key) => expected.has(key));
  });
}

function mapExecutionError(cause: unknown) {
  if (!(cause instanceof WorkspaceAnalysisRuntimeError)) {
    return serviceError("Workspace analysis source execution is unavailable", 503);
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
