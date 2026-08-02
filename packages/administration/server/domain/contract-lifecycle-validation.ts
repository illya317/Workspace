import type { Prisma } from "@workspace/platform/server/prisma";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import type { ContractStateAxis } from "@workspace/administration/types";
import type {
  ContractRevisionCreateInput,
  ContractRevisionPublishInput,
  ContractStateReverseInput,
  ContractStateTransitionInput,
} from "../schemas";
import {
  normalizeContractLegalInput,
  validateContractState,
} from "./administration-contract-validation";
import { contractStateValueIsValid } from "./contract-lifecycle-policy";

export interface ContractRevisionCreateCommand {
  contractId: number;
  userId: number;
  expectedVersion: number;
  idempotencyKey: string;
  effectiveOn: Date;
  reason: string;
  data: Prisma.ContractUncheckedUpdateInput;
}

export interface ContractRevisionPublishCommand {
  contractId: number;
  revisionId: number;
  userId: number;
  expectedVersion: number;
  idempotencyKey: string;
  reason: string | null;
}

export interface ContractStateTransitionCommand {
  contractId: number;
  userId: number;
  expectedVersion: number;
  idempotencyKey: string;
  axis: ContractStateAxis;
  toState: string;
  effectiveOn: Date;
  reason: string;
}

export interface ContractStateReverseCommand {
  contractId: number;
  eventId: number;
  userId: number;
  expectedVersion: number;
  idempotencyKey: string;
  reason: string;
}

export function assertInitialContractRevisionInput(input: { id: number; createdAt: Date; signedOn?: Date | null }) {
  if (!Number.isInteger(input.id) || input.id <= 0) throw new Error("合同 ID 无效");
  const effectiveOn = input.signedOn ?? input.createdAt;
  if (!(effectiveOn instanceof Date) || Number.isNaN(effectiveOn.getTime())) throw new Error("合同初始修订生效日无效");
}

export function assertDirectContractRevisionInput(input: {
  contractId: number;
  userId: number;
  commandId: string;
  effectiveOn: Date;
  snapshot: { name: string; categoryId: number; signedOn: string | null; expiresOn: string | null };
}) {
  if (!Number.isInteger(input.contractId) || input.contractId <= 0) throw new Error("合同 ID 无效");
  if (!Number.isInteger(input.userId) || input.userId <= 0) throw new Error("合同操作人无效");
  if (!input.commandId.trim()) throw new Error("合同内部命令标识不能为空");
  if (!(input.effectiveOn instanceof Date) || Number.isNaN(input.effectiveOn.getTime())) {
    throw new Error("合同修订生效日无效");
  }
  if (!input.snapshot.name.trim()) throw new Error("合同名称必填");
  if (!Number.isInteger(input.snapshot.categoryId) || input.snapshot.categoryId <= 0) {
    throw new Error("合同类型无效");
  }
  const signedOn = parseSnapshotDate(input.snapshot.signedOn, "签订日期");
  const expiresOn = parseSnapshotDate(input.snapshot.expiresOn, "结束日期");
  const state = validateContractState({ signedOn, expiresOn });
  if (!state.ok) throw new Error(state.issue.message);
}

function parseSnapshotDate(value: string | null, label: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label}无效`);
  }
  return date;
}

function positiveInt(value: number | undefined, field: string) {
  return Number.isInteger(value) && Number(value) > 0
    ? okCommand(Number(value))
    : failCommand(`${field} must be a positive integer`, 400, field);
}

function businessDate(value: string, field: string): DomainValidationResult<Date> {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return failCommand(`${field} 不是有效日期`, 400, field);
  }
  return okCommand(date);
}

function target(input: { contractId: number; userId: number; expectedVersion?: number; idempotencyKey: string }) {
  const contractId = positiveInt(input.contractId, "contractId");
  if (!contractId.ok) return contractId;
  const userId = positiveInt(input.userId, "userId");
  if (!userId.ok) return userId;
  const expectedVersion = positiveInt(input.expectedVersion, "expectedVersion");
  if (!expectedVersion.ok) return expectedVersion;
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) return failCommand("idempotencyKey 不能为空", 400, "idempotencyKey");
  return okCommand({ contractId: contractId.data, userId: userId.data, expectedVersion: expectedVersion.data, idempotencyKey });
}

export async function buildContractRevisionCreateCommand(input: {
  contractId: number;
  userId: number;
  expectedVersion?: number;
  idempotencyKey: string;
  body: ContractRevisionCreateInput;
}): Promise<DomainValidationResult<ContractRevisionCreateCommand>> {
  const normalizedTarget = target(input);
  if (!normalizedTarget.ok) return normalizedTarget;
  const effectiveOn = businessDate(input.body.effectiveOn, "effectiveOn");
  if (!effectiveOn.ok) return effectiveOn;
  const { effectiveOn: _effectiveOn, reason: _reason, ...legalPatch } = input.body;
  if (Object.keys(legalPatch).length === 0) return failCommand("修订内容不能为空", 400);
  const normalized = await normalizeContractLegalInput(legalPatch);
  if (!normalized.ok) return normalized;
  return okCommand({
    ...normalizedTarget.data,
    effectiveOn: effectiveOn.data,
    reason: input.body.reason.trim(),
    data: normalized.data,
  });
}

export function buildContractRevisionPublishCommand(input: {
  contractId: number;
  revisionId: number;
  userId: number;
  expectedVersion?: number;
  idempotencyKey: string;
  body: ContractRevisionPublishInput;
}): DomainValidationResult<ContractRevisionPublishCommand> {
  const normalizedTarget = target(input);
  if (!normalizedTarget.ok) return normalizedTarget;
  const revisionId = positiveInt(input.revisionId, "revisionId");
  if (!revisionId.ok) return revisionId;
  return okCommand({
    ...normalizedTarget.data,
    revisionId: revisionId.data,
    reason: input.body.reason?.trim() || null,
  });
}

export function buildContractStateTransitionCommand(input: {
  contractId: number;
  userId: number;
  expectedVersion?: number;
  idempotencyKey: string;
  body: ContractStateTransitionInput;
}): DomainValidationResult<ContractStateTransitionCommand> {
  const normalizedTarget = target(input);
  if (!normalizedTarget.ok) return normalizedTarget;
  if (!contractStateValueIsValid(input.body.axis, input.body.toState)) {
    return failCommand("目标合同状态无效", 400, "toState");
  }
  const effectiveOn = businessDate(input.body.effectiveOn, "effectiveOn");
  if (!effectiveOn.ok) return effectiveOn;
  if (input.body.effectiveOn > workspaceBusinessDate(new Date())) {
    return failCommand("状态事件不能提前生效；未来变化请在生效日提交", 400, "effectiveOn");
  }
  return okCommand({
    ...normalizedTarget.data,
    axis: input.body.axis,
    toState: input.body.toState,
    effectiveOn: effectiveOn.data,
    reason: input.body.reason.trim(),
  });
}

export function buildContractStateReverseCommand(input: {
  contractId: number;
  eventId: number;
  userId: number;
  expectedVersion?: number;
  idempotencyKey: string;
  body: ContractStateReverseInput;
}): DomainValidationResult<ContractStateReverseCommand> {
  const normalizedTarget = target(input);
  if (!normalizedTarget.ok) return normalizedTarget;
  const eventId = positiveInt(input.eventId, "eventId");
  if (!eventId.ok) return eventId;
  return okCommand({ ...normalizedTarget.data, eventId: eventId.data, reason: input.body.reason.trim() });
}
