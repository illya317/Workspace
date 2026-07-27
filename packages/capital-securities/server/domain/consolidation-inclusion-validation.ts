import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface SetConsolidationInclusionInput {
  relationId: unknown;
  expectedVersion: unknown;
  included: unknown;
  effectiveDate: unknown;
}

export function buildSetConsolidationInclusionCommand(
  input: SetConsolidationInclusionInput,
  userId: unknown,
) {
  const relationId = Number(input.relationId);
  if (!Number.isInteger(relationId) || relationId <= 0) {
    return failCommand("股权关系无效", 400, "relationId");
  }
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) {
    return failCommand("股权关系版本无效", 400, "expectedVersion");
  }
  if (typeof input.included !== "boolean") {
    return failCommand("并表选择必须为是或否", 400, "included");
  }
  const effectiveDate = typeof input.effectiveDate === "string" ? input.effectiveDate.trim() : "";
  const parsedDate = DATE_PATTERN.test(effectiveDate)
    ? new Date(`${effectiveDate}T00:00:00.000Z`)
    : null;
  if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== effectiveDate) {
    return failCommand("并表生效日期无效", 400, "effectiveDate");
  }
  const actorUserId = Number(userId);
  if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
    return failCommand("操作人无效", 400, "userId");
  }
  return okCommand({ relationId, expectedVersion, included: input.included, effectiveDate, actorUserId });
}

export type SetConsolidationInclusionCommand = Extract<
  ReturnType<typeof buildSetConsolidationInclusionCommand>,
  { ok: true }
>["data"];
