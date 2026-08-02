import "server-only";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import type { DomainValidationResult } from "@workspace/platform/server/domain-validation";
import {
  buildNotificationPublicationCommand,
  NOTIFICATION_PUBLICATION_COMMIT_GUARD_REJECTED,
  type NotificationPublicationCommand,
} from "@workspace/platform/server/notification-publishing";
import { publishConfiguredNotification } from "@workspace/platform/server/notifications";
import { prisma } from "@workspace/platform/server/prisma";
import { evaluatePermissionAction } from "@workspace/platform/server/rbac/action-grants";
import { serviceError, serviceOk } from "@workspace/platform/service-result";

import { canViewProject } from "./access";
import {
  evaluateProjectNotificationCondition,
  prepareProjectNotificationCondition,
  projectNotificationFactsFingerprint,
} from "./domain/project-notification-condition";
import {
  parseStoredProjectNotificationAudiencePolicy,
  parseStoredProjectNotificationChannelPolicy,
  resolveProjectNotificationAudience,
  type ProjectNotificationChannel,
} from "./project-notification-audience";
import {
  canCommitProjectNotificationPublication,
  createProjectNotificationPublicationIntent,
  findProjectNotificationPublicationIntent,
  findProjectNotificationRedriveSourceIntent,
  parseProjectNotificationPublicationIntentRequest,
  reactivateProjectNotificationPublicationIntentForRedrive,
  type ProjectNotificationPublicationIntentRow,
} from "./project-notification-publication-intent";
import { projectNotificationAudienceCapacity } from "./project-notification-audience-capacity";
import { evaluateProjectNotificationRulesInIsolation } from "./project-notification-evaluation-loop";
import { renewClaimedProjectNotificationSignalLease } from "./project-notification-lease";
import {
  finalizeProjectNotificationPublication,
  finalizeProjectNotificationPublicationError,
  findFinalProjectNotificationEvaluationRuleIds,
  findProjectNotificationEvaluation,
  loadProjectNotificationRuleRevision,
  lockProjectNotificationRule,
  projectNotificationCooldownDisposition,
  projectNotificationEvaluationBase,
  recordPermanentProjectNotificationRuleFailure,
  recordProjectNotificationEvaluation,
  type ProjectNotificationEvaluationRecord,
} from "./project-notification-evaluation-state";
import {
  projectNotificationConditionSnapshot,
  ProjectNotificationSignalProcessingError,
} from "./project-notification-signal-runtime";
import type {
  ClaimedProjectNotificationSignal,
  ProjectNotificationSignalKind,
  StoredProjectNotificationSnapshot,
} from "./project-notification-signal-contract";
import {
  findCompatibleDefinition,
  projectNotificationPublicationSource,
} from "./project-notification-definition-catalog";
import {
  loadProjectNotificationPreviewSnapshot,
  toProjectNotificationPreviewConditionSnapshot,
} from "./project-notification-preview-snapshot";
import {
  isNotificationPublicationRateLimit,
  isRetryableStatus,
  notificationPublicationRateLimitIssue,
  pendingProjectNotificationRuleRevisions,
  projectNotificationPublicationIdempotencyKey,
  retryableEvaluationIssue,
  selectDefinitionVariables,
} from "./project-notification-publication-runtime";
const exactReadGrantOptions = {
  grantMatch: { action: "exact" as const, resource: "exact" as const },
};

type ChannelAwarePublicationBuilder = (input: {
  source: ReturnType<typeof projectNotificationPublicationSource>;
  request: unknown;
  deliveryChannels?: readonly ProjectNotificationChannel[];
}) => Promise<DomainValidationResult<NotificationPublicationCommand>>;

const buildChannelAwareNotificationPublicationCommand =
  buildNotificationPublicationCommand as ChannelAwarePublicationBuilder;

