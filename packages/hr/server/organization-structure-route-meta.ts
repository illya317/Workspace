import { readRequestExpectedVersion } from "@workspace/platform/server/api";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { directCommandId } from "@workspace/platform/server/direct-command-meta";

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
  const kind = typeof input.kind === "string" ? input.kind : "schedule";
  const reason = typeof input.reason === "string" ? input.reason.trim() || null : null;
  return {
    kind,
    effectiveOn: typeof input.effectiveOn === "string" && input.effectiveOn.trim()
      ? input.effectiveOn.trim()
      : workspaceBusinessDate(new Date()),
    expectedSequence: input.expectedSequence ?? readRequestExpectedVersion(request),
    idempotencyKey: directCommandId(request),
    reason: reason ?? (kind === "schedule" ? null : "直接执行组织结构变更"),
    targetVersionId: input.targetVersionId ?? null,
  };
}

export function organizationArchiveLifecycleMetaFromRequest(
  request: Request,
  input: {
    archived: boolean;
    version: number;
    effectiveOn?: string;
    reason?: string | null;
  },
) {
  return organizationStructureLifecycleMetaFromRequest(request, {
    expectedSequence: readRequestExpectedVersion(request) ?? input.version,
    effectiveOn: input.effectiveOn,
    kind: input.archived ? "end-date" : "schedule",
    reason: input.reason,
  });
}
