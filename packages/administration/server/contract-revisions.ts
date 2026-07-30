import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import {
  businessTemporalIdempotencyMatches,
  businessTemporalRequestFingerprint,
} from "@workspace/platform/server/business-temporal-idempotency";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { buildContractRecordAccessWhere, canOwnContractScope } from "./contract-access";
import {
  buildContractLegalSnapshot,
  CONTRACT_LEGAL_SNAPSHOT_SCHEMA_VERSION,
  contractMutationResult,
  contractSnapshotProjection,
  contractTimelineWithClient,
  isoContractDate,
  lifecycleContractNumberConflict,
  lockContractLifecycle,
  lockContractLifecycleNumber,
  mapContractLifecycleWriteError,
  mergeContractLegalSnapshot,
  parseContractLegalSnapshot,
} from "./contract-lifecycle-records";
import {
  assertDirectContractRevisionInput,
  assertInitialContractRevisionInput,
  type ContractRevisionCreateCommand,
  type ContractRevisionPublishCommand,
} from "./domain/contract-lifecycle-validation";
import { previousBusinessDate } from "./domain/contract-lifecycle-policy";

export async function createInitialContractDraftRevision(
  tx: Prisma.TransactionClient,
  contract: Record<string, unknown> & { id: number; createdAt: Date; signedOn?: Date | null },
  userId: number,
) {
  assertInitialContractRevisionInput(contract);
  return tx.contractRevision.create({
    data: {
      contractId: contract.id,
      revisionNo: 1,
      recordState: "draft",
      changeKind: "initial",
      snapshotSchemaVersion: CONTRACT_LEGAL_SNAPSHOT_SCHEMA_VERSION,
      effectiveOn: contract.signedOn ?? contract.createdAt,
      snapshotJson: buildContractLegalSnapshot(contract) as unknown as Prisma.InputJsonObject,
      reason: "initial draft",
      createdBy: userId,
    },
  });
}

export async function refreshInitialContractDraftRevision(
  tx: Prisma.TransactionClient,
  contract: Record<string, unknown> & { id: number; createdAt: Date; signedOn?: Date | null },
) {
  assertInitialContractRevisionInput(contract);
  const revision = await tx.contractRevision.findFirst({
    where: { contractId: contract.id, revisionNo: 1, recordState: "draft", changeKind: "initial" },
    select: { id: true },
  });
  if (!revision) return false;
  await tx.contractRevision.update({
    where: { id: revision.id },
    data: {
      effectiveOn: contract.signedOn ?? contract.createdAt,
      snapshotSchemaVersion: CONTRACT_LEGAL_SNAPSHOT_SCHEMA_VERSION,
      snapshotJson: buildContractLegalSnapshot(contract) as unknown as Prisma.InputJsonObject,
    },
  });
  return true;
}

export async function createConfirmedInitialContractRevision(
  tx: Prisma.TransactionClient,
  input: {
    contractId: number;
    effectiveOn: Date;
    snapshot: ReturnType<typeof buildContractLegalSnapshot>;
    userId: number;
    commandId: string;
    requestFingerprint: string;
  },
) {
  assertDirectContractRevisionInput(input);
  const revision = await tx.contractRevision.create({
    data: {
      contractId: input.contractId,
      revisionNo: 1,
      recordState: "confirmed",
      changeKind: "initial",
      snapshotSchemaVersion: CONTRACT_LEGAL_SNAPSHOT_SCHEMA_VERSION,
      effectiveOn: input.effectiveOn,
      snapshotJson: input.snapshot as unknown as Prisma.InputJsonObject,
      reason: "创建合同并记录初始版本",
      createdBy: input.userId,
      confirmedBy: input.userId,
      confirmedAt: new Date(),
      createIdempotencyKey: input.commandId,
      createRequestFingerprint: input.requestFingerprint,
      publishIdempotencyKey: `${input.commandId}:confirm`,
      publishRequestFingerprint: input.requestFingerprint,
    },
  });
  await tx.contractStateEvent.createMany({
    data: [
      directBaselineStateEvent(input, revision.id, "lifecycle", "active"),
      directBaselineStateEvent(input, revision.id, "signature", "unknown"),
      directBaselineStateEvent(input, revision.id, "performance", "not_started"),
    ],
  });
  return revision;
}