export async function evaluatePersistedProjectNotificationSignal(input: {
  signal: ClaimedProjectNotificationSignal;
  snapshot: StoredProjectNotificationSnapshot;
}) {
  const finalRuleIds = await findFinalProjectNotificationEvaluationRuleIds({
    projectId: input.signal.projectId,
    signalKind: input.signal.signalKind,
    signalId: input.signal.signalId,
    ruleIds: input.snapshot.eligibleRuleRevisions.map((revision) => revision.ruleId),
  });
  const pendingRuleRevisions = pendingProjectNotificationRuleRevisions(
    input.snapshot.eligibleRuleRevisions,
    finalRuleIds,
  );
  const { results, retryableFailure } = await evaluateProjectNotificationRulesInIsolation({
    items: pendingRuleRevisions,
    evaluate: (eligibleRule) => evaluatePublishedRuleSerialized({
      eligibleRule,
      signal: input.signal,
      storedSnapshot: input.snapshot,
    }),
    isPermanentFailure: (error) => (
      error instanceof ProjectNotificationSignalProcessingError && error.permanent
    ),
    recordPermanentFailure: (eligibleRule, error) => (
      recordPermanentProjectNotificationRuleFailure({
        eligibleRule,
        signal: input.signal,
        errorCode: error instanceof ProjectNotificationSignalProcessingError
          ? error.code
          : "rule_evaluation_permanent_failure",
      })
    ),
    toRetryableFailure: (error) => (
      error instanceof ProjectNotificationSignalProcessingError && !error.permanent
        ? error
        : retryableEvaluationIssue(
          "rule_evaluation_failed",
          "项目通知规则评估暂时失败",
        )
    ),
    beforeEach: async () => {
      input.signal.leaseExpiresAt = await renewClaimedProjectNotificationSignalLease(input.signal);
    },
    shouldStopAfterFailure: (error) => (
      error instanceof ProjectNotificationSignalProcessingError
      && (error.code === "publication_rate_limited" || error.code === "publication_lease_lost")
    ),
  });
  if (retryableFailure) throw retryableFailure;
  return {
    processed: results.length,
    published: results.filter((result) => result.outcome === "published").length,
    skipped: results.filter((result) => (
      result.outcome === "condition_not_matched"
      || result.outcome === "cooldown"
      || result.outcome === "no_recipients"
    )).length,
    errors: results.filter((result) => result.outcome === "error").length,
  };
}

export async function previewProjectNotificationRule(input: {
  userId: number;
  projectId: number;
  ruleId: number;
}) {
  const [project, canView, canRead] = await Promise.all([
    loadProjectNotificationPreviewSnapshot(input.projectId),
    canViewProject(input.userId, input.projectId),
    evaluatePermissionAction(
      input.userId,
      "settings.notifications",
      "read",
      exactReadGrantOptions,
    ),
  ]);
  if (!project) return serviceError("项目不存在", 404);
  if (!canView || !canRead) return serviceError("无权限预览项目通知规则", 403);
  const rule = await prisma.projectNotificationRule.findFirst({
    where: { id: input.ruleId, projectId: input.projectId },
  });
  if (!rule) return serviceError("项目通知规则不存在", 404);
  if (rule.status === "archived") return serviceError("已归档规则不能预览", 409);

  const condition = prepareProjectNotificationCondition(parseJson(rule.conditionJson));
  const audience = parseStoredProjectNotificationAudiencePolicy(rule.audiencePolicyJson);
  const channels = parseStoredProjectNotificationChannelPolicy(rule.channelPolicyJson);
  if (!condition.ok || !audience.ok || !channels.ok) {
    return serviceError("项目通知规则持久化配置无效", 500);
  }
  const signalKind = rule.eventType as ProjectNotificationSignalKind;
  const snapshot = toProjectNotificationPreviewConditionSnapshot(project, signalKind, "preview");
  const factsFingerprint = projectNotificationFactsFingerprint(snapshot);
  const matched = evaluateProjectNotificationCondition({
    condition: condition.data.condition,
    snapshot,
    businessDate: workspaceBusinessDate(new Date()),
  });
  if (!matched) {
    return serviceOk({
      ruleId: rule.id,
      revision: rule.revision,
      matched: false,
      audienceUsernames: [],
      variables: {},
      factsFingerprint,
      blockedReason: "condition_not_matched",
    });
  }
  const definition = await findCompatibleDefinition(input.projectId, rule.definitionKey);
  if (!definition) {
    return serviceOk({
      ruleId: rule.id,
      revision: rule.revision,
      matched: true,
      audienceUsernames: [],
      variables: {},
      factsFingerprint,
      blockedReason: "definition_unavailable",
    });
  }
  const audienceUsernames = await resolveProjectNotificationAudience({
    projectId: input.projectId,
    policy: audience.data,
    asOf: new Date(),
  });
  const capacity = projectNotificationAudienceCapacity(audienceUsernames.length);
  const variables = selectDefinitionVariables(definition.variableKeys, project, snapshot);
  return serviceOk({
    ruleId: rule.id,
    revision: rule.revision,
    matched: true,
    audienceUsernames,
    audienceCount: capacity.count,
    audienceMaxCount: capacity.maxCount,
    variables: variables.ok ? variables.data : {},
    factsFingerprint,
    blockedReason: capacity.exceeded
      ? "audience_capacity_exceeded"
      : audienceUsernames.length === 0
        ? "no_recipients"
        : variables.ok
          ? null
          : "variables_unavailable",
  });
}

