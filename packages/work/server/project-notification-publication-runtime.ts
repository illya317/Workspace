import "server-only";

import { createHash } from "node:crypto";

import { NOTIFICATION_PUBLICATION_RATE_LIMITED } from "@workspace/platform/server/notification-publishing";

import type { PublishedProjectNotificationRuleRevision } from "./project-notification-evaluation-state";
import { ProjectNotificationSignalProcessingError } from "./project-notification-signal-runtime";
import type { ProjectNotificationSnapshot } from "./domain/project-notification-condition";

type TrustedNotificationVariables = Record<string, string | number | boolean>;

type ProjectVariableSource = {
  id: number;
  code: string | null;
  name: string;
};

export function projectNotificationPublicationIdempotencyKey(
  revision: Pick<PublishedProjectNotificationRuleRevision, "ruleId" | "revision">,
  signalId: string,
) {
  const signalHash = createHash("sha256").update(signalId).digest("hex").slice(0, 32);
  return `project-rule:${revision.ruleId}:r${revision.revision}:${signalHash}`;
}

export function pendingProjectNotificationRuleRevisions<T extends { ruleId: number }>(
  revisions: readonly T[],
  finalRuleIds: ReadonlySet<number>,
) {
  return revisions.filter((revision) => !finalRuleIds.has(revision.ruleId));
}

export function retryableEvaluationIssue(
  code: string,
  safeSummary: string,
  retryAt?: Date,
) {
  return new ProjectNotificationSignalProcessingError(code, safeSummary, false, retryAt);
}

export function isNotificationPublicationRateLimit(
  details: Record<string, unknown> | undefined,
): details is { code: typeof NOTIFICATION_PUBLICATION_RATE_LIMITED; retryAt: string } {
  return details?.code === NOTIFICATION_PUBLICATION_RATE_LIMITED
    && typeof details.retryAt === "string";
}

export function notificationPublicationRateLimitIssue(details: { retryAt: string }) {
  const parsedRetryAt = new Date(details.retryAt);
  return retryableEvaluationIssue(
    "publication_rate_limited",
    "项目通知发布达到来源速率上限",
    Number.isNaN(parsedRetryAt.getTime()) ? undefined : parsedRetryAt,
  );
}

export function isRetryableStatus(status: number | undefined) {
  return status === undefined || status === 429 || status >= 500;
}

export function selectDefinitionVariables(
  variableKeys: readonly string[],
  project: ProjectVariableSource,
  snapshot: ProjectNotificationSnapshot,
): { ok: true; data: TrustedNotificationVariables } | { ok: false; missing: string[] } {
  const trusted: Record<string, string | number | boolean | undefined> = {
    project_id: project.id,
    project_code: project.code ?? undefined,
    project_name: project.name,
    project_status: snapshot.project.status,
    project_level: snapshot.project.projectLevel,
    project_completion_percent: snapshot.project.completionPercent ?? undefined,
    project_planned_start_date: snapshot.project.plannedStartDate ?? undefined,
    project_planned_end_date: snapshot.project.plannedEndDate ?? undefined,
    project_risk_present: snapshot.project.riskPresent,
    project_is_archived: snapshot.project.isArchived,
    signal_kind: snapshot.signal.kind,
    signal_changed_field: snapshot.signal.changedField,
  };
  const missing = variableKeys.filter((key) => trusted[key] === undefined);
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    data: Object.fromEntries(variableKeys.map((key) => [key, trusted[key]!])),
  };
}
