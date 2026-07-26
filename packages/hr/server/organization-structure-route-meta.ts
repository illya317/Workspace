import { readRequestExpectedVersion } from "@workspace/platform/server/api";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";

export function organizationStructureLifecycleMetaFromRequest(
  request: Request,
  input: {
    expectedSequence?: unknown;
    effectiveOn?: unknown;
    kind?: unknown;
    reason?: unknown;
    targetVersionId?: unknown;
  } = {},
) {
  return {
    kind: typeof input.kind === "string" ? input.kind : "schedule",
    effectiveOn: typeof input.effectiveOn === "string" && input.effectiveOn.trim()
      ? input.effectiveOn.trim()
      : workspaceBusinessDate(new Date()),
    expectedSequence: input.expectedSequence ?? readRequestExpectedVersion(request),
    idempotencyKey: request.headers.get("idempotency-key")?.trim() ?? "",
    reason: typeof input.reason === "string" ? input.reason.trim() || null : null,
    targetVersionId: input.targetVersionId ?? null,
  };
}