async function evaluatePublishedRuleSerialized(input: {
  eligibleRule: { ruleId: number; revision: number; publishedAt: string };
  signal: ClaimedProjectNotificationSignal;
  storedSnapshot: StoredProjectNotificationSnapshot;
}) {
  const prepared = await preparePublishedRuleEvaluation(input);
  if (prepared.kind === "final") return prepared.evaluation;
  let request: ReturnType<typeof parseProjectNotificationPublicationIntentRequest>;
  try {
    request = parseProjectNotificationPublicationIntentRequest(prepared.intent);
  } catch {
    throw new ProjectNotificationSignalProcessingError(
      "publication_intent_invalid",
      "项目通知发布意图请求无效",
      true,
    );
  }
  const publicationCommand = await buildChannelAwareNotificationPublicationCommand({
    source: projectNotificationPublicationSource(input.signal.projectId),
    deliveryChannels: request.deliveryChannels,
    request: {
      definitionKey: request.definitionKey,
      idempotencyKey: request.idempotencyKey,
      usernames: request.usernames,
      variables: request.variables,
    },
  });
  if (!publicationCommand.ok) {
    if (isNotificationPublicationRateLimit(publicationCommand.issue.details)) {
      throw notificationPublicationRateLimitIssue(publicationCommand.issue.details);
    }
    if (isRetryableStatus(publicationCommand.issue.status)) {
      throw retryableEvaluationIssue("publication_build_failed", "项目通知发布命令暂时无法构建");
    }
    return finalizeIntentError(input, prepared.intent, "publication_build_rejected");
  }
  if (
    publicationCommand.data.kind === "publish"
    && publicationCommand.data.definition.allowProjectMonitoring !== true
  ) {
    return finalizeIntentError(input, prepared.intent, "definition_monitoring_forbidden");
  }
  const publication = await publishConfiguredNotification(
    publicationCommand.data,
    (tx) => canCommitProjectNotificationPublication(tx, {
      intentId: prepared.intent.id,
      signalRecordId: input.signal.id,
      leaseToken: input.signal.leaseToken,
      attemptCount: input.signal.attemptCount,
    }),
  );
  if (!publication.ok) {
    if (publication.details?.code === NOTIFICATION_PUBLICATION_COMMIT_GUARD_REJECTED) {
      throw retryableEvaluationIssue(
        "publication_lease_lost",
        "项目通知发布租约已失效",
      );
    }
    if (isNotificationPublicationRateLimit(publication.details)) {
      throw notificationPublicationRateLimitIssue(publication.details);
    }
    if (isRetryableStatus(publication.status)) {
      throw retryableEvaluationIssue("publication_commit_failed", "项目通知发布暂时失败");
    }
    return finalizeIntentError(input, prepared.intent, "publication_commit_rejected");
  }
  return finalizeIntentPublished(input, prepared.intent, publication.data.publicationId);
}

async function preparePublishedRuleEvaluation(input: {
  eligibleRule: { ruleId: number; revision: number; publishedAt: string };
  signal: ClaimedProjectNotificationSignal;
  storedSnapshot: StoredProjectNotificationSnapshot;
}): Promise<
  | { kind: "final"; evaluation: ProjectNotificationEvaluationRecord | null }
  | { kind: "intent"; intent: ProjectNotificationPublicationIntentRow }
