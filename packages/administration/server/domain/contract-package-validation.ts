import path from "node:path";

import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import type {
  ContractApprovalReferenceInput,
  ContractAttachmentRemoveInput,
  ContractAttachmentUploadInput,
  ContractRecordCreateInput,
} from "../contract-package-schemas";

export const CONTRACT_ATTACHMENT_MAX_BYTES = 100 * 1024 * 1024;
export const CONTRACT_ATTACHMENT_MAX_ACTIVE = 30;
export const CONTRACT_ATTACHMENT_MAX_TOTAL_BYTES = 500 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  ".csv", ".doc", ".docx", ".jpeg", ".jpg", ".md", ".pdf", ".png", ".ppt", ".pptx",
  ".txt", ".webp", ".xls", ".xlsx",
]);

export type ContractAttachmentUploadCommand = {
  contractId: number;
  userId: number;
  file: File;
  fileName: string;
  mimeType: string;
  fileSize: number;
  kind: ContractAttachmentUploadInput["kind"];
  note: string | null;
};

export type ContractAttachmentTargetCommand = {
  contractId: number;
  attachmentUid: string;
  userId: number;
};

export type ContractAttachmentRemoveCommand = ContractAttachmentTargetCommand & { reason: string };

export type ContractRecordCreateCommand = {
  contractId: number;
  userId: number;
  recordType: ContractRecordCreateInput["recordType"];
  occurredOn: Date;
  title: string;
  content: string | null;
};

export type ContractApprovalReferenceCommand = {
  contractId: number;
  userId: number;
  expectedVersion: number;
  sourceKey: string;
  externalRecordId: string;
  externalUrl: string | null;
  statusSnapshot: string | null;
  approvedOn: Date;
  note: string | null;
};

function positiveInt(value: number | undefined, field: string) {
  return Number.isInteger(value) && Number(value) > 0
    ? okCommand(Number(value))
    : failCommand(`${field} must be a positive integer`, 400, field);
}

function normalizedDate(value: string, field: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? okCommand(date)
    : failCommand(`${field} 不是有效日期`, 400, field);
}

function safeFileName(value: string) {
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized === "." || normalized === "..") return null;
  if (normalized.length > 255 || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
  if (normalized.includes("/") || normalized.includes("\\") || path.basename(normalized) !== normalized) return null;
  return normalized;
}

function validIdentity(contractId: number, userId: number) {
  const contract = positiveInt(contractId, "contractId");
  if (!contract.ok) return contract;
  const user = positiveInt(userId, "userId");
  if (!user.ok) return user;
  return okCommand({ contractId: contract.data, userId: user.data });
}

export function buildContractAttachmentUploadCommand(
  contractId: number,
  input: ContractAttachmentUploadInput,
  userId: number,
): DomainValidationResult<ContractAttachmentUploadCommand> {
  const identity = validIdentity(contractId, userId);
  if (!identity.ok) return identity;
  if (!(input.file instanceof File)) return failCommand("请选择合同附件", 400, "file");
  const fileName = safeFileName(input.file.name);
  if (!fileName) return failCommand("附件文件名无效", 400, "file");
  const extension = path.extname(fileName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) return failCommand("附件格式不受支持", 400, "file");
  if (input.file.size <= 0) return failCommand("不能上传空文件", 400, "file");
  if (input.file.size > CONTRACT_ATTACHMENT_MAX_BYTES) return failCommand("单个附件不能超过 100 MB", 413, "file");
  return okCommand({
    ...identity.data,
    file: input.file,
    fileName,
    mimeType: input.file.type.trim().slice(0, 200) || "application/octet-stream",
    fileSize: input.file.size,
    kind: input.kind,
    note: input.note?.trim() || null,
  });
}

export function buildContractAttachmentTargetCommand(
  contractId: number,
  attachmentUid: string,
  userId: number,
): DomainValidationResult<ContractAttachmentTargetCommand> {
  const identity = validIdentity(contractId, userId);
  if (!identity.ok) return identity;
  const uid = attachmentUid.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uid)) {
    return failCommand("附件标识无效", 400, "attachmentUid");
  }
  return okCommand({ ...identity.data, attachmentUid: uid });
}

export function buildContractAttachmentRemoveCommand(
  contractId: number,
  attachmentUid: string,
  input: ContractAttachmentRemoveInput,
  userId: number,
): DomainValidationResult<ContractAttachmentRemoveCommand> {
  const target = buildContractAttachmentTargetCommand(contractId, attachmentUid, userId);
  return target.ok ? okCommand({ ...target.data, reason: input.reason.trim() }) : target;
}

export function buildContractRecordCreateCommand(
  contractId: number,
  input: ContractRecordCreateInput,
  userId: number,
): DomainValidationResult<ContractRecordCreateCommand> {
  const identity = validIdentity(contractId, userId);
  if (!identity.ok) return identity;
  const occurredOn = normalizedDate(input.occurredOn, "occurredOn");
  if (!occurredOn.ok) return occurredOn;
  return okCommand({
    ...identity.data,
    recordType: input.recordType,
    occurredOn: occurredOn.data,
    title: input.title.trim(),
    content: input.content?.trim() || null,
  });
}

export function buildContractApprovalReferenceCommand(
  contractId: number,
  input: ContractApprovalReferenceInput,
  userId: number,
  expectedVersion?: number,
): DomainValidationResult<ContractApprovalReferenceCommand> {
  const identity = validIdentity(contractId, userId);
  if (!identity.ok) return identity;
  const version = positiveInt(expectedVersion, "expectedVersion");
  if (!version.ok) return version;
  if (!/^[A-Za-z0-9._-]+$/.test(input.sourceKey)) return failCommand("审批来源标识无效", 400, "sourceKey");
  const approvedOn = normalizedDate(input.approvedOn, "approvedOn");
  if (!approvedOn.ok) return approvedOn;
  return okCommand({
    ...identity.data,
    expectedVersion: version.data,
    sourceKey: input.sourceKey,
    externalRecordId: input.externalRecordId,
    externalUrl: input.externalUrl || null,
    statusSnapshot: input.statusSnapshot || null,
    approvedOn: approvedOn.data,
    note: input.note || null,
  });
}
