import { postJson, putJson, requestJson } from "@workspace/platform/ui/api-client";
import type { ProjectNotificationRule, ProjectNotificationRuleDraft } from "./notification-governance-model";

export type ProjectNotificationDefinitionOption = {
  key: string;
  label: string;
  revision: number;
  variableKeys: string[];
};

export type ProjectNotificationQueueFailure = {
  signalRecordId: string;
  signalKind: string;
  signalId: string;
  attemptCount: number;
  ruleIds: number[];
  errorCode: string | null;
  errorSummary: string | null;
  failedAt: string;
};

export type ProjectNotificationRulesResponse = {
  projectId: number;
  rules: ProjectNotificationRule[];
  availableDefinitions: ProjectNotificationDefinitionOption[];
  queueHealth: {
    counts: { pending: number; leased: number; retrying: number; failed: number };
    backlogCount: number;
    recentFailures: ProjectNotificationQueueFailure[];
  };
  permissions: { canConfigure: boolean; canAudit: boolean };
};

export type ProjectNotificationEvaluation = {
  id: string;
  outcome: string;
  signalKind: string;
  signalId: string;
  publicationId: string | null;
  errorCode?: string | null;
  evaluatedAt: string;
};

const projectRulesPath = (projectId: number) => `/api/modules/work/projects/${projectId}/notification-rules`;

export function loadProjectNotificationRules(projectId: number) {
  return requestJson<ProjectNotificationRulesResponse>(projectRulesPath(projectId));
}

export function saveProjectNotificationRule(projectId: number, rule: ProjectNotificationRule | null, draft: ProjectNotificationRuleDraft) {
  return rule
    ? putJson<{ rule: ProjectNotificationRule }>(`${projectRulesPath(projectId)}/${rule.id}`, { ...draft, version: rule.version })
    : postJson<{ rule: ProjectNotificationRule }>(projectRulesPath(projectId), draft);
}

export function transitionProjectNotificationRule(projectId: number, rule: ProjectNotificationRule, action: "publish" | "archive") {
  return postJson<{ rule: ProjectNotificationRule }>(`${projectRulesPath(projectId)}/${rule.id}/${action}`, { version: rule.version });
}

export function previewProjectNotificationRule(projectId: number, ruleId: number) {
  return postJson<{
    ruleId: number;
    revision: number;
    matched: boolean;
    audienceUsernames: string[];
    audienceCount?: number;
    audienceMaxCount?: number;
    variables: Record<string, string | number | boolean | null>;
    factsFingerprint: string;
    blockedReason: string | null;
  }>(`${projectRulesPath(projectId)}/${ruleId}/preview`, {});
}

export function loadProjectNotificationEvaluations(projectId: number, ruleId: number) {
  return requestJson<{ items: ProjectNotificationEvaluation[]; total: number }>(
    `${projectRulesPath(projectId)}/${ruleId}/evaluations?page=1&pageSize=20`,
  );
}

export function redriveProjectNotificationSignal(
  projectId: number,
  input: { signalId: string; expectedAttemptCount: number; reason: string },
) {
  return postJson<{
    sourceSignalId: string;
    redriveSignalId: string;
    replayed: boolean;
    eligibleRuleCount: number | null;
    auditEventId: string;
  }>(`/api/modules/work/projects/${projectId}/notification-signals/redrive`, input);
}
