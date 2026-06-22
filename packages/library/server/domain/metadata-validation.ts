import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

export interface UpdateMetadataInput {
  title?: string;
  summary?: string;
  docId?: string;
  tags?: string[];
  categoryCode?: string;
  categoryName?: string;
  subcategoryPath?: string;
  confidentialityLevel?: number;
  status?: string;
}

export interface UpdateDocumentMetadataCommand {
  id: number;
  userId: number;
  data: Record<string, unknown>;
  tags?: string[];
}

export interface ArchiveDocumentCommand {
  id: number;
  userId: number;
}

function positiveInt(value: number, field: string) {
  return Number.isInteger(value) && value > 0 ? okCommand(value) : failCommand(`${field} must be a positive integer`, 400, field);
}

export function buildUpdateDocumentMetadataCommand(
  id: number,
  input: UpdateMetadataInput,
  userId: number,
): DomainValidationResult<UpdateDocumentMetadataCommand> {
  const validId = positiveInt(id, "id");
  if (!validId.ok) return validId;
  const validUserId = positiveInt(userId, "userId");
  if (!validUserId.ok) return validUserId;
  if (input.confidentialityLevel !== undefined) {
    if (!Number.isInteger(input.confidentialityLevel) || input.confidentialityLevel < 0 || input.confidentialityLevel > 4) {
      return failCommand("confidentialityLevel must be 0..4", 400, "confidentialityLevel");
    }
  }

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.summary !== undefined) data.summary = input.summary;
  if (input.docId !== undefined) data.docId = input.docId || null;
  if (input.categoryCode !== undefined) data.categoryCode = input.categoryCode;
  if (input.categoryName !== undefined) data.categoryName = input.categoryName;
  if (input.subcategoryPath !== undefined) data.subcategoryPath = input.subcategoryPath;
  if (input.confidentialityLevel !== undefined) data.confidentialityLevel = input.confidentialityLevel;
  if (input.status !== undefined) data.status = input.status;

  const tags = input.tags === undefined
    ? undefined
    : [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))];

  return okCommand({ id: validId.data, userId: validUserId.data, data, tags });
}

export function buildArchiveDocumentCommand(
  id: number,
  userId: number,
): DomainValidationResult<ArchiveDocumentCommand> {
  const validId = positiveInt(id, "id");
  if (!validId.ok) return validId;
  const validUserId = positiveInt(userId, "userId");
  if (!validUserId.ok) return validUserId;
  return okCommand({ id: validId.data, userId: validUserId.data });
}
