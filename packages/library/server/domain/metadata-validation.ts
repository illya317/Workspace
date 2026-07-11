import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import type { LibraryMetadataUpdateInput } from "../schemas";

export interface UpdateDocumentMetadataCommand {
  id: number;
  userId: number;
  data: Record<string, unknown>;
  tags?: string[];
}

export interface SetDocumentLifecycleCommand {
  id: number;
  userId: number;
  status: "active" | "archived";
}

function positiveInt(value: number, field: string) {
  return Number.isInteger(value) && value > 0 ? okCommand(value) : failCommand(`${field} must be a positive integer`, 400, field);
}

export function buildUpdateDocumentMetadataCommand(
  id: number,
  input: LibraryMetadataUpdateInput,
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
  if (input.categoryCode !== undefined) data.categoryCode = input.categoryCode;
  if (input.categoryName !== undefined) data.categoryName = input.categoryName;
  if (input.subcategoryPath !== undefined) data.subcategoryPath = input.subcategoryPath;
  if (input.confidentialityLevel !== undefined) data.confidentialityLevel = input.confidentialityLevel;

  const tags = input.tags === undefined
    ? undefined
    : [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))];

  if (Object.keys(data).length === 0 && tags === undefined) {
    return failCommand("At least one metadata field is required", 400);
  }

  return okCommand({ id: validId.data, userId: validUserId.data, data, tags });
}

export function buildSetDocumentLifecycleCommand(
  id: number,
  userId: number,
  archived: boolean,
): DomainValidationResult<SetDocumentLifecycleCommand> {
  const validId = positiveInt(id, "id");
  if (!validId.ok) return validId;
  const validUserId = positiveInt(userId, "userId");
  if (!validUserId.ok) return validUserId;
  return okCommand({
    id: validId.data,
    userId: validUserId.data,
    status: archived ? "archived" : "active",
  });
}
