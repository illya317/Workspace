import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  businessTemporalIdempotencyMatches,
  businessTemporalRequestFingerprint,
} from "@workspace/platform/server/business-temporal-idempotency";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { buildContractRecordAccessWhere, canOwnContractScope } from "./contract-access";
import {
  buildContractLegalSnapshot,
  contractSnapshotProjection,
  mergeContractLegalSnapshot,
} from "./contract-lifecycle-records";
import {
  CONTRACT_INCLUDE,
  dateAtBusinessDay,
  toContractDto,
  type ContractRecord,
} from "./contract-record-projection";
import {
  createConfirmedContractCorrection,
  createConfirmedInitialContractRevision,
  refreshInitialContractDraftRevision,
} from "./contract-revisions";
import {
  validateContractState,
  type ContractTargetCommand,
  type ContractWriteCommand,
} from "./domain/administration-contract-validation";

function validationError(issue: { message: string; status?: number }) {
  return serviceError(issue.message, issue.status || 400);
}

async function contractNumberConflict(contractNo: unknown, excludeId?: number, tx: Prisma.TransactionClient = prisma) {
  if (typeof contractNo !== "string" || !contractNo.trim()) return false;
  return Boolean(await tx.contract.findFirst({
    where: { contractNo: contractNo.trim(), ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  }));
}

async function lockContractNumber(contractNo: unknown, tx: Prisma.TransactionClient) {
  if (typeof contractNo !== "string" || !contractNo.trim()) return;
  await tx.$queryRaw<Array<{ locked: string }>>(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtext(${contractNo.trim()}))::text AS locked
  `);
}

function scopeState(data: Prisma.ContractUncheckedCreateInput | Prisma.ContractUncheckedUpdateInput, current?: ContractRecord) {
  return {
    confidentialityLevel: Number(data.confidentialityLevel ?? current?.confidentialityLevel ?? 2),
    handlerEmployeeId: (data.handlerEmployeeId === undefined ? current?.handlerEmployeeId : data.handlerEmployeeId) as number | null,
    ownerDepartmentId: (data.ownerDepartmentId === undefined ? current?.ownerDepartmentId : data.ownerDepartmentId) as number | null,
  };
}

async function lockContract(id: number, tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    SELECT "id" FROM "Contract" WHERE "id" = ${id} FOR UPDATE
  `);
  return rows.length > 0;
}

function mapWriteError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return serviceError("合同唯一标识冲突，请重试", 409);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return serviceError("合同不存在", 404);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    return serviceError("合同引用的主数据不存在或不可用", 409);
  }
  throw error;
}

export async function commitCreateContractCommand(command: ContractWriteCommand) {
  if (!await canOwnContractScope({ userId: command.userId, ...scopeState(command.data) })) {
    return serviceError("机密合同必须归属于当前经办人或其负责部门；绝密合同仅系统管理员可维护", 403);
  }
  const requestFingerprint = businessTemporalRequestFingerprint({
    aggregate: "Contract",
    commandKind: "direct-create",
    request: { data: command.data },
  });
  const revisionCommandId = `${command.idempotencyKey}:revision`;
  try {
    return await prisma.$transaction(async (tx) => {
      const replay = await tx.contractRevision.findUnique({
        where: { createIdempotencyKey: revisionCommandId },
        select: { contractId: true, createRequestFingerprint: true },
      });
      if (replay) {
        if (!businessTemporalIdempotencyMatches(replay.createRequestFingerprint, requestFingerprint)) {
          return serviceError("内部命令标识已用于不同的合同创建请求", 409);
        }
        const existing = await tx.contract.findUnique({ where: { id: replay.contractId }, include: CONTRACT_INCLUDE });
        return existing
          ? serviceOk({ success: true, record: toContractDto(existing) })
          : serviceError("合同不存在", 404);
      }
      await lockContractNumber(command.data.contractNo, tx);
      if (await contractNumberConflict(command.data.contractNo, undefined, tx)) {
        return serviceError("合同编号已存在", 409);
      }
      const record = await tx.contract.create({
        data: {
          ...command.data as Prisma.ContractUncheckedCreateInput,
          lifecycleStatus: "active",
          signatureStatus: "unknown",
          performanceStatus: "not_started",
          editedBy: command.userId,
          editedAt: new Date(),
        },
        include: CONTRACT_INCLUDE,
      });
      const effectiveOn = dateAtBusinessDay();
      const revision = await createConfirmedInitialContractRevision(tx, {
        contractId: record.id,
        effectiveOn,
        snapshot: buildContractLegalSnapshot(record as unknown as Record<string, unknown>),
        userId: command.userId,
        commandId: revisionCommandId,
        requestFingerprint,
      });
      await tx.contract.update({ where: { id: record.id }, data: { currentRevisionId: revision.id } });
      await snapshotHistory("Contract", record.id, command.userId, tx);
      const created = await tx.contract.findUniqueOrThrow({ where: { id: record.id }, include: CONTRACT_INCLUDE });
      return serviceOk({ success: true, record: toContractDto(created) });
    });
  } catch (error) {
    return mapWriteError(error);
  }
}

