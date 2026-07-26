import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

export const ERP_DILIGENCE_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const ERP_DILIGENCE_ATTACHMENT_MAX_PER_EVIDENCE = 8;
export const ERP_DILIGENCE_ATTACHMENT_MAX_TOTAL_BYTES = 100 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  ".csv", ".doc", ".docx", ".jpeg", ".jpg", ".pdf", ".png", ".ppt", ".pptx",
  ".txt", ".webp", ".xls", ".xlsx",
]);

export interface ErpDiligenceEvidenceUploadInput {
  evidenceKey: string;
  file: File;
}

export interface ErpDiligenceEvidenceUploadCommand {
  userId: number;
  evidenceKey: string;
  file: File;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface ErpDiligenceEvidenceAttachmentCommand {
  userId: number;
  attachmentUid: string;
}

function validUserId(userId: number) {
  return Number.isInteger(userId) && userId > 0;
}

function safeFileName(value: string) {
  return value.split(/[\\/]/).pop()?.trim().replace(/[\u0000-\u001f\u007f]/g, "") ?? "";
}

export function buildErpDiligenceEvidenceUploadCommand(
  input: ErpDiligenceEvidenceUploadInput,
  userId: number,
): DomainValidationResult<ErpDiligenceEvidenceUploadCommand> {
  if (!validUserId(userId)) return failCommand("用户无效", 400, "userId");
  const evidenceKey = input.evidenceKey.trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(evidenceKey)) return failCommand("材料标识无效", 400, "evidenceKey");
  if (!(input.file instanceof File)) return failCommand("请选择要上传的样表或材料", 400, "file");
  const fileName = safeFileName(input.file.name);
  if (!fileName || fileName.length > 240) return failCommand("附件文件名无效或过长", 400, "file");
  const extensionIndex = fileName.lastIndexOf(".");
  const extension = extensionIndex >= 0 ? fileName.slice(extensionIndex).toLowerCase() : "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return failCommand("仅支持 PDF、Office、CSV、文本和常用图片文件", 400, "file");
  }
  if (input.file.size <= 0) return failCommand("不能上传空文件", 400, "file");
  if (input.file.size > ERP_DILIGENCE_ATTACHMENT_MAX_BYTES) {
    return failCommand("单个附件不能超过 20 MB", 400, "file");
  }
  const mimeType = input.file.type.trim().slice(0, 200) || "application/octet-stream";
  return okCommand({
    userId,
    evidenceKey,
    file: input.file,
    fileName,
    mimeType,
    fileSize: input.file.size,
  });
}

export function buildErpDiligenceEvidenceAttachmentCommand(
  attachmentUid: string,
  userId: number,
): DomainValidationResult<ErpDiligenceEvidenceAttachmentCommand> {
  if (!validUserId(userId)) return failCommand("用户无效", 400, "userId");
  const normalizedUid = attachmentUid.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalizedUid)) {
    return failCommand("附件标识无效", 400, "attachmentUid");
  }
  return okCommand({ userId, attachmentUid: normalizedUid });
}