export async function createConfirmedContractCorrection(
  tx: Prisma.TransactionClient,
  input: {
    contractId: number;
    previous: { id: number; effectiveOn: Date; effectiveThrough: Date | null };
    effectiveOn: Date;
    snapshot: ReturnType<typeof buildContractLegalSnapshot>;
    userId: number;
    commandId: string;
    requestFingerprint: string;
  },
) {
  assertDirectContractRevisionInput(input);
  const maxRevision = await tx.contractRevision.aggregate({
    where: { contractId: input.contractId },
    _max: { revisionNo: true },
  });
  const revision = await tx.contractRevision.create({
    data: {
      contractId: input.contractId,
      revisionNo: (maxRevision._max.revisionNo ?? 0) + 1,
      recordState: "confirmed",
      changeKind: "correction",
      snapshotSchemaVersion: CONTRACT_LEGAL_SNAPSHOT_SCHEMA_VERSION,
      effectiveOn: input.effectiveOn,
      effectiveThrough: input.previous.effectiveThrough,
      snapshotJson: input.snapshot as unknown as Prisma.InputJsonObject,
      reason: "直接编辑合同并记录当前修订",
      sourceRevisionId: input.previous.id,
      createdBy: input.userId,
      confirmedBy: input.userId,
      confirmedAt: new Date(),
      createIdempotencyKey: input.commandId,
      createRequestFingerprint: input.requestFingerprint,
      publishIdempotencyKey: `${input.commandId}:confirm`,
      publishRequestFingerprint: input.requestFingerprint,
    },
  });
  const effectiveThrough = input.previous.effectiveOn < input.effectiveOn
    ? previousBusinessDate(isoContractDate(input.effectiveOn)!)
    : null;
  await tx.contractRevision.update({
    where: { id: input.previous.id },
    data: {
      recordState: "superseded",
      effectiveThrough: effectiveThrough
        ? new Date(`${effectiveThrough}T00:00:00.000Z`)
        : input.previous.effectiveThrough,
      supersededByRevisionId: revision.id,
    },
  });
  return revision;
}

function directBaselineStateEvent(
  input: { contractId: number; effectiveOn: Date; userId: number },
  sourceRevisionId: number,
  axis: string,
  toState: string,
) {
  return {
    contractId: input.contractId,
    axis,
    eventKind: "baseline",
    fromState: null,
    toState,
    effectiveOn: input.effectiveOn,
    reason: "创建合同并记录初始版本",
    sourceRevisionId,
    createdBy: input.userId,
  };
}