export async function commitUpdateContractCommand(command: ContractTargetCommand & ContractWriteCommand) {
  const accessWhere = await buildContractRecordAccessWhere(command.userId);
  const current = await prisma.contract.findFirst({
    where: { AND: [{ id: command.id, isArchived: false }, accessWhere] },
    include: CONTRACT_INCLUDE,
  });
  if (!current) return serviceError("合同不存在", 404);
  const nextState = {
    signedOn: (command.data.signedOn === undefined ? current.signedOn : command.data.signedOn) as Date | null,
    expiresOn: (command.data.expiresOn === undefined ? current.expiresOn : command.data.expiresOn) as Date | null,
  };
  const stateValidation = validateContractState(nextState);
  if (!stateValidation.ok) return validationError(stateValidation.issue);
  if (!await canOwnContractScope({ userId: command.userId, ...scopeState(command.data, current) })) {
    return serviceError("机密合同必须归属于当前经办人或其负责部门；绝密合同仅系统管理员可维护", 403);
  }
  const requestFingerprint = businessTemporalRequestFingerprint({
    aggregate: "Contract",
    commandKind: "direct-correction",
    request: { contractId: command.id, expectedVersion: command.expectedVersion, data: command.data },
  });
  const revisionCommandId = `${command.idempotencyKey}:revision`;
  try {
    return await prisma.$transaction(async (tx) => commitLockedContractUpdate(tx, {
      command,
      accessWhere,
      requestFingerprint,
      revisionCommandId,
    }));
  } catch (error) {
    return mapWriteError(error);
  }
}

