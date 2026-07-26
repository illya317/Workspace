import { Prisma, prisma } from "@workspace/platform/server/prisma";
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

export interface ContractTargetCommand {
  id: number;
  userId: number;
  expectedVersion: number;
}

function positiveInt(value: number | undefined, field: string) {
  return Number.isInteger(value) && Number(value) > 0
    ? okCommand(Number(value))
    : failCommand(`${field} must be a positive integer`, 400, field);
}

function nullableText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function normalizeAmount(
  value: string | number | null | undefined,
  field: "amount" | "executedAmount",
): DomainValidationResult<Prisma.Decimal | null> {
  if (value == null || value === "") return okCommand(null);
  const text = String(value).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) {
    return failCommand(`${field} 最多保留两位小数`, 400, field);
  }
  return okCommand(new Prisma.Decimal(text));
}

function normalizeDate(value: string | null | undefined, field: "signedOn" | "expiresOn") {
  if (!value) return okCommand(null);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return failCommand(`${field} 不是有效日期`, 400, field);
  }
  return okCommand(date);
}

async function normalizeReference(
  fkKey: string,
  value: number | null | undefined,
  field: string,
  label: string,
) {
  if (value === undefined) return okCommand(undefined);
  const validation = await validateFkValue(ADMINISTRATION_FK_REGISTRY, {
    fkKey,
    value,
    lifecycleScope: "all",
    requiredLabel: label,
  });
  return validation.ok
    ? okCommand(validation.value)
    : failCommand(validation.error, validation.status ?? 400, field);
}

async function normalizeReferences(data: ContractCreateInput | ContractUpdateInput) {
  const [owningCompany, ownerDepartment, partyA, partyB, handlerEmployee] = await Promise.all([
    normalizeReference("administration.contracts.owning.company", data.owningCompanyId, "owningCompanyId", "归属公司"),
    normalizeReference("administration.contracts.owner.department", data.ownerDepartmentId, "ownerDepartmentId", "归口部门"),
    normalizeReference("administration.contracts.party.a", data.partyAId, "partyAId", "甲方主体"),
    normalizeReference("administration.contracts.party.b", data.partyBId, "partyBId", "乙方主体"),
    normalizeReference("administration.contracts.handler.employee", data.handlerEmployeeId, "handlerEmployeeId", "经办人"),
  ]);
  if (!owningCompany.ok) return owningCompany;
  if (!ownerDepartment.ok) return ownerDepartment;
  if (!partyA.ok) return partyA;
  if (!partyB.ok) return partyB;
  if (!handlerEmployee.ok) return handlerEmployee;
  return okCommand({
    owningCompanyId: owningCompany.data,
    ownerDepartmentId: ownerDepartment.data,
    partyAId: partyA.data,
    partyBId: partyB.data,
    handlerEmployeeId: handlerEmployee.data,
  });
}

async function validateCategoryId(value: number | undefined) {
  if (value === undefined) return okCommand(undefined);
  const category = await prisma.contractCategory.findFirst({
    where: { id: value, isActive: true },
    select: { id: true },
  });
  return category ? okCommand(category.id) : failCommand("合同类型不存在或已停用", 400, "categoryId");
}

