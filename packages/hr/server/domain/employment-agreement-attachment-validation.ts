import path from "node:path";

import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

export const EMPLOYMENT_AGREEMENT_ATTACHMENT_MAX_BYTES = 100 * 1024 * 1024;
export const EMPLOYMENT_AGREEMENT_ATTACHMENT_MAX_ACTIVE = 30;
export const EMPLOYMENT_AGREEMENT_ATTACHMENT_MAX_TOTAL_BYTES = 500 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  ".doc", ".docx", ".jpeg", ".jpg", ".pdf", ".png", ".webp",
]);

export type EmploymentAgreementAttachmentUploadCommand = {
  employeeId: number;
  agreementUid: string;
  userId: number;
  file: File;
  fileName: string;
  mimeType: string;
  fileSize: number;
  note: string | null;
};

export type EmploymentAgreementAttachmentTargetCommand = {
  employeeId: number;
  agreementUid: string;
  attachmentUid: string;
  userId: number;
};

export type EmploymentAgreementAttachmentRemoveCommand = EmploymentAgreementAttachmentTargetCommand & { reason: string };

function positiveInt(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function safeFileName(value: string) {
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized === "." || normalized === "..") return null;
  if (normalized.length > 255 || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
  if (normalized.includes("/") || normalized.includes("\\") || path.basename(normalized) !== normalized) return null;
  return normalized;
}

function stableUid(value: unknown) {
  const uid = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uid) ? uid : null;
}

export function buildEmploymentAgreementAttachmentUploadCommand(
  input: unknown,
): DomainValidationResult<EmploymentAgreementAttachmentUploadCommand> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return failCommand("协议附件参数无效");
  const raw = input as Record<string, unknown>;
  const employeeId = positiveInt(raw.employeeId);
  const userId = positiveInt(raw.userId);
  const agreementUid = stableUid(raw.agreementUid);
  if (!employeeId) return failCommand("员工ID无效", 400, "employeeId");
  if (!userId) return failCommand("用户ID无效", 400, "userId");
  if (!agreementUid) return failCommand("协议标识无效", 400, "agreementUid");
  if (!(raw.file instanceof File)) return failCommand("请选择协议附件", 400, "file");
  const fileName = safeFileName(raw.file.name);
  if (!fileName) return failCommand("附件文件名无效", 400, "file");
  if (!ALLOWED_EXTENSIONS.has(path.extname(fileName).toLowerCase())) {
    return failCommand("附件仅支持 PDF、Word 和图片", 400, "file");
  }
  if (raw.file.size <= 0) return failCommand("不能上传空文件", 400, "file");
  if (raw.file.size > EMPLOYMENT_AGREEMENT_ATTACHMENT_MAX_BYTES) return failCommand("单个附件不能超过 100 MB", 413, "file");
  return okCommand({
    employeeId,
    agreementUid,
    userId,
    file: raw.file,
    fileName,
    mimeType: raw.file.type.trim().slice(0, 200) || "application/octet-stream",
    fileSize: raw.file.size,
    note: typeof raw.note === "string" ? raw.note.trim() || null : null,
  });
}

export function buildEmploymentAgreementAttachmentTargetCommand(
  input: unknown,
): DomainValidationResult<EmploymentAgreementAttachmentTargetCommand> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return failCommand("协议附件参数无效");
  const raw = input as Record<string, unknown>;
  const employeeId = positiveInt(raw.employeeId);
  const userId = positiveInt(raw.userId);
  const agreementUid = stableUid(raw.agreementUid);
  const attachmentUid = stableUid(raw.attachmentUid);
  if (!employeeId) return failCommand("员工ID无效", 400, "employeeId");
  if (!userId) return failCommand("用户ID无效", 400, "userId");
  if (!agreementUid) return failCommand("协议标识无效", 400, "agreementUid");
  if (!attachmentUid) return failCommand("附件标识无效", 400, "attachmentUid");
  return okCommand({ employeeId, agreementUid, attachmentUid, userId });
}

export function buildEmploymentAgreementAttachmentRemoveCommand(
  input: unknown,
): DomainValidationResult<EmploymentAgreementAttachmentRemoveCommand> {
  const target = buildEmploymentAgreementAttachmentTargetCommand(input);
  if (!target.ok) return target;
  const reason = String((input as Record<string, unknown>).reason ?? "").trim();
  return reason ? okCommand({ ...target.data, reason }) : failCommand("请填写移除原因", 400, "reason");
}
