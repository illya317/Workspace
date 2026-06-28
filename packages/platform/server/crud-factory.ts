import { NextResponse } from "next/server";
import { authenticate } from "./auth";
import { ensureEditHistoryBaseline, snapshotHistory } from "./history";
import {
  guardedDelete,
  parsePositiveId,
  type DeleteGuardContext,
  type DeleteMode,
  type DeleteReferenceGuard,
} from "./delete-guard";
import { disabledApiResponseForRequest } from "./module-runtime";
import { prisma } from "./prisma";
import { jsonErrorResponse } from "./api";

type PrismaModelKey = keyof typeof prisma;
export type AccessChecker = (userId: number) => Promise<boolean>;
type BeforeUpdateResult = { field: string; value: unknown } | { error: string; status?: number };
type BeforeDeleteResult = { ok: true } | { error: string; status?: number };
type CrudBuildError = { error: string; status?: number };
type CrudBuildResult = Record<string, unknown> | CrudBuildError | null;
type CrudBuildData = (
  body: Record<string, unknown>,
) => Promise<CrudBuildResult> | CrudBuildResult;

export interface CrudFactoryConfig {
  entityType: string;
  modelKey: PrismaModelKey;
  accessCheck?: AccessChecker;
  writeCheck?: AccessChecker;
  deleteCheck?: AccessChecker;
  allowedFields?: string[];
  deleteMode?: DeleteMode;
  deleteActionLabel?: string;
  deleteReferences?: DeleteReferenceGuard[];
  getDeleteExpectedVersion?: (request: Request) => number | undefined;
  skipDeleteVersionCheck?: boolean;
  deleteReferencePolicy?: "checked" | "none";
  onBeforeDeleteScope?: (context: DeleteGuardContext) => Promise<BeforeDeleteResult | null> | BeforeDeleteResult | null;
  onBeforeUpdate?: (field: string, value: unknown, id?: number) => Promise<BeforeUpdateResult | null>;
  onBeforeDelete?: (id: number, context: DeleteGuardContext) => Promise<BeforeDeleteResult | null>;
}

export type DomainCrudConfig = Omit<CrudFactoryConfig, "accessCheck" | "writeCheck" | "deleteCheck">;

export interface DomainCrudAccessChecks {
  accessCheck: AccessChecker;
  writeCheck: AccessChecker;
  deleteCheck: AccessChecker;
}

function pickWriteCheck(config: CrudFactoryConfig, fallback: AccessChecker): AccessChecker {
  return config.writeCheck || config.accessCheck || fallback;
}

function pickDeleteCheck(config: CrudFactoryConfig, fallback: AccessChecker): AccessChecker {
  return config.deleteCheck || config.accessCheck || fallback;
}

