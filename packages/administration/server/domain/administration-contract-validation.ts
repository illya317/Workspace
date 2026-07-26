import type { Prisma } from "@workspace/platform/server/prisma";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { validateFkValue } from "@workspace/platform/server/relation-registry";
import { ADMINISTRATION_FK_REGISTRY } from "../fk-registry";
import type { ContractCreateInput, ContractUpdateInput } from "../schemas";

export interface ContractWriteCommand {
  userId: number;
  data: Prisma.ContractUncheckedCreateInput | Prisma.ContractUncheckedUpdateInput;
}

export interface ContractDeleteCommand {
  id: number;
  userId: number;
  expectedVersion?: number;
}

function positiveInt(value: number, field: string) {
  return Number.isInteger(value) && value > 0
    ? okCommand(value)
    : failCommand(`${field} must be a positive integer`, 400, field);
}

function nullableText(value: string | null | undefined) {
  return value ?? null;
}

function normalizeAmount(
  value: string | number | null | undefined,
  field: "amount" | "executedAmount",
): DomainValidationResult<number | null> {
  if (value == null || value === "") return okCommand(null);
  const amount = Number(value);
  if (!Number.isFinite(amount)) return failCommand(`${field} must be a number`, 400, field);
  return okCommand(amount);
}

async function normalizeHandlerEmployeeId(value: number | null | undefined) {
  if (value === undefined) return okCommand(undefined);
  const validation = await validateFkValue(ADMINISTRATION_FK_REGISTRY, {
    fkKey: "administration.contracts.handler.employee",
    value,
    lifecycleScope: "all",
    requiredLabel: "经办人",
  });
  return validation.ok
    ? okCommand(validation.value)
    : failCommand(validation.error, validation.status ?? 400, "handlerEmployeeId");
}

function buildContractData(
  data: ContractCreateInput | ContractUpdateInput,
  handlerEmployeeId: number | null | undefined,
) {
  const amount = data.amount !== undefined ? normalizeAmount(data.amount, "amount") : okCommand(undefined);
  if (!amount.ok) return amount;
  const executedAmount = data.executedAmount !== undefined
    ? normalizeAmount(data.executedAmount, "executedAmount")
    : okCommand(undefined);
  if (!executedAmount.ok) return executedAmount;

  return okCommand({
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.contractNo !== undefined ? { contractNo: nullableText(data.contractNo) } : {}),
    ...(data.partyA !== undefined ? { partyA: nullableText(data.partyA) } : {}),
    ...(data.partyB !== undefined ? { partyB: nullableText(data.partyB) } : {}),
    ...(data.shareholder !== undefined ? { shareholder: nullableText(data.shareholder) } : {}),
    ...(data.category !== undefined ? { category: nullableText(data.category) } : {}),
    ...(data.content !== undefined ? { content: nullableText(data.content) } : {}),
    ...(data.handlerEmployeeId !== undefined ? { handlerEmployeeId } : {}),
    ...(data.signDate !== undefined ? { signDate: nullableText(data.signDate) } : {}),
    ...(data.endDate !== undefined ? { endDate: nullableText(data.endDate) } : {}),
    ...(data.status !== undefined ? { status: nullableText(data.status) } : {}),
    ...(data.amount !== undefined ? { amount: amount.data } : {}),
    ...(data.executedAmount !== undefined ? { executedAmount: executedAmount.data } : {}),
    ...(data.location !== undefined ? { location: nullableText(data.location) } : {}),
    ...(data.remark !== undefined ? { remark: nullableText(data.remark) } : {}),
  });
}

export async function buildContractCreateCommand(
  data: ContractCreateInput,
  userId: number,
): Promise<DomainValidationResult<ContractWriteCommand>> {
  const validUserId = positiveInt(userId, "userId");
  if (!validUserId.ok) return validUserId;
  if (!data.name?.trim()) return failCommand("合同名称必填", 400, "name");
  const handlerEmployeeId = await normalizeHandlerEmployeeId(data.handlerEmployeeId);
  if (!handlerEmployeeId.ok) return handlerEmployeeId;
  const normalized = buildContractData(data, handlerEmployeeId.data);
  if (!normalized.ok) return normalized;
  return okCommand({ userId: validUserId.data, data: normalized.data });
}

export async function buildContractUpdateCommand(
  id: number,
  data: ContractUpdateInput,
  userId: number,
): Promise<DomainValidationResult<ContractDeleteCommand & ContractWriteCommand>> {
  const validId = positiveInt(id, "id");
  if (!validId.ok) return validId;
  const validUserId = positiveInt(userId, "userId");
  if (!validUserId.ok) return validUserId;
  if (Object.keys(data).length === 0) return failCommand("无更新内容", 400);
  if (data.name !== undefined && !data.name.trim()) return failCommand("合同名称必填", 400, "name");
  const handlerEmployeeId = await normalizeHandlerEmployeeId(data.handlerEmployeeId);
  if (!handlerEmployeeId.ok) return handlerEmployeeId;
  const normalized = buildContractData(data, handlerEmployeeId.data);
  if (!normalized.ok) return normalized;
  return okCommand({ id: validId.data, userId: validUserId.data, data: normalized.data });
}

export function buildContractDeleteCommand(
  id: number,
  userId: number,
  expectedVersion?: number,
): DomainValidationResult<ContractDeleteCommand> {
  const validId = positiveInt(id, "id");
  if (!validId.ok) return validId;
  const validUserId = positiveInt(userId, "userId");
  if (!validUserId.ok) return validUserId;
  if (expectedVersion !== undefined && (!Number.isInteger(expectedVersion) || expectedVersion < 0)) {
    return failCommand("version must be a non-negative integer", 400, "expectedVersion");
  }
  return okCommand({ id: validId.data, userId: validUserId.data, expectedVersion });
}
