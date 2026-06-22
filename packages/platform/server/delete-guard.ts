import { Prisma, prisma } from "./prisma";
import { snapshotHistory } from "./history";
import type { FkTargetPolicy } from "./fk-registry";

type PrismaModelKey = keyof typeof prisma;
type PrismaTx = Prisma.TransactionClient;
type RecordData = Record<string, unknown>;

type ModelDelegate = {
  findUnique: (args: { where: { id: number } }) => Promise<RecordData | null>;
  delete: (args: { where: { id: number } }) => Promise<unknown>;
  update?: (args: { where: { id: number }; data: RecordData }) => Promise<unknown>;
};

export type DeleteMode = "hard" | "soft" | "archive" | "deactivate" | "forbidden";

export type DeleteGuardResult =
  | { ok: true; data: { success: true; id: number } }
  | { ok: false; error: string; status?: number };

export type ParsePositiveIdResult = { ok: true; id: number } | { ok: false; error: string; status?: number };

export interface DeleteGuardContext {
  id: number;
  userId: number;
  record: RecordData;
  tx: PrismaTx;
}

export type DeleteGuardHookResult = { ok: true } | { error: string; status?: number };

export interface DeleteReferenceGuard {
  label: string;
  count: (tx: PrismaTx) => Promise<number>;
  policy?: FkTargetPolicy;
  cleanup?: (tx: PrismaTx) => Promise<void>;
}

export interface GuardedDeleteInput {
  entityType: string;
  modelKey: PrismaModelKey;
  id: number;
  userId: number;
  actionLabel?: string;
  deleteMode?: DeleteMode;
  expectedVersion?: number;
  skipVersionCheck?: boolean;
  references?: DeleteReferenceGuard[];
  referencePolicy?: "checked" | "none";
  onBeforeDelete?: (
    id: number,
    context: DeleteGuardContext,
  ) => Promise<DeleteGuardHookResult | null> | DeleteGuardHookResult | null;
  scopeGuard?: (
    context: DeleteGuardContext,
  ) => Promise<DeleteGuardHookResult | null> | DeleteGuardHookResult | null;
}

const PROTECTED_STATUS_VALUES = new Set([
  "locked",
  "submitted",
  "archived",
  "closed",
  "approved",
  "已锁定",
  "已提交",
  "已归档",
  "已关闭",
  "已审批",
  "已审批通过",
]);

export function parsePositiveId(value: unknown, label = "ID"): ParsePositiveIdResult {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: `${label} 无效`, status: 400 };
  }
  return { ok: true, id };
}

function blockedByLifecycle(record: RecordData, actionLabel: string): DeleteGuardResult | null {
  const blockedFields = [
    ["deletedAt", "已删除"],
    ["isArchived", "已归档"],
    ["lockedAt", "已锁定"],
    ["submittedAt", "已提交"],
    ["approvedAt", "已审批通过"],
  ] as const;

  for (const [field, label] of blockedFields) {
    if (field in record && record[field]) {
      return { ok: false, error: `不能${actionLabel}，目标记录${label}`, status: 409 };
    }
  }

  if ("status" in record && PROTECTED_STATUS_VALUES.has(String(record.status ?? "").trim())) {
    return { ok: false, error: `不能${actionLabel}，目标记录状态不允许删除`, status: 409 };
  }

  return null;
}

function assertDeleteModeFields(record: RecordData, mode: DeleteMode, actionLabel: string): DeleteGuardResult | null {
  if (mode === "soft" && !("deletedAt" in record)) {
    return { ok: false, error: `不能${actionLabel}，目标未定义软删字段 deletedAt`, status: 500 };
  }
  if (mode === "archive" && !("isArchived" in record)) {
    return { ok: false, error: `不能${actionLabel}，目标未定义归档字段 isArchived`, status: 500 };
  }
  if (mode === "deactivate" && !("isActive" in record)) {
    return { ok: false, error: `不能${actionLabel}，目标未定义停用字段 isActive`, status: 500 };
  }
  return null;
}

function assertDeleteContract(input: GuardedDeleteInput, mode: DeleteMode, actionLabel: string): DeleteGuardResult | null {
  if (!input.deleteMode) {
    return { ok: false, error: `不能${actionLabel}，删除方式未声明`, status: 500 };
  }
  if (mode === "hard" && !input.onBeforeDelete && !input.references?.length && input.referencePolicy !== "none") {
    return { ok: false, error: `不能${actionLabel}，硬删必须声明引用保护或显式无引用`, status: 500 };
  }
  return null;
}

