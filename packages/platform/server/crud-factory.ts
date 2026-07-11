import { serviceError, serviceOk, type ServiceResult } from "./api";
import { ensureEditHistoryBaseline, snapshotHistory } from "./history";
import {
  guardedDelete,
  parsePositiveId,
  type DeleteGuardContext,
  type DeleteMode,
  type DeleteReferenceGuard,
} from "./delete-guard";
import { prisma } from "./prisma";

type PrismaModelKey = keyof typeof prisma;
export type AccessChecker = (userId: number) => Promise<boolean>;
type BeforeUpdateResult = { field: string; value: unknown } | { error: string; status?: number };
type BeforeDeleteResult = { ok: true } | { error: string; status?: number };
type CrudBuildError = { error: string; status?: number };
type CrudBuildResult = Record<string, unknown> | CrudBuildError | null;
type CrudBuildData = (
  body: Record<string, unknown>,
) => Promise<CrudBuildResult> | CrudBuildResult;

export interface CrudCreateCommand {
  userId: number;
  body: Record<string, unknown>;
}

export interface CrudUpdateFieldCommand {
  userId: number;
  id: number;
  field: string;
  value: unknown;
}

export interface CrudDeleteCommand {
  userId: number;
  id: number;
  expectedVersion?: number;
}

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

function isCrudBuildError(result: CrudBuildResult): result is CrudBuildError {
  return Boolean(result && typeof result === "object" && typeof (result as { error?: unknown }).error === "string");
}

export function createCrudExecutor(config: CrudFactoryConfig, fallbackAccess?: AccessChecker) {
  const writeCheck = pickWriteCheck(config, fallbackAccess || (async () => false));
  const deleteCheck = pickDeleteCheck(config, fallbackAccess || (async () => false));

  return {
    async executeUpdateField(command: CrudUpdateFieldCommand): Promise<ServiceResult<{ success: true }>> {
      if (!(await writeCheck(command.userId))) return serviceError("无权限", 403);
      const parsedId = parsePositiveId(command.id, "记录ID");
      if (!parsedId.ok) return serviceError(parsedId.error, parsedId.status || 400);

      let { field, value } = command;
      if (config.onBeforeUpdate) {
        const result = await config.onBeforeUpdate(field, value, parsedId.id);
        if (!result) return serviceError("非法字段", 400);
        if ("error" in result) return serviceError(result.error, result.status || 400);
        field = result.field;
        value = result.value;
      }

      const allowed = config.allowedFields || [];
      if (!allowed.includes(field)) return serviceError("非法字段", 400);

      await prisma.$transaction(async (tx) => {
        const txModel = (tx as unknown as Record<string, unknown>)[String(config.modelKey)] as {
          update: (args: { where: { id: number }; data: Record<string, unknown> }) => Promise<unknown>;
        };
        await ensureEditHistoryBaseline(config.entityType, parsedId.id, command.userId, tx);
        await txModel.update({
          where: { id: parsedId.id },
          data: { [field]: value ?? null, editedBy: command.userId, editedAt: new Date(), version: { increment: 1 } },
        });
        await snapshotHistory(config.entityType, parsedId.id, command.userId, tx);
      });

      return serviceOk({ success: true });
    },

    async executeDelete(command: CrudDeleteCommand): Promise<ServiceResult<{ success: true; id: number }>> {
      if (!(await deleteCheck(command.userId))) return serviceError("无权限", 403);
      const parsedId = parsePositiveId(command.id);
      if (!parsedId.ok) return serviceError(parsedId.error, parsedId.status || 400);

      const result = await guardedDelete({
        entityType: config.entityType,
        modelKey: config.modelKey,
        id: parsedId.id,
        userId: command.userId,
        actionLabel: config.deleteActionLabel,
        deleteMode: config.deleteMode,
        expectedVersion: command.expectedVersion,
        skipVersionCheck: config.skipDeleteVersionCheck,
        references: config.deleteReferences,
        referencePolicy: config.deleteReferencePolicy,
        onBeforeDelete: config.onBeforeDelete,
        scopeGuard: config.onBeforeDeleteScope,
      });
      if (!result.ok) return serviceError(result.error, result.status || 400);
      return serviceOk(result.data);
    },

    async executeCreate(
      command: CrudCreateCommand,
      buildData?: CrudBuildData,
    ): Promise<ServiceResult<{ success: true; record: { id: number } }>> {
      if (!(await writeCheck(command.userId))) return serviceError("无权限", 403);
      const data = buildData ? await buildData(command.body) : command.body;
      if (!data) return serviceError("数据校验失败", 400);
      if (buildData && isCrudBuildError(data)) return serviceError(data.error, data.status || 400);

      const model = prisma[config.modelKey] as unknown as {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: number }>;
      };
      const record = await model.create({ data: { ...data, editedBy: command.userId } });
      await snapshotHistory(config.entityType, record.id, command.userId);
      return serviceOk({ success: true, record });
    },
  };
}

export function createDomainCrudFacade(accessChecks: DomainCrudAccessChecks) {
  function wrap(config: DomainCrudConfig) {
    return createCrudExecutor({ ...config, ...accessChecks });
  }

  return {
    executeUpdateField(command: CrudUpdateFieldCommand, config: DomainCrudConfig) {
      return wrap(config).executeUpdateField(command);
    },

    executeDelete(command: CrudDeleteCommand, config: DomainCrudConfig) {
      return wrap(config).executeDelete(command);
    },

    executeCreate(command: CrudCreateCommand, config: DomainCrudConfig, buildData?: CrudBuildData) {
      return wrap(config).executeCreate(command, buildData);
    },
  };
}
