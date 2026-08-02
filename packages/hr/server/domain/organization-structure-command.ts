import { businessTemporalRequestFingerprint } from "@workspace/platform/server/business-temporal-idempotency";
import type { OrganizationLifecycleMeta } from "./organization-effective-version-validation";

export function organizationStructureRequestFingerprint(
  aggregateType: string,
  aggregateId: number | null,
  meta: OrganizationLifecycleMeta,
  payload: unknown,
) {
  return businessTemporalRequestFingerprint({
    aggregate: aggregateType,
    aggregateId,
    commandKind: meta.kind,
    request: {
      effectiveOn: meta.effectiveOn,
      expectedSequence: meta.expectedSequence,
      targetVersionId: meta.targetVersionId ?? null,
      reason: meta.reason ?? null,
      payload,
    },
  });
}

export function positionReportOverrideBatchRequestFingerprint(input: {
  positionId: number;
  overrides: unknown[];
  lifecycle: unknown;
}) {
  const lifecycle = input.lifecycle && typeof input.lifecycle === "object"
    ? Object.fromEntries(
        Object.entries(input.lifecycle as Record<string, unknown>)
          .filter(([key]) => key !== "idempotencyKey"),
      )
    : input.lifecycle;
  return businessTemporalRequestFingerprint({
    aggregate: "PositionReportOverrideBatch",
    aggregateId: input.positionId,
    commandKind: "replace-set",
    request: { overrides: input.overrides, lifecycle },
  });
}

export function organizationStructureChangeRecord(input: {
  id: string;
  aggregateType: string;
  aggregateId: number;
  meta: OrganizationLifecycleMeta;
  userId: number;
  manifest: Record<string, unknown>;
  requestFingerprint: string;
}) {
  return {
    id: input.id,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    commandKind: input.meta.kind,
    effectiveOn: input.meta.effectiveOn,
    expectedSequence: input.meta.expectedSequence,
    idempotencyKey: input.meta.idempotencyKey,
    requestFingerprint: input.requestFingerprint,
    reason: input.meta.reason,
    effectManifestJson: JSON.stringify(input.manifest),
    actorUserId: input.userId,
  };
}