function assertVersionGuard(input: GuardedDeleteInput, record: RecordData): DeleteGuardResult | null {
  if (!("version" in record) || input.skipVersionCheck) return null;
  if (input.expectedVersion === undefined) {
    return { ok: false, error: "删除缺少版本号，请刷新后重试", status: 409 };
  }
  if (record.version !== input.expectedVersion) {
    return { ok: false, error: "目标记录已被其他人修改，请刷新后重试", status: 409 };
  }
  return null;
}

function auditUpdateData(record: RecordData, userId: number) {
  const data: RecordData = {};
  if ("editedBy" in record) data.editedBy = userId;
  if ("editedAt" in record) data.editedAt = new Date();
  if ("version" in record) data.version = { increment: 1 };
  return data;
}

async function guardReferences(
  references: DeleteReferenceGuard[] | undefined,
  tx: PrismaTx,
  actionLabel: string,
): Promise<DeleteGuardResult | null> {
  for (const reference of references ?? []) {
    const count = await reference.count(tx);
    if (count <= 0) continue;

    const policy = reference.policy ?? "block";
    if (policy === "block") {
      return { ok: false, error: `不能${actionLabel}，${reference.label}仍有 ${count} 条引用`, status: 409 };
    }
    if (!reference.cleanup) {
      return {
        ok: false,
        error: `不能${actionLabel}，${reference.label}声明为 ${policy} 但未实现引用清理`,
        status: 500,
      };
    }
  }
  return null;
}

async function cleanupReferences(references: DeleteReferenceGuard[] | undefined, tx: PrismaTx) {
  for (const reference of references ?? []) {
    if ((reference.policy ?? "block") !== "block") {
      const count = await reference.count(tx);
      if (count > 0) await reference.cleanup?.(tx);
    }
  }
}

async function applyDelete(
  model: ModelDelegate,
  input: GuardedDeleteInput,
  record: RecordData,
) {
  const mode = input.deleteMode ?? "hard";
  const now = new Date();

  if (mode === "hard") {
    await model.delete({ where: { id: input.id } });
    return;
  }

  const update = model.update;
  if (!update) throw new Error(`Model ${String(input.modelKey)} does not support guarded update delete`);

  if (mode === "soft") {
    await update({
      where: { id: input.id },
      data: { ...auditUpdateData(record, input.userId), deletedAt: now },
    });
  } else if (mode === "archive") {
    await update({
      where: { id: input.id },
      data: { ...auditUpdateData(record, input.userId), isArchived: true, archivedAt: now },
    });
  } else if (mode === "deactivate") {
    await update({
      where: { id: input.id },
      data: { ...auditUpdateData(record, input.userId), isActive: false },
    });
  }
}

export async function guardedDelete(input: GuardedDeleteInput): Promise<DeleteGuardResult> {
  const actionLabel = input.actionLabel ?? `删除${input.entityType}`;
  const mode = input.deleteMode ?? "forbidden";
  if (mode === "forbidden") return { ok: false, error: `不能${actionLabel}，该对象禁止删除`, status: 405 };
  const contractBlock = assertDeleteContract(input, mode, actionLabel);
  if (contractBlock) return contractBlock;

  try {
    return await prisma.$transaction(async (tx) => {
      const model = (tx as unknown as Record<string, unknown>)[String(input.modelKey)] as ModelDelegate;
      const record = await model.findUnique({ where: { id: input.id } });
      if (!record) return { ok: false, error: "目标记录不存在", status: 404 };

      const context = { id: input.id, userId: input.userId, record, tx };
      const versionBlock = assertVersionGuard(input, record);
      if (versionBlock) return versionBlock;

      const lifecycleBlock = blockedByLifecycle(record, actionLabel);
      if (lifecycleBlock) return lifecycleBlock;
      const modeBlock = assertDeleteModeFields(record, mode, actionLabel);
      if (modeBlock) return modeBlock;

      const scopeResult = await input.scopeGuard?.(context);
      if (scopeResult && "error" in scopeResult) return { ok: false, error: scopeResult.error, status: scopeResult.status };

      if (input.onBeforeDelete) {
        const beforeDelete = await input.onBeforeDelete(input.id, context);
        if (!beforeDelete) return { ok: false, error: "删除校验失败", status: 400 };
        if ("error" in beforeDelete) return { ok: false, error: beforeDelete.error, status: beforeDelete.status };
      }

      const referenceBlock = await guardReferences(input.references, tx, actionLabel);
      if (referenceBlock) return referenceBlock;

      await snapshotHistory(input.entityType, input.id, input.userId, tx);
      await cleanupReferences(input.references, tx);
      await applyDelete(model, input, record);

      return { ok: true, data: { success: true, id: input.id } };
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { ok: false, error: "目标记录不存在", status: 404 };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return { ok: false, error: `不能${actionLabel}，目标记录仍被引用`, status: 409 };
    }
    throw error;
  }
}
