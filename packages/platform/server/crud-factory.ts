import { NextResponse } from "next/server";
import { authenticate } from "./auth";
import { snapshotHistory } from "./history";
import { disabledApiResponseForRequest } from "./module-runtime";
import { prisma } from "./prisma";

type PrismaModelKey = keyof typeof prisma;
export type AccessChecker = (userId: number) => Promise<boolean>;
type BeforeUpdateResult = { field: string; value: unknown } | { error: string; status?: number };
type BeforeDeleteResult = { ok: true } | { error: string; status?: number };
type CrudBuildData = (
  body: Record<string, unknown>,
) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null;

export interface CrudFactoryConfig {
  entityType: string;
  modelKey: PrismaModelKey;
  accessCheck?: AccessChecker;
  writeCheck?: AccessChecker;
  deleteCheck?: AccessChecker;
  allowedFields?: string[];
  onBeforeUpdate?: (field: string, value: unknown, id?: number) => Promise<BeforeUpdateResult | null>;
  onBeforeDelete?: (id: number) => Promise<BeforeDeleteResult | null>;
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

export function createCrudHandlers(config: CrudFactoryConfig, fallbackAccess?: AccessChecker) {
  const writeCheck = pickWriteCheck(config, fallbackAccess || (async () => false));
  const deleteCheck = pickDeleteCheck(config, fallbackAccess || (async () => false));

  return {
    async handleUpdateField(request: Request, params: Promise<{ id: string }>) {
      const disabledResponse = disabledApiResponseForRequest(request);
      if (disabledResponse) return disabledResponse;

      const payload = await authenticate(request);
      if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
      if (!(await writeCheck(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

      const { id } = await params;
      const recordId = parseInt(id);
      const body = (await request.json()) as { field: string; value: unknown };
      let { field, value } = body;

      if (config.onBeforeUpdate) {
        const result = await config.onBeforeUpdate(field, value, recordId);
        if (!result) return NextResponse.json({ error: "非法字段" }, { status: 400 });
        if ("error" in result) {
          return NextResponse.json({ error: result.error }, { status: result.status || 400 });
        }
        field = result.field;
        value = result.value;
      }

      const allowed = config.allowedFields || [];
      if (!allowed.includes(field)) return NextResponse.json({ error: "非法字段" }, { status: 400 });

      const model = prisma[config.modelKey] as unknown as {
        update: (args: { where: { id: number }; data: Record<string, unknown> }) => Promise<unknown>;
      };
      await model.update({
        where: { id: recordId },
        data: { [field]: value ?? null, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
      });
      await snapshotHistory(config.entityType, recordId, payload.userId);

      return NextResponse.json({ success: true });
    },

    async handleDelete(request: Request, params: Promise<{ id: string }>) {
      const disabledResponse = disabledApiResponseForRequest(request);
      if (disabledResponse) return disabledResponse;

      const payload = await authenticate(request);
      if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
      if (!(await deleteCheck(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

      const { id } = await params;
      const recordId = parseInt(id);
      if (config.onBeforeDelete) {
        const result = await config.onBeforeDelete(recordId);
        if (!result) return NextResponse.json({ error: "删除校验失败" }, { status: 400 });
        if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status || 400 });
      }
      await snapshotHistory(config.entityType, recordId, payload.userId);

      const model = prisma[config.modelKey] as unknown as { delete: (args: { where: { id: number } }) => Promise<unknown> };
      await model.delete({ where: { id: recordId } });

      return NextResponse.json({ success: true });
    },

    async handleCreate(
      request: Request,
      buildData?: (
        body: Record<string, unknown>,
      ) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null,
    ) {
      const disabledResponse = disabledApiResponseForRequest(request);
      if (disabledResponse) return disabledResponse;

      const payload = await authenticate(request);
      if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
      if (!(await writeCheck(payload.userId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

      const body = (await request.json()) as Record<string, unknown>;
      const data = buildData ? await buildData(body) : body;
      if (!data) return NextResponse.json({ error: "数据校验失败" }, { status: 400 });

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
