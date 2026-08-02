import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import {
  businessTemporalIdempotencyMatches,
  businessTemporalRequestFingerprint,
} from "@workspace/platform/server/business-temporal-idempotency";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { buildContractRecordAccessWhere } from "./contract-access";
import {
  contractMutationResult,
  contractTimelineWithClient,
  lockContractLifecycle,
  mapContractLifecycleWriteError,
} from "./contract-lifecycle-records";
import type {
  ContractStateReverseCommand,
  ContractStateTransitionCommand,
} from "./domain/contract-lifecycle-validation";
import {
  contractStateProjection,
  contractStateValue,
  validateContractStateTransition,
} from "./domain/contract-lifecycle-policy";
import type { ContractStateAxis } from "@workspace/administration/types";

export async function commitContractStateTransition(command: ContractStateTransitionCommand) {
  const accessWhere = await buildContractRecordAccessWhere(command.userId);
  const requestFingerprint = businessTemporalRequestFingerprint({
    aggregate: "Contract",
    commandKind: "state-transition",
    request: {
      contractId: command.contractId,
      expectedVersion: command.expectedVersion,
      axis: command.axis,
      toState: command.toState,
      effectiveOn: command.effectiveOn,
      reason: command.reason ?? null,
    },
  });
  try {
    return await prisma.$transaction(async (tx) => {
      if (!await lockContractLifecycle(command.contractId, tx)) return serviceError("合同不存在", 404);
      const current = await tx.contract.findFirst({ where: { AND: [{ id: command.contractId, isArchived: false }, accessWhere] } });
      if (!current) return serviceError("合同不存在", 404);
      const replay = await tx.contractStateEvent.findUnique({ where: { idempotencyKey: command.idempotencyKey } });
      if (replay) {
        if (
          replay.contractId !== command.contractId
          || !businessTemporalIdempotencyMatches(replay.requestFingerprint, requestFingerprint)
        ) return serviceError("幂等键已被不同的合同状态命令使用", 409);
        return serviceOk({ success: true, idempotent: true, record: contractMutationResult(current), timeline: await contractTimelineWithClient(tx, current.id) });
      }
      if (current.version !== command.expectedVersion) return serviceError("合同已被其他人修改，请刷新后重试", 409);
      if (!current.currentRevisionId) return serviceError("合同尚未发布正式修订", 409);
      const fromState = contractStateValue(current, command.axis);
      const transition = validateContractStateTransition(command.axis, fromState, command.toState);
      if (!transition.ok) return serviceError(transition.error, 409);
      const latest = await tx.contractStateEvent.findFirst({
        where: { contractId: current.id, axis: command.axis, recordState: "confirmed" },
        orderBy: [{ effectiveOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        select: { effectiveOn: true },
      });
      if (latest && command.effectiveOn <= latest.effectiveOn) {
        return serviceError("状态变更生效日必须晚于该状态轴的最后事件", 409);
      }
      await tx.contractStateEvent.create({
        data: {
          contractId: current.id,
          axis: command.axis,
          eventKind: "transition",
          fromState,
          toState: command.toState,
          effectiveOn: command.effectiveOn,
          reason: command.reason,
          sourceRevisionId: current.currentRevisionId,
          idempotencyKey: command.idempotencyKey,
          requestFingerprint,
          createdBy: command.userId,
        },
      });
      await ensureEditHistoryBaseline("Contract", current.id, command.userId, tx);
      const updated = await tx.contract.update({
        where: { id: current.id },
        data: { ...contractStateProjection(command.axis, command.toState), editedBy: command.userId, editedAt: new Date(), version: { increment: 1 } },
        select: { version: true, currentRevisionId: true, lifecycleStatus: true, signatureStatus: true, performanceStatus: true },
      });
      await snapshotHistory("Contract", current.id, command.userId, tx);
      return serviceOk({ success: true, record: contractMutationResult(updated), timeline: await contractTimelineWithClient(tx, current.id) });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    return mapContractLifecycleWriteError(error);
  }
}

export async function commitReverseContractStateEvent(command: ContractStateReverseCommand) {
  const accessWhere = await buildContractRecordAccessWhere(command.userId);
  const requestFingerprint = businessTemporalRequestFingerprint({
    aggregate: "Contract",
    commandKind: "state-reversal",
    request: {
      contractId: command.contractId,
      eventId: command.eventId,
      expectedVersion: command.expectedVersion,
      reason: command.reason ?? null,
    },
  });
  try {
    return await prisma.$transaction(async (tx) => {
      if (!await lockContractLifecycle(command.contractId, tx)) return serviceError("合同不存在", 404);
      const current = await tx.contract.findFirst({ where: { AND: [{ id: command.contractId, isArchived: false }, accessWhere] } });
      if (!current) return serviceError("合同不存在", 404);
      const replay = await tx.contractStateEvent.findUnique({ where: { idempotencyKey: command.idempotencyKey } });
      if (replay) {
        if (
          replay.contractId !== command.contractId
          || !businessTemporalIdempotencyMatches(replay.requestFingerprint, requestFingerprint)
        ) return serviceError("幂等键已被不同的合同状态命令使用", 409);
        return serviceOk({ success: true, idempotent: true, record: contractMutationResult(current), timeline: await contractTimelineWithClient(tx, current.id) });
      }
      if (current.version !== command.expectedVersion) return serviceError("合同已被其他人修改，请刷新后重试", 409);
      const event = await tx.contractStateEvent.findFirst({
        where: { id: command.eventId, contractId: command.contractId, recordState: "confirmed", eventKind: "transition" },
      });
      if (!event || !event.fromState) return serviceError("可冲销状态事件不存在", 404);
      const latest = await tx.contractStateEvent.findFirst({
        where: { contractId: command.contractId, axis: event.axis, recordState: "confirmed" },
        orderBy: [{ effectiveOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });
      if (latest?.id !== event.id) return serviceError("只能冲销该状态轴的最后一个事件", 409);
      const axis = event.axis as ContractStateAxis;
      if (contractStateValue(current, axis) !== event.toState) return serviceError("合同状态投影与事件不一致，请先修复数据", 409);
      const reversal = await tx.contractStateEvent.create({
        data: {
          contractId: current.id,
          axis,
          eventKind: "reversal",
          fromState: event.toState,
          toState: event.fromState,
          effectiveOn: new Date(`${workspaceBusinessDate(new Date())}T00:00:00.000Z`),
          reason: command.reason,
          sourceRevisionId: current.currentRevisionId,
          reversesEventId: event.id,
          idempotencyKey: command.idempotencyKey,
          requestFingerprint,
          createdBy: command.userId,
        },
      });
      await tx.contractStateEvent.update({
        where: { id: event.id },
        data: { recordState: "reversed", reversedBy: command.userId, reversedAt: reversal.createdAt },
      });
      await ensureEditHistoryBaseline("Contract", current.id, command.userId, tx);
      const updated = await tx.contract.update({
        where: { id: current.id },
        data: { ...contractStateProjection(axis, event.fromState), editedBy: command.userId, editedAt: new Date(), version: { increment: 1 } },
        select: { version: true, currentRevisionId: true, lifecycleStatus: true, signatureStatus: true, performanceStatus: true },
      });
      await snapshotHistory("Contract", current.id, command.userId, tx);
      return serviceOk({ success: true, record: contractMutationResult(updated), timeline: await contractTimelineWithClient(tx, current.id) });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    return mapContractLifecycleWriteError(error);
  }
}
