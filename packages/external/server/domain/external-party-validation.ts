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

export interface ExternalPartySubjectMutableData {
  subjectType?: ExternalPartySubjectType;
  relatedPartyType?: ExternalPartyRelatedPartyType;
  name?: string;
  fullName?: string | null;
  identityNumber?: string;
  legalRepresentative?: string | null;
}

export interface ExternalPartyRoleMutableData {
  code?: string;
  classification?: string | null;
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
  existingPartyId?: number;
  subjectData: ExternalPartySubjectMutableData & {
    subjectType: ExternalPartySubjectType;
    relatedPartyType: ExternalPartyRelatedPartyType;
    name: string;
    identityNumber: string;
  };
  roleData: ExternalPartyRoleMutableData & { code: string; isActive: boolean };
}

export interface ExternalPartyUpdateCommand {
  id: number;
  category: ExternalPartyCategory;
  userId: number;
  expectedVersion: number;
  subjectData: ExternalPartySubjectMutableData;
  roleData: ExternalPartyRoleMutableData;
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

function normalizedIdentity(value: string | undefined) {
  return value === undefined ? undefined : value.trim().toUpperCase();
}

function normalizeSubjectData(
  input: ExternalPartyCreateInput | ExternalPartyUpdateInput,
): ExternalPartySubjectMutableData {
  return {
    ...(input.subjectType !== undefined ? { subjectType: input.subjectType } : {}),
    ...(input.relatedPartyType !== undefined ? { relatedPartyType: input.relatedPartyType } : {}),
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.fullName !== undefined ? { fullName: nullableText(input.fullName) } : {}),
    ...(input.identityNumber !== undefined ? { identityNumber: normalizedIdentity(input.identityNumber) } : {}),
    ...(input.legalRepresentative !== undefined ? { legalRepresentative: nullableText(input.legalRepresentative) } : {}),
  };
}

function normalizeRoleData(
  input: ExternalPartyCreateInput | ExternalPartyUpdateInput,
): ExternalPartyRoleMutableData {
  return {
    ...(input.code !== undefined ? { code: input.code.trim() } : {}),
    ...(input.classification !== undefined ? { classification: nullableText(input.classification) } : {}),
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
  const identityNumber = normalizedIdentity(input.identityNumber);
  if (!identityNumber) return failCommand("统一代码或证件号码必填", 400, "identityNumber");
  const existingPartyId = input.existingPartyId === undefined
    ? undefined
    : positiveInt(input.existingPartyId, "existingPartyId");
  if (existingPartyId && !existingPartyId.ok) return existingPartyId;
  return okCommand({
    category,
    userId: validUserId.data,
    ...(existingPartyId ? { existingPartyId: existingPartyId.data } : {}),
    subjectData: {
      ...normalizeSubjectData(input),
      subjectType: input.subjectType ?? "organization",
      relatedPartyType: input.relatedPartyType ?? "unrelated",
      name: input.name.trim(),
      identityNumber,
    },
    roleData: {
      ...normalizeRoleData(input),
      code: input.code.trim(),
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
    subjectData: normalizeSubjectData(input),
    roleData: normalizeRoleData(input),
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