export async function commitCreateContractRevision(command: ContractRevisionCreateCommand) {
  const accessWhere = await buildContractRecordAccessWhere(command.userId);
  const requestFingerprint = businessTemporalRequestFingerprint({
    aggregate: "Contract",
    commandKind: "create-revision",
    request: {
      contractId: command.contractId,
      expectedVersion: command.expectedVersion,
      effectiveOn: command.effectiveOn,
      reason: command.reason ?? null,
      data: command.data,
    },
  });
  try {
    return await prisma.$transaction(async (tx) => {
      if (!await lockContractLifecycle(command.contractId, tx)) return serviceError("合同不存在", 404);
      const current = await tx.contract.findFirst({ where: { AND: [{ id: command.contractId, isArchived: false }, accessWhere] } });
      if (!current) return serviceError("合同不存在", 404);
      const replay = await tx.contractRevision.findUnique({ where: { createIdempotencyKey: command.idempotencyKey } });
      if (replay) {
        if (
          replay.contractId !== command.contractId
          || !businessTemporalIdempotencyMatches(replay.createRequestFingerprint, requestFingerprint)
        ) return serviceError("幂等键已被不同的合同修订命令使用", 409);
        return serviceOk({ success: true, idempotent: true, timeline: await contractTimelineWithClient(tx, command.contractId) });
      }
      if (current.version !== command.expectedVersion) return serviceError("合同已被其他人修改，请刷新后重试", 409);
      if (current.lifecycleStatus === "draft") return serviceError("草稿合同请直接保存并发布初始修订", 409);
      const currentRevision = current.currentRevisionId
        ? await tx.contractRevision.findUnique({ where: { id: current.currentRevisionId }, select: { effectiveOn: true } })
        : null;
      if (!currentRevision) return serviceError("合同当前正式修订不存在", 409);
      if (command.effectiveOn <= currentRevision.effectiveOn) return serviceError("修订生效日必须晚于当前正式修订", 409);
      const snapshot = mergeContractLegalSnapshot(current as unknown as Record<string, unknown>, command.data);
      if (!await canOwnContractScope({
        userId: command.userId,
        confidentialityLevel: snapshot.confidentialityLevel,
        handlerEmployeeId: snapshot.handlerEmployeeId,
        ownerDepartmentId: snapshot.ownerDepartmentId,
      })) return serviceError("机密合同必须归属于当前经办人或其负责部门；绝密合同仅系统管理员可维护", 403);
      const duplicate = await tx.contractRevision.findFirst({
        where: { contractId: command.contractId, recordState: "draft", effectiveOn: command.effectiveOn },
        select: { id: true },
      });
      if (duplicate) return serviceError("同一生效日已有修订草稿", 409);
      const maxRevision = await tx.contractRevision.aggregate({ where: { contractId: command.contractId }, _max: { revisionNo: true } });
      await tx.contractRevision.create({
        data: {
          contractId: command.contractId,
          revisionNo: (maxRevision._max.revisionNo ?? 0) + 1,
          recordState: "draft",
          changeKind: "revision",
          snapshotSchemaVersion: CONTRACT_LEGAL_SNAPSHOT_SCHEMA_VERSION,
          effectiveOn: command.effectiveOn,
          snapshotJson: snapshot as unknown as Prisma.InputJsonObject,
          reason: command.reason,
          sourceRevisionId: current.currentRevisionId,
          createIdempotencyKey: command.idempotencyKey,
          createRequestFingerprint: requestFingerprint,
          createdBy: command.userId,
        },
      });
      return serviceOk({ success: true, timeline: await contractTimelineWithClient(tx, command.contractId) });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    return mapContractLifecycleWriteError(error);
  }
}

export async function commitPublishContractRevision(command: ContractRevisionPublishCommand) {
  const accessWhere = await buildContractRecordAccessWhere(command.userId);
  const requestFingerprint = businessTemporalRequestFingerprint({
    aggregate: "Contract",
    commandKind: "publish-revision",
    request: {
      contractId: command.contractId,
      revisionId: command.revisionId,
      expectedVersion: command.expectedVersion,
      reason: command.reason ?? null,
    },
  });
  try {
    return await prisma.$transaction(async (tx) => {
      if (!await lockContractLifecycle(command.contractId, tx)) return serviceError("合同不存在", 404);
      const current = await tx.contract.findFirst({ where: { AND: [{ id: command.contractId, isArchived: false }, accessWhere] } });
      if (!current) return serviceError("合同不存在", 404);
      const revision = await tx.contractRevision.findFirst({ where: { id: command.revisionId, contractId: command.contractId } });
      if (!revision) return serviceError("待发布修订不存在", 404);
      if (revision.publishIdempotencyKey === command.idempotencyKey) {
        if (!businessTemporalIdempotencyMatches(revision.publishRequestFingerprint, requestFingerprint)) {
          return serviceError("幂等键已被不同的合同发布命令使用", 409);
        }
        return serviceOk({
          success: true,
          idempotent: true,
          record: contractMutationResult(current),
          timeline: await contractTimelineWithClient(tx, current.id),
        });
      }
      if (current.version !== command.expectedVersion) return serviceError("合同已被其他人修改，请刷新后重试", 409);
      if (revision.recordState !== "draft") return serviceError("待发布修订不存在", 404);
      const effectiveOn = isoContractDate(revision.effectiveOn)!;
      if (effectiveOn > workspaceBusinessDate(new Date())) return serviceError("未来修订尚未到生效日", 409);
      const previous = current.currentRevisionId ? await tx.contractRevision.findUnique({ where: { id: current.currentRevisionId } }) : null;
      if (previous && revision.effectiveOn <= previous.effectiveOn) return serviceError("修订生效日必须晚于当前正式修订", 409);
      const snapshot = parseContractLegalSnapshot(revision.snapshotJson);
      if (!snapshot) return serviceError("修订快照无效", 409);
      if (!await canOwnContractScope({
        userId: command.userId,
        confidentialityLevel: snapshot.confidentialityLevel,
        handlerEmployeeId: snapshot.handlerEmployeeId,
        ownerDepartmentId: snapshot.ownerDepartmentId,
      })) return serviceError("机密合同必须归属于当前经办人或其负责部门；绝密合同仅系统管理员可维护", 403);
      await lockContractLifecycleNumber(snapshot.contractNo, tx);
      if (await lifecycleContractNumberConflict(snapshot.contractNo, current.id, tx)) return serviceError("合同编号已存在", 409);
      if (previous) {
        const effectiveThrough = previousBusinessDate(effectiveOn);
        if (!effectiveThrough) return serviceError("修订生效日无效", 409);
        await tx.contractRevision.update({
          where: { id: previous.id },
          data: { recordState: "superseded", effectiveThrough: new Date(`${effectiveThrough}T00:00:00.000Z`), supersededByRevisionId: revision.id },
        });
      }
      const confirmedAt = new Date();
      await tx.contractRevision.update({
        where: { id: revision.id },
        data: {
          recordState: "confirmed",
          confirmedBy: command.userId,
          confirmedAt,
          reason: command.reason ?? revision.reason,
          publishIdempotencyKey: command.idempotencyKey,
          publishRequestFingerprint: requestFingerprint,
        },
      });
      const initialPublication = current.lifecycleStatus === "draft" && current.currentRevisionId === null;
      if (initialPublication) {
        const initialReason = command.reason ?? revision.reason ?? "发布初始修订";
        await tx.contractStateEvent.createMany({
          data: [{
            contractId: current.id,
            axis: "lifecycle",
            eventKind: "transition",
            fromState: "draft",
            toState: "active",
            effectiveOn: revision.effectiveOn,
            reason: initialReason,
            sourceRevisionId: revision.id,
            createdBy: command.userId,
          }, {
            contractId: current.id,
            axis: "signature",
            eventKind: "baseline",
            fromState: null,
            toState: current.signatureStatus,
            effectiveOn: revision.effectiveOn,
            reason: initialReason,
            sourceRevisionId: revision.id,
            createdBy: command.userId,
          }, {
            contractId: current.id,
            axis: "performance",
            eventKind: "baseline",
            fromState: null,
            toState: current.performanceStatus,
            effectiveOn: revision.effectiveOn,
            reason: initialReason,
            sourceRevisionId: revision.id,
            createdBy: command.userId,
          }],
        });
      }
      await ensureEditHistoryBaseline("Contract", current.id, command.userId, tx);
      const updated = await tx.contract.update({
        where: { id: current.id },
        data: {
          ...contractSnapshotProjection(snapshot),
          currentRevisionId: revision.id,
          ...(initialPublication ? { lifecycleStatus: "active" } : {}),
          editedBy: command.userId,
          editedAt: confirmedAt,
          version: { increment: 1 },
        },
        select: { version: true, currentRevisionId: true, lifecycleStatus: true, signatureStatus: true, performanceStatus: true },
      });
      await snapshotHistory("Contract", current.id, command.userId, tx);
      return serviceOk({ success: true, record: contractMutationResult(updated), timeline: await contractTimelineWithClient(tx, current.id) });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    return mapContractLifecycleWriteError(error);
  }
}