function parseDeleteExpectedVersion(request: Request) {
  const ifMatch = request.headers.get("if-match")?.replace(/^W\//, "").replace(/^"|"$/g, "");
  const headerVersion = request.headers.get("x-record-version") ?? ifMatch;
  const queryVersion = new URL(request.url).searchParams.get("version");
  const raw = headerVersion ?? queryVersion;
  if (raw === null || raw === undefined || raw === "") return undefined;
  const version = Number(raw);
  return Number.isInteger(version) && version >= 0 ? version : undefined;
}

function isCrudBuildError(result: CrudBuildResult): result is CrudBuildError {
  return Boolean(result && typeof result === "object" && typeof (result as { error?: unknown }).error === "string");
}

export function createCrudHandlers(config: CrudFactoryConfig, fallbackAccess?: AccessChecker) {
  const writeCheck = pickWriteCheck(config, fallbackAccess || (async () => false));
  const deleteCheck = pickDeleteCheck(config, fallbackAccess || (async () => false));

  return {
    async handleUpdateField(request: Request, params: Promise<{ id: string }>) {
      const disabledResponse = disabledApiResponseForRequest(request);
      if (disabledResponse) return disabledResponse;

      const payload = await authenticate(request);
      if (!payload) return jsonErrorResponse("未登录", 401);
      if (!(await writeCheck(payload.userId))) return jsonErrorResponse("无权限", 403);

      const { id } = await params;
      const recordId = parseInt(id);
      const body = (await request.json()) as { field: string; value: unknown };
      let { field, value } = body;

      if (config.onBeforeUpdate) {
        const result = await config.onBeforeUpdate(field, value, recordId);
        if (!result) return jsonErrorResponse("非法字段", 400);
        if ("error" in result) {
          return jsonErrorResponse(result.error, result.status || 400);
        }
        field = result.field;
        value = result.value;
      }

      const allowed = config.allowedFields || [];
      if (!allowed.includes(field)) return jsonErrorResponse("非法字段", 400);

      await prisma.$transaction(async (tx) => {
        const txModel = (tx as unknown as Record<string, unknown>)[String(config.modelKey)] as {
          update: (args: { where: { id: number }; data: Record<string, unknown> }) => Promise<unknown>;
        };
        await ensureEditHistoryBaseline(config.entityType, recordId, payload.userId, tx);
        await txModel.update({
          where: { id: recordId },
          data: { [field]: value ?? null, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
        });
        await snapshotHistory(config.entityType, recordId, payload.userId, tx);
      });

      return NextResponse.json({ success: true });
    },

    async handleDelete(request: Request, params: Promise<{ id: string }>) {
      const disabledResponse = disabledApiResponseForRequest(request);
      if (disabledResponse) return disabledResponse;

      const payload = await authenticate(request);
      if (!payload) return jsonErrorResponse("未登录", 401);
      if (!(await deleteCheck(payload.userId))) return jsonErrorResponse("无权限", 403);

      const { id } = await params;
      const parsedId = parsePositiveId(id);
      if (!parsedId.ok) return jsonErrorResponse(parsedId.error, parsedId.status || 400);

      const result = await guardedDelete({
        entityType: config.entityType,
        modelKey: config.modelKey,
        id: parsedId.id,
        userId: payload.userId,
        actionLabel: config.deleteActionLabel,
        deleteMode: config.deleteMode,
        expectedVersion: config.getDeleteExpectedVersion?.(request) ?? parseDeleteExpectedVersion(request),
        skipVersionCheck: config.skipDeleteVersionCheck,
        references: config.deleteReferences,
        referencePolicy: config.deleteReferencePolicy,
        onBeforeDelete: config.onBeforeDelete,
        scopeGuard: config.onBeforeDeleteScope,
      });
      if (!result.ok) return jsonErrorResponse(result.error, result.status || 400);

      return NextResponse.json({ success: true });
    },

    async handleCreate(
      request: Request,
      buildData?: CrudBuildData,
    ) {
      const disabledResponse = disabledApiResponseForRequest(request);
      if (disabledResponse) return disabledResponse;

      const payload = await authenticate(request);
      if (!payload) return jsonErrorResponse("未登录", 401);
      if (!(await writeCheck(payload.userId))) return jsonErrorResponse("无权限", 403);

      const body = (await request.json()) as Record<string, unknown>;
      const data = buildData ? await buildData(body) : body;
      if (!data) return jsonErrorResponse("数据校验失败", 400);
      if (buildData && isCrudBuildError(data)) return jsonErrorResponse(data.error, data.status || 400);

      const model = prisma[config.modelKey] as unknown as {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: number }>;
      };
      const record = await model.create({ data: { ...data, editedBy: payload.userId } });
      await snapshotHistory(config.entityType, record.id, payload.userId);

      return NextResponse.json({ success: true, record });
    },
  };
}

export function createDomainCrudFacade(accessChecks: DomainCrudAccessChecks) {
  function wrap(config: DomainCrudConfig) {
    return createCrudHandlers({ ...config, ...accessChecks });
  }

  return {
    handleUpdateField(request: Request, params: Promise<{ id: string }>, config: DomainCrudConfig) {
      return wrap(config).handleUpdateField(request, params);
    },

    handleDelete(request: Request, params: Promise<{ id: string }>, config: DomainCrudConfig) {
      return wrap(config).handleDelete(request, params);
    },

    handleCreate(request: Request, config: DomainCrudConfig, buildData?: CrudBuildData) {
      return wrap(config).handleCreate(request, buildData);
    },
  };
}