async function commitLockedContractUpdate(
  tx: Prisma.TransactionClient,
  input: {
    command: ContractTargetCommand & ContractWriteCommand;
    accessWhere: Prisma.ContractWhereInput;
    requestFingerprint: string;
    revisionCommandId: string;
  },
) {
  const { command, accessWhere, requestFingerprint, revisionCommandId } = input;
  if (!await lockContract(command.id, tx)) return serviceError("合同不存在", 404);
  const locked = await tx.contract.findFirst({
    where: { AND: [{ id: command.id, isArchived: false }, accessWhere] },
    include: CONTRACT_INCLUDE,
  });
  if (!locked) return serviceError("合同不存在", 404);
  const replay = await tx.contractRevision.findUnique({
    where: { createIdempotencyKey: revisionCommandId },
    select: { contractId: true, createRequestFingerprint: true },
  });
  if (replay) {
    return replay.contractId === command.id
      && businessTemporalIdempotencyMatches(replay.createRequestFingerprint, requestFingerprint)
      ? serviceOk({ success: true, record: toContractDto(locked) })
      : serviceError("内部命令标识已用于不同的合同修改请求", 409);
  }
  if (locked.version !== command.expectedVersion) return serviceError("合同已被其他人修改，请刷新后重试", 409);
  const currentSnapshot = buildContractLegalSnapshot(locked as unknown as Record<string, unknown>);
  const nextSnapshot = mergeContractLegalSnapshot(locked as unknown as Record<string, unknown>, command.data);
  if (JSON.stringify(currentSnapshot) === JSON.stringify(nextSnapshot)) {
    return serviceOk({ success: true, record: toContractDto(locked) });
  }
  await lockContractNumber(nextSnapshot.contractNo, tx);
  if (await contractNumberConflict(nextSnapshot.contractNo, command.id, tx)) {
    return serviceError("合同编号已存在", 409);
  }
  if (locked.lifecycleStatus === "draft" && locked.currentRevisionId === null) {
    const initialDraft = await tx.contractRevision.findFirst({
      where: { contractId: command.id, revisionNo: 1, recordState: "draft", changeKind: "initial" },
      select: { id: true },
    });
    if (!initialDraft) return serviceError("合同初始修订草稿不存在", 409);
    await commitDraftContractUpdate(tx, command, nextSnapshot);
  } else {
    const previous = locked.currentRevisionId
      ? await tx.contractRevision.findUnique({ where: { id: locked.currentRevisionId } })
      : null;
    if (!previous || previous.recordState !== "confirmed") return serviceError("合同当前正式修订不存在", 409);
    if (previous.effectiveOn > dateAtBusinessDay()) return serviceError("当前正式修订尚未生效，不能直接纠错", 409);
    await commitFormalContractCorrection(tx, { command, previous, nextSnapshot, requestFingerprint, revisionCommandId });
  }
  await snapshotHistory("Contract", command.id, command.userId, tx);
  const updated = await tx.contract.findUniqueOrThrow({ where: { id: command.id }, include: CONTRACT_INCLUDE });
  return serviceOk({ success: true, record: toContractDto(updated) });
}

async function commitDraftContractUpdate(
  tx: Prisma.TransactionClient,
  command: ContractTargetCommand & ContractWriteCommand,
  nextSnapshot: ReturnType<typeof buildContractLegalSnapshot>,
) {
  await ensureEditHistoryBaseline("Contract", command.id, command.userId, tx);
  await tx.contract.update({
    where: { id: command.id },
    data: {
      ...contractSnapshotProjection(nextSnapshot),
      editedBy: command.userId,
      editedAt: new Date(),
      version: { increment: 1 },
    },
  });
  const draftContract = await tx.contract.findUniqueOrThrow({ where: { id: command.id } });
  await refreshInitialContractDraftRevision(
    tx,
    draftContract as unknown as Record<string, unknown> & { id: number; createdAt: Date; signedOn?: Date | null },
  );
}

async function commitFormalContractCorrection(
  tx: Prisma.TransactionClient,
  input: {
    command: ContractTargetCommand & ContractWriteCommand;
    previous: NonNullable<Awaited<ReturnType<typeof tx.contractRevision.findUnique>>>;
    nextSnapshot: ReturnType<typeof buildContractLegalSnapshot>;
    requestFingerprint: string;
    revisionCommandId: string;
  },
) {
  const { command, previous, nextSnapshot, requestFingerprint, revisionCommandId } = input;
  const effectiveOn = dateAtBusinessDay();
  await ensureEditHistoryBaseline("Contract", command.id, command.userId, tx);
  const revision = await createConfirmedContractCorrection(tx, {
    contractId: command.id,
    previous,
    effectiveOn,
    snapshot: nextSnapshot,
    userId: command.userId,
    commandId: revisionCommandId,
    requestFingerprint,
  });
  await tx.contract.update({
    where: { id: command.id },
    data: {
      ...contractSnapshotProjection(nextSnapshot),
      currentRevisionId: revision.id,
      editedBy: command.userId,
      editedAt: new Date(),
      version: { increment: 1 },
    },
  });
}
