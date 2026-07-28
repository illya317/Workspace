import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import type { ExternalRelatedPartyCreateInput } from "../schemas";

export interface ExternalRelatedPartyCreateCommand {
  partyId: number;
  userId: number;
  expectedVersion: number;
  relatedPartyType: ExternalRelatedPartyCreateInput["relatedPartyType"];
  idempotencyKey: string;
}

export interface ExternalRelatedPartyDeleteCommand {
  partyId: number;
  userId: number;
  expectedVersion: number;
  idempotencyKey: string;
}

function positiveInt(value: number | undefined, field: string) {
  return value !== undefined && Number.isInteger(value) && value > 0
    ? okCommand(value)
    : failCommand(`${field} 无效`, 400, field);
}

export function buildExternalRelatedPartyCreateCommand(
  input: ExternalRelatedPartyCreateInput,
  userId: number,
  expectedVersion: number | undefined,
  idempotencyKey: string,
): DomainValidationResult<ExternalRelatedPartyCreateCommand> {
  const validPartyId = positiveInt(input.partyId, "partyId");
  if (!validPartyId.ok) return validPartyId;
  const validUserId = positiveInt(userId, "userId");
  if (!validUserId.ok) return validUserId;
  const validVersion = positiveInt(expectedVersion, "expectedVersion");
  if (!validVersion.ok) return validVersion;
  if (!idempotencyKey.trim()) return failCommand("缺少 Idempotency-Key 请求头", 400);
  return okCommand({
    partyId: validPartyId.data,
    userId: validUserId.data,
    expectedVersion: validVersion.data,
    relatedPartyType: input.relatedPartyType,
    idempotencyKey: idempotencyKey.trim(),
  });
}

export function buildExternalRelatedPartyDeleteCommand(
  partyId: number,
  userId: number,
  expectedVersion: number | undefined,
  idempotencyKey: string,
): DomainValidationResult<ExternalRelatedPartyDeleteCommand> {
  const validPartyId = positiveInt(partyId, "partyId");
  if (!validPartyId.ok) return validPartyId;
  const validUserId = positiveInt(userId, "userId");
  if (!validUserId.ok) return validUserId;
  const validVersion = positiveInt(expectedVersion, "expectedVersion");
  if (!validVersion.ok) return validVersion;
  if (!idempotencyKey.trim()) return failCommand("缺少 Idempotency-Key 请求头", 400);
  return okCommand({
    partyId: validPartyId.data,
    userId: validUserId.data,
    expectedVersion: validVersion.data,
    idempotencyKey: idempotencyKey.trim(),
  });
}
