import path from "node:path";

import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

export const DEFAULT_LIBRARY_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

export interface LibraryVersionUploadCommand {
  documentId: number;
  userId: number;
  file: File;
  fileName: string;
  versionLabel?: string;
  changeNote?: string;
}

export interface ManagedVersionStoragePathCommand {
  documentUid: string;
  versionUid: string;
  fileName: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getLibraryUploadMaxBytes(): number {
  const configured = Number(process.env.LIBRARY_UPLOAD_MAX_BYTES);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_LIBRARY_UPLOAD_MAX_BYTES;
}

function normalizeOptionalText(value: FormDataEntryValue | undefined, maxLength: number) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.length <= maxLength ? normalized : null;
}

function normalizeFileName(fileName: string) {
  const normalized = fileName.trim().normalize("NFC");
  if (!normalized || normalized === "." || normalized === "..") return null;
  if (normalized.length > 255 || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
  if (normalized.includes("/") || normalized.includes("\\")) return null;
  if (path.basename(normalized) !== normalized) return null;
  return normalized;
}

export function buildLibraryVersionUploadCommand(input: {
  documentId: number;
  userId: number;
  file?: FormDataEntryValue;
  versionLabel?: FormDataEntryValue;
  changeNote?: FormDataEntryValue;
}): DomainValidationResult<LibraryVersionUploadCommand> {
  if (!Number.isInteger(input.documentId) || input.documentId <= 0) {
    return failCommand("Invalid document id", 400, "id");
  }
  if (!Number.isInteger(input.userId) || input.userId <= 0) {
    return failCommand("Invalid user id", 400, "userId");
  }
  if (!(input.file instanceof File)) return failCommand("Please upload a file", 400, "file");
  if (input.file.size <= 0) return failCommand("Uploaded file is empty", 400, "file");
  if (input.file.size > getLibraryUploadMaxBytes()) {
    return failCommand("Uploaded file exceeds the configured size limit", 413, "file");
  }

  const fileName = normalizeFileName(input.file.name);
  if (!fileName) return failCommand("Invalid file name", 400, "file");

  const versionLabel = normalizeOptionalText(input.versionLabel, 80);
  if (versionLabel === null) return failCommand("versionLabel is invalid or too long", 400, "versionLabel");
  const changeNote = normalizeOptionalText(input.changeNote, 1000);
  if (changeNote === null) return failCommand("changeNote is invalid or too long", 400, "changeNote");

  return okCommand({
    documentId: input.documentId,
    userId: input.userId,
    file: input.file,
    fileName,
    versionLabel,
    changeNote,
  });
}

export function buildManagedVersionStoragePathCommand(input: {
  documentUid: string;
  versionUid: string;
  fileName: string;
}): DomainValidationResult<ManagedVersionStoragePathCommand> {
  if (!UUID_PATTERN.test(input.documentUid)) {
    return failCommand("Invalid document UID", 400, "documentUid");
  }
  if (!UUID_PATTERN.test(input.versionUid)) {
    return failCommand("Invalid version UID", 400, "versionUid");
  }
  const fileName = normalizeFileName(input.fileName);
  if (!fileName) return failCommand("Invalid file name", 400, "fileName");
  return okCommand({ ...input, fileName });
}
