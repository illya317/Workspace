import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import type {
  ExternalPartyCategory,
  ExternalPartyRelatedPartyType,
  ExternalPartySubjectType,
} from "@workspace/external/types";
import type { ExternalPartyCreateInput, ExternalPartyUpdateInput } from "../schemas";

export interface ExternalPartyMutableData {
  subjectType?: ExternalPartySubjectType;
  relatedPartyType?: ExternalPartyRelatedPartyType;
  code?: string;
  name?: string;
  fullName?: string | null;
  classification?: string | null;
  identityNumber?: string | null;
  legalRepresentative?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  address?: string | null;
  invoiceTitle?: string | null;
  invoiceAddressPhone?: string | null;
  settlementTerms?: string | null;
  creditLimit?: number | null;
  creditDays?: number | null;
  taxRate?: number | null;
  remark?: string | null;
  isActive?: boolean;
}

export interface ExternalPartyCreateCommand {
  category: ExternalPartyCategory;
  userId: number;
  data: ExternalPartyMutableData & { subjectType: ExternalPartySubjectType; code: string; name: string; isActive: boolean };
}

export interface ExternalPartyUpdateCommand {
  id: number;
  category: ExternalPartyCategory;
  userId: number;
  expectedVersion: number;
  data: ExternalPartyMutableData;
}

export interface ExternalPartyDeleteCommand {
  id: number;
  category: ExternalPartyCategory;
  userId: number;
  expectedVersion: number;
}

function positiveInt(value: number | undefined, field: string) {
  return value !== undefined && Number.isInteger(value) && value > 0
    ? okCommand(value)
    : failCommand(`${field} 无效`, 400, field);
}

function nullableText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value?.trim() || null;
}

function normalizeData(input: ExternalPartyCreateInput | ExternalPartyUpdateInput): ExternalPartyMutableData {
  return {
    ...(input.subjectType !== undefined ? { subjectType: input.subjectType } : {}),
    ...(input.relatedPartyType !== undefined ? { relatedPartyType: input.relatedPartyType } : {}),
    ...(input.code !== undefined ? { code: input.code.trim() } : {}),
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.fullName !== undefined ? { fullName: nullableText(input.fullName) } : {}),
    ...(input.classification !== undefined ? { classification: nullableText(input.classification) } : {}),
    ...(input.identityNumber !== undefined ? { identityNumber: nullableText(input.identityNumber) } : {}),
    ...(input.legalRepresentative !== undefined ? { legalRepresentative: nullableText(input.legalRepresentative) } : {}),
    ...(input.contactPerson !== undefined ? { contactPerson: nullableText(input.contactPerson) } : {}),
    ...(input.phone !== undefined ? { phone: nullableText(input.phone) } : {}),
    ...(input.email !== undefined ? { email: nullableText(input.email) } : {}),
    ...(input.bankName !== undefined ? { bankName: nullableText(input.bankName) } : {}),
    ...(input.bankAccount !== undefined ? { bankAccount: nullableText(input.bankAccount) } : {}),
    ...(input.address !== undefined ? { address: nullableText(input.address) } : {}),
    ...(input.invoiceTitle !== undefined ? { invoiceTitle: nullableText(input.invoiceTitle) } : {}),
    ...(input.invoiceAddressPhone !== undefined ? { invoiceAddressPhone: nullableText(input.invoiceAddressPhone) } : {}),
    ...(input.settlementTerms !== undefined ? { settlementTerms: nullableText(input.settlementTerms) } : {}),
    ...(input.creditLimit !== undefined ? { creditLimit: input.creditLimit } : {}),
    ...(input.creditDays !== undefined ? { creditDays: input.creditDays } : {}),
    ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
    ...(input.remark !== undefined ? { remark: nullableText(input.remark) } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  };
}

export function buildExternalPartyCreateCommand(
  category: ExternalPartyCategory,
  input: ExternalPartyCreateInput,
  userId: number,
): DomainValidationResult<ExternalPartyCreateCommand> {
  const validUserId = positiveInt(userId, "userId");
  if (!validUserId.ok) return validUserId;
  if (!input.code.trim()) return failCommand("编码必填", 400, "code");
  if (!input.name.trim()) return failCommand("名称必填", 400, "name");
  const data = normalizeData(input);
  return okCommand({
    category,
    userId: validUserId.data,
    data: {
      ...data,
      subjectType: input.subjectType ?? "organization",
      relatedPartyType: input.relatedPartyType ?? "unrelated",
      code: input.code.trim(),
      name: input.name.trim(),
      isActive: input.isActive ?? true,
    },
  });
}

export function buildExternalPartyUpdateCommand(
  id: number,
  category: ExternalPartyCategory,
  input: ExternalPartyUpdateInput,
  userId: number,
  expectedVersion?: number,
): DomainValidationResult<ExternalPartyUpdateCommand> {
  const validId = positiveInt(id, "id");
  if (!validId.ok) return validId;
  const validUserId = positiveInt(userId, "userId");
  if (!validUserId.ok) return validUserId;
  const validVersion = positiveInt(expectedVersion, "expectedVersion");
  if (!validVersion.ok) return validVersion;
  if (Object.keys(input).length === 0) return failCommand("无更新内容", 400);
  if (input.code !== undefined && !input.code.trim()) return failCommand("编码必填", 400, "code");
  if (input.name !== undefined && !input.name.trim()) return failCommand("名称必填", 400, "name");
  return okCommand({
    id: validId.data,
    category,
    userId: validUserId.data,
    expectedVersion: validVersion.data,
    data: normalizeData(input),
  });
}

export function buildExternalPartyDeleteCommand(
  id: number,
  category: ExternalPartyCategory,
  userId: number,
  expectedVersion?: number,
): DomainValidationResult<ExternalPartyDeleteCommand> {
  const validId = positiveInt(id, "id");
  if (!validId.ok) return validId;
  const validUserId = positiveInt(userId, "userId");
  if (!validUserId.ok) return validUserId;
  const validVersion = positiveInt(expectedVersion, "expectedVersion");
  if (!validVersion.ok) return validVersion;
  return okCommand({
    id: validId.data,
    category,
    userId: validUserId.data,
    expectedVersion: validVersion.data,
  });
}