function buildContractData(
  data: ContractCreateInput | ContractUpdateInput,
  references: {
    owningCompanyId?: number | null;
    ownerDepartmentId?: number | null;
    partyAId?: number | null;
    partyBId?: number | null;
    handlerEmployeeId?: number | null;
  },
) {
  const amount = data.amount !== undefined ? normalizeAmount(data.amount, "amount") : okCommand(undefined);
  if (!amount.ok) return amount;
  const executedAmount = data.executedAmount !== undefined
    ? normalizeAmount(data.executedAmount, "executedAmount")
    : okCommand(undefined);
  if (!executedAmount.ok) return executedAmount;
  const signedOn = data.signedOn !== undefined ? normalizeDate(data.signedOn, "signedOn") : okCommand(undefined);
  if (!signedOn.ok) return signedOn;
  const expiresOn = data.expiresOn !== undefined ? normalizeDate(data.expiresOn, "expiresOn") : okCommand(undefined);
  if (!expiresOn.ok) return expiresOn;

  return okCommand({
    ...(data.name !== undefined ? { name: data.name.trim() } : {}),
    ...(data.contractNo !== undefined ? { contractNo: nullableText(data.contractNo) } : {}),
    ...(data.partyA !== undefined ? { partyA: nullableText(data.partyA) } : {}),
    ...(data.partyB !== undefined ? { partyB: nullableText(data.partyB) } : {}),
    ...(data.shareholder !== undefined ? { shareholder: nullableText(data.shareholder) } : {}),
    ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
    ...(data.content !== undefined ? { content: nullableText(data.content) } : {}),
    ...(data.owningCompanyId !== undefined ? { owningCompanyId: references.owningCompanyId } : {}),
    ...(data.ownerDepartmentId !== undefined ? { ownerDepartmentId: references.ownerDepartmentId } : {}),
    ...(data.partyAId !== undefined ? { partyAId: references.partyAId } : {}),
    ...(data.partyBId !== undefined ? { partyBId: references.partyBId } : {}),
    ...(data.handlerEmployeeId !== undefined ? { handlerEmployeeId: references.handlerEmployeeId } : {}),
    ...(data.signedOn !== undefined ? { signedOn: signedOn.data, signedOnPrecision: signedOn.data ? "day" : null } : {}),
    ...(data.expiresOn !== undefined ? { expiresOn: expiresOn.data, expiresOnPrecision: expiresOn.data ? "day" : null } : {}),
    ...(data.amount !== undefined ? { amount: amount.data } : {}),
    ...(data.executedAmount !== undefined ? { executedAmount: executedAmount.data } : {}),
    ...(data.currencyCode !== undefined ? { currencyCode: data.currencyCode.trim().toUpperCase() } : {}),
    ...(data.confidentialityLevel !== undefined ? { confidentialityLevel: data.confidentialityLevel } : {}),
    ...(data.location !== undefined ? { location: nullableText(data.location) } : {}),
    ...(data.remark !== undefined ? { remark: nullableText(data.remark) } : {}),
  });
}

export function validateContractState(input: { signedOn?: Date | null; expiresOn?: Date | null }) {
  if (input.signedOn && input.expiresOn && input.signedOn > input.expiresOn) {
    return failCommand("合同结束日期不能早于签订日期", 400, "expiresOn");
  }
  return okCommand(input);
}

export async function normalizeContractLegalInput(data: ContractCreateInput | ContractUpdateInput) {
  const categoryId = await validateCategoryId(data.categoryId);
  if (!categoryId.ok) return categoryId;
  const references = await normalizeReferences(data);
  if (!references.ok) return references;
  const normalized = buildContractData(data, references.data);
  if (!normalized.ok) return normalized;
  const state = validateContractState(normalized.data);
  return state.ok ? normalized : state;
}

export async function buildContractCreateCommand(
  data: ContractCreateInput,
  userId: number,
): Promise<DomainValidationResult<ContractWriteCommand>> {
  const validUserId = positiveInt(userId, "userId");
  if (!validUserId.ok) return validUserId;
  if (!data.name?.trim()) return failCommand("合同名称必填", 400, "name");
  const normalized = await normalizeContractLegalInput(data);
  if (!normalized.ok) return normalized;
  return okCommand({ userId: validUserId.data, data: normalized.data });
}

export async function buildContractUpdateCommand(
  id: number,
  data: ContractUpdateInput,
  userId: number,
  expectedVersion?: number,
): Promise<DomainValidationResult<ContractTargetCommand & ContractWriteCommand>> {
  const validId = positiveInt(id, "id");
  if (!validId.ok) return validId;
  const validUserId = positiveInt(userId, "userId");
  if (!validUserId.ok) return validUserId;
  const validVersion = positiveInt(expectedVersion, "expectedVersion");
  if (!validVersion.ok) return validVersion;
  if (Object.keys(data).length === 0) return failCommand("无更新内容", 400);
  if (data.name !== undefined && !data.name.trim()) return failCommand("合同名称必填", 400, "name");
  const normalized = await normalizeContractLegalInput(data);
  if (!normalized.ok) return normalized;
  return okCommand({
    id: validId.data,
    userId: validUserId.data,
    expectedVersion: validVersion.data,
    data: normalized.data,
  });
}

export function buildContractTargetCommand(
  id: number,
  userId: number,
  expectedVersion?: number,
): DomainValidationResult<ContractTargetCommand> {
  const validId = positiveInt(id, "id");
  if (!validId.ok) return validId;
  const validUserId = positiveInt(userId, "userId");
  if (!validUserId.ok) return validUserId;
  const validVersion = positiveInt(expectedVersion, "expectedVersion");
  if (!validVersion.ok) return validVersion;
  return okCommand({ id: validId.data, userId: validUserId.data, expectedVersion: validVersion.data });
}
