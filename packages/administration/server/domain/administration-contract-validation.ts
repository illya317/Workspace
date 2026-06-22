import type { Prisma } from "@workspace/platform/server/prisma";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

export interface ContractCreateInput {
  name: string;
  contractNo?: string | null;
  partyA?: string | null;
  partyB?: string | null;
  shareholder?: string | null;
  category?: string | null;
  content?: string | null;
  handler?: string | null;
  signDate?: string | null;
  endDate?: string | null;
  status?: string | null;
  amount?: string | number | null;
  executedAmount?: string | number | null;
  location?: string | null;
  remark?: string | null;
}

export type ContractUpdateInput = Partial<ContractCreateInput>;

export interface ContractWriteCommand {
  data: Prisma.ContractUncheckedCreateInput | Prisma.ContractUncheckedUpdateInput;
}

export interface ContractDeleteCommand {
  id: number;
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

function buildContractData(data: ContractCreateInput | ContractUpdateInput) {
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
    ...(data.handler !== undefined ? { handler: nullableText(data.handler) } : {}),
    ...(data.signDate !== undefined ? { signDate: nullableText(data.signDate) } : {}),
    ...(data.endDate !== undefined ? { endDate: nullableText(data.endDate) } : {}),
    ...(data.status !== undefined ? { status: nullableText(data.status) } : {}),
    ...(data.amount !== undefined ? { amount: amount.data } : {}),
    ...(data.executedAmount !== undefined ? { executedAmount: executedAmount.data } : {}),
    ...(data.location !== undefined ? { location: nullableText(data.location) } : {}),
    ...(data.remark !== undefined ? { remark: nullableText(data.remark) } : {}),
  });
}

export function buildContractCreateCommand(
  data: ContractCreateInput,
): DomainValidationResult<ContractWriteCommand> {
  if (!data.name?.trim()) return failCommand("合同名称必填", 400, "name");
  const normalized = buildContractData(data);
  if (!normalized.ok) return normalized;
  return okCommand({ data: normalized.data });
}

export function buildContractUpdateCommand(
  id: number,
  data: ContractUpdateInput,
): DomainValidationResult<ContractDeleteCommand & ContractWriteCommand> {
  if (!Number.isInteger(id) || id <= 0) return failCommand("无效ID", 400, "id");
  if (Object.keys(data).length === 0) return failCommand("无更新内容", 400);
  if (data.name !== undefined && !data.name.trim()) return failCommand("合同名称必填", 400, "name");
  const normalized = buildContractData(data);
  if (!normalized.ok) return normalized;
  return okCommand({ id, data: normalized.data });
}

export function buildContractDeleteCommand(id: number): DomainValidationResult<ContractDeleteCommand> {
  if (!Number.isInteger(id) || id <= 0) return failCommand("无效ID", 400, "id");
  return okCommand({ id });
}