> {
  const { eligibleRule, signal, storedSnapshot } = input;
  return prisma.$transaction(async (tx) => {
    const lockedHead = await lockProjectNotificationRule(tx, eligibleRule.ruleId);
    if (!lockedHead || lockedHead.projectId !== signal.projectId) {
      return { kind: "final" as const, evaluation: null };
    }
    const currentMatches = lockedHead.status === "published"
      && lockedHead.publishedRevision === eligibleRule.revision
      && lockedHead.publishedAt !== null
      && lockedHead.publishedAt.getTime() <= signal.occurredAt.getTime();
    const pinnedMatches = new Date(eligibleRule.publishedAt).getTime() <= signal.occurredAt.getTime();
    if (!currentMatches && !pinnedMatches) return { kind: "final" as const, evaluation: null };

    const existing = await findProjectNotificationEvaluation(tx, eligibleRule.ruleId, signal);
    if (existing) return { kind: "final" as const, evaluation: existing };
    const revision = await loadProjectNotificationRuleRevision(tx, eligibleRule);
    if (!revision || revision.eventType !== signal.signalKind) {
      return { kind: "final" as const, evaluation: null };
    }
    const existingIntent = await findProjectNotificationPublicationIntent(tx, {
      ruleId: eligibleRule.ruleId,
      signalKind: signal.signalKind,
      signalId: signal.signalId,
    });
    if (existingIntent?.status === "committed" && existingIntent.publicationId) {
      return {
        kind: "final" as const,
        evaluation: await recordProjectNotificationEvaluation(tx, {
          ...projectNotificationEvaluationBase(revision, signal, new Date()),
          outcome: "published",
          publicationId: existingIntent.publicationId,
        }),
      };
    }
    if (existingIntent?.status === "failed") {
      return {
        kind: "final" as const,
        evaluation: await recordProjectNotificationEvaluation(tx, {
          ...projectNotificationEvaluationBase(revision, signal, new Date()),
          outcome: "error",
          errorCode: existingIntent.lastErrorCode ?? "publication_intent_failed",
        }),
      };
    }
    if (existingIntent) return { kind: "intent" as const, intent: existingIntent };
    const sourceIntent = await findProjectNotificationRedriveSourceIntent(tx, {
      redriveSignalRecordId: signal.id,
      ruleId: eligibleRule.ruleId,
    });
    if (sourceIntent?.status === "committed" && sourceIntent.publicationId) {
      const evaluation = await recordProjectNotificationEvaluation(tx, {
        ...projectNotificationEvaluationBase(revision, signal, new Date()),
        outcome: "published",
        publicationId: sourceIntent.publicationId,
      });
      return { kind: "final" as const, evaluation };
    }
    if (sourceIntent?.status === "publishing") {
      return { kind: "intent" as const, intent: sourceIntent };
    }
    if (sourceIntent?.status === "failed") {
      const reactivated = await reactivateProjectNotificationPublicationIntentForRedrive(tx, {
        intentId: sourceIntent.id,
        redriveSignalRecordId: signal.id,
        reactivatedAt: new Date(),
      });
      if (!reactivated) {
        throw retryableEvaluationIssue(
          "redrive_source_publication_state_changed",
          "原项目通知发布状态已变化",
        );
      }
      return { kind: "intent" as const, intent: reactivated };
    }

    const now = new Date();
    const base = projectNotificationEvaluationBase(revision, signal, now);
    const condition = prepareProjectNotificationCondition(parseJson(revision.conditionJson));
    const audience = parseStoredProjectNotificationAudiencePolicy(revision.audiencePolicyJson);
    const channels = parseStoredProjectNotificationChannelPolicy(revision.channelPolicyJson);
    if (!condition.ok) return finalEvaluation(await recordProjectNotificationEvaluation(tx, { ...base, outcome: "error", errorCode: "condition_invalid" }));
    if (!audience.ok) return finalEvaluation(await recordProjectNotificationEvaluation(tx, { ...base, outcome: "error", errorCode: "audience_policy_invalid" }));
    if (!channels.ok) return finalEvaluation(await recordProjectNotificationEvaluation(tx, { ...base, outcome: "error", errorCode: "channel_policy_invalid" }));
    const conditionSnapshot = projectNotificationConditionSnapshot(storedSnapshot);
    const matched = evaluateProjectNotificationCondition({
      condition: condition.data.condition,
      snapshot: conditionSnapshot,
      businessDate: workspaceBusinessDate(new Date(storedSnapshot.signal.occurredAt)),
    });
    if (!matched) return finalEvaluation(await recordProjectNotificationEvaluation(tx, { ...base, outcome: "condition_not_matched" }));
    const cooldownDisposition = await projectNotificationCooldownDisposition(tx, revision, now);
    if (cooldownDisposition === "in_flight") {
      throw retryableEvaluationIssue(
        "publication_in_flight",
        "同一项目通知规则已有发布处理中",
      );
    }
    if (cooldownDisposition === "cooldown") {
      return finalEvaluation(await recordProjectNotificationEvaluation(tx, { ...base, outcome: "cooldown" }));
    }
    const definition = await findCompatibleDefinition(signal.projectId, revision.definitionKey);
    if (!definition) return finalEvaluation(await recordProjectNotificationEvaluation(tx, { ...base, outcome: "error", errorCode: "definition_unavailable" }));
    const audienceUsernames = await resolveProjectNotificationAudience({
      projectId: signal.projectId,
      policy: audience.data,
      asOf: signal.occurredAt,
    });
    const capacity = projectNotificationAudienceCapacity(audienceUsernames.length);
    if (capacity.exceeded) {
      return finalEvaluation(await recordProjectNotificationEvaluation(tx, {
        ...base,
        outcome: "error",
        errorCode: "audience_capacity_exceeded",
      }));
    }
    if (audienceUsernames.length === 0) return finalEvaluation(await recordProjectNotificationEvaluation(tx, { ...base, outcome: "no_recipients" }));
    const variables = selectDefinitionVariables(definition.variableKeys, storedSnapshot.project, conditionSnapshot);
    if (!variables.ok) return finalEvaluation(await recordProjectNotificationEvaluation(tx, { ...base, outcome: "error", errorCode: "variables_unavailable" }));
    const command = await buildChannelAwareNotificationPublicationCommand({
      source: projectNotificationPublicationSource(signal.projectId),
      deliveryChannels: channels.data.channels,
      request: {
        definitionKey: revision.definitionKey,
        idempotencyKey: projectNotificationPublicationIdempotencyKey(revision, signal.signalId),
        usernames: audienceUsernames,
        variables: variables.data,
      },
    });
    if (!command.ok) {
      if (isNotificationPublicationRateLimit(command.issue.details)) {
        throw notificationPublicationRateLimitIssue(command.issue.details);
      }
      if (isRetryableStatus(command.issue.status)) throw retryableEvaluationIssue("publication_build_failed", "项目通知发布命令暂时无法构建");
      return finalEvaluation(await recordProjectNotificationEvaluation(tx, { ...base, outcome: "error", errorCode: "publication_build_rejected" }));
    }
    if (command.data.kind === "replay") {
      return finalEvaluation(await recordProjectNotificationEvaluation(tx, {
        ...base,
        outcome: "published",
        publicationId: command.data.receipt.publicationId,
      }));
    }
    if (command.data.definition.allowProjectMonitoring !== true) {
      return finalEvaluation(await recordProjectNotificationEvaluation(tx, { ...base, outcome: "error", errorCode: "definition_monitoring_forbidden" }));
    }
    const intent = await createProjectNotificationPublicationIntent(tx, {
      ruleId: revision.ruleId,
      ruleRevision: revision.revision,
      projectId: signal.projectId,
      signalKind: signal.signalKind,
      signalId: signal.signalId,
      request: {
        definitionKey: command.data.request.definitionKey,
        idempotencyKey: command.data.request.idempotencyKey,
        usernames: command.data.request.usernames,
        variables: command.data.request.variables,
        deliveryChannels: command.data.deliveryChannels,
      },
      preparedAt: now,
    });
    return { kind: "intent" as const, intent };
  }, { maxWait: 10_000, timeout: 30_000 });
}

async function finalizeIntentPublished(
  input: { signal: ClaimedProjectNotificationSignal },
  intent: ProjectNotificationPublicationIntentRow,
  publicationId: string,
) {
  try {
    return await finalizeProjectNotificationPublication({
      intent,
      signal: input.signal,
      publicationId,
    });
  } catch {
    throw retryableEvaluationIssue(
      "publication_finalize_failed",
      "项目通知发布结果暂时无法归档",
    );
  }
}

async function finalizeIntentError(
  input: { signal: ClaimedProjectNotificationSignal },
  intent: ProjectNotificationPublicationIntentRow,
  errorCode: string,
) {
  try {
    return await finalizeProjectNotificationPublicationError({
      intent,
      signal: input.signal,
      errorCode,
    });
  } catch {
    throw retryableEvaluationIssue(
      "publication_finalize_failed",
      "项目通知发布结果暂时无法归档",
    );
  }
}

function finalEvaluation(evaluation: ProjectNotificationEvaluationRecord | null) {
  return { kind: "final" as const, evaluation };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
