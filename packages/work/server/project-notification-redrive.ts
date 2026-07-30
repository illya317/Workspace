import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { evaluatePermissionAction } from "@workspace/platform/server/rbac/action-grants";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { serviceError, serviceOk } from "@workspace/platform/service-result";

import { canManageProject } from "./access";
import {
  findProjectNotificationRootSignal,
  reconcileProjectNotificationPublicationIntentsForSignal,
} from "./project-notification-publication-intent";
import {
  parseClaimedProjectNotificationSnapshot,
  type ClaimedProjectNotificationSignal,
} from "./project-notification-signal-contract";
import { bestEffortDrainProjectNotificationSignals } from "./project-notification-signals";

const exactConfigureGrantOptions = {
  grantMatch: { action: "exact" as const, resource: "exact" as const },
};

type FailedSignalRow = Pick<
  ClaimedProjectNotificationSignal,
  | "id"
  | "projectId"
  | "projectVersion"
  | "signalKind"
  | "signalId"
  | "changedField"
  | "snapshotJson"
  | "factsFingerprint"
  | "occurredAt"
  | "attemptCount"
  | "createdAt"
> & {
  status: string;
  lastErrorCode: string | null;
};

type RuleEvaluationState = {
  ruleId: number;
  outcome: string;
  errorCode: string | null;
};

type RuleIntentState = { ruleId: number; status: string };

type RedriveEventRow = {
  id: string;
  projectId: number;
  redriveSignalRecordId: string;
  reason: string;
};

export async function redriveFailedProjectNotificationSignal(input: {
  userId: number;
  projectId: number;
  signalId: string;
  expectedAttemptCount: number;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (
    !Number.isInteger(input.projectId)
    || input.projectId <= 0
    || !Number.isInteger(input.expectedAttemptCount)
    || input.expectedAttemptCount <= 0
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(input.signalId)
    || reason.length === 0
    || reason.length > 500
  ) {
    return serviceError("项目通知重试请求无效", 400);
  }
  const [project, canManage, canConfigure] = await Promise.all([
    prisma.project.findUnique({ where: { id: input.projectId }, select: { id: true } }),
    canManageProject(input.userId, input.projectId),
    evaluatePermissionAction(
      input.userId,
      "settings.notifications",
      "configure",
      exactConfigureGrantOptions,
    ),
  ]);
  if (!project) return serviceError("项目不存在", 404);
  if (!canManage || !canConfigure) return serviceError("无权限重试项目通知死信", 403);

  const now = new Date();
  const redriveSignalId = projectNotificationRedriveSignalId(
    input.signalId,
    input.expectedAttemptCount,
  );
  const prepared = await prisma.$transaction(async (tx) => {
    const [signal] = await tx.$queryRaw<FailedSignalRow[]>(Prisma.sql`
      SELECT
        "id", "projectId", "projectVersion", "signalKind", "signalId", "changedField",
        "snapshotJson", "factsFingerprint", "occurredAt", "status", "attemptCount",
        "lastErrorCode", "createdAt"
      FROM "ProjectNotificationSignal"
      WHERE "projectId" = ${input.projectId}
        AND "signalId" = ${input.signalId}
      FOR UPDATE
    `);
    if (!signal) return { kind: "not_found" as const };
    if (signal.status !== "failed") return { kind: "not_failed" as const };
    if (signal.attemptCount !== input.expectedAttemptCount) {
      return { kind: "cas_conflict" as const, attemptCount: signal.attemptCount };
    }
    const snapshot = parseFailedSignalSnapshot(signal);
    if (!snapshot) return { kind: "snapshot_invalid" as const };
    const rootSignal = await findProjectNotificationRootSignal(tx, signal.id);
    if (!rootSignal || rootSignal.projectId !== signal.projectId) {
      return { kind: "lineage_invalid" as const };
    }
    await reconcileProjectNotificationPublicationIntentsForSignal(tx, {
      projectId: signal.projectId,
      signalRecordId: signal.id,
      evaluationSignalKind: signal.signalKind,
      evaluationSignalId: signal.signalId,
      reconciledAt: now,
    });
    const [existingEvent] = await tx.$queryRaw<RedriveEventRow[]>(Prisma.sql`
      SELECT "id", "projectId", "redriveSignalRecordId", "reason"
      FROM "ProjectNotificationSignalRedriveEvent"
      WHERE "sourceSignalRecordId" = ${signal.id}
        AND "sourceAttemptCount" = ${input.expectedAttemptCount}
      LIMIT 1
    `);
    if (existingEvent) {
      if (existingEvent.projectId !== input.projectId || existingEvent.reason !== reason) {
        return { kind: "lineage_conflict" as const };
      }
      return {
        kind: "ready" as const,
        replayed: true,
        eligibleRuleCount: null,
        auditEventId: existingEvent.id,
      };
    }
    const [existingSignal] = await tx.$queryRaw<Array<{
      projectId: number;
      signalId: string;
    }>>(Prisma.sql`
      SELECT "projectId", "signalId"
      FROM "ProjectNotificationSignal"
      WHERE "signalId" = ${redriveSignalId}
      LIMIT 1
    `);
    if (existingSignal) return { kind: "collision" as const };
    const evaluations = await tx.$queryRaw<RuleEvaluationState[]>(Prisma.sql`
      SELECT "ruleId", "outcome", "errorCode"
      FROM "ProjectNotificationEvaluation"
      WHERE "signalKind" = ${signal.signalKind}
        AND "signalId" = ${signal.signalId}
    `);
    const intents = await tx.$queryRaw<RuleIntentState[]>(Prisma.sql`
      SELECT "ruleId", "status"
      FROM "ProjectNotificationPublicationIntent"
      WHERE "signalKind" = ${rootSignal.signalKind}
        AND "signalId" = ${rootSignal.signalId}
      FOR UPDATE
    `);
    if (intents.some((intent) => intent.status === "publishing")) {
      return { kind: "intent_in_flight" as const };
    }
    const eligibleRuleRevisions = selectProjectNotificationRedriveRules({
      eligibleRuleRevisions: snapshot.eligibleRuleRevisions,
      evaluations,
      intents,
      failureCode: signal.lastErrorCode,
    });
    if (eligibleRuleRevisions.length === 0) return { kind: "nothing_to_redrive" as const };
    const redriveSignalRecordId = randomUUID();
    const auditEventId = randomUUID();
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ProjectNotificationSignal" (
        "id", "projectId", "projectVersion", "signalKind", "signalId", "changedField",
        "snapshotJson", "factsFingerprint", "occurredAt", "status", "attemptCount",
        "nextAttemptAt", "createdAt", "updatedAt"
      ) VALUES (
        ${redriveSignalRecordId}, ${signal.projectId}, ${signal.projectVersion}, ${signal.signalKind},
        ${redriveSignalId}, ${signal.changedField},
        ${JSON.stringify({ ...snapshot, eligibleRuleRevisions })}, ${signal.factsFingerprint},
        ${signal.occurredAt}, 'pending', 0, ${now}, ${now}, ${now}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ProjectNotificationSignalRedriveEvent" (
        "id", "projectId", "sourceSignalRecordId", "redriveSignalRecordId",
        "sourceAttemptCount", "actorUserId", "reason", "occurredAt"
      ) VALUES (
        ${auditEventId}, ${signal.projectId}, ${signal.id}, ${redriveSignalRecordId},
        ${signal.attemptCount}, ${input.userId}, ${reason}, ${now}
      )
    `);
    return {
      kind: "ready" as const,
      replayed: false,
      eligibleRuleCount: eligibleRuleRevisions.length,
      auditEventId,
    };
  }, { maxWait: 10_000, timeout: 30_000 });

  if (prepared.kind === "not_found") return serviceError("项目通知死信不存在", 404);
  if (prepared.kind === "not_failed") return serviceError("只有 failed/dead-letter 信号可以重试", 409);
  if (prepared.kind === "cas_conflict") {
    return serviceError("项目通知死信已变化，请刷新后重试", 409, {
      currentAttemptCount: prepared.attemptCount,
    });
  }
  if (prepared.kind === "intent_in_flight") {
    return serviceError("仍有通知发布意图处理中，暂不能重试", 409);
  }
  if (prepared.kind === "snapshot_invalid") return serviceError("项目通知死信快照无效", 409);
  if (prepared.kind === "lineage_invalid") return serviceError("项目通知死信重驱链路无效", 409);
  if (prepared.kind === "nothing_to_redrive") {
    return serviceError("该死信没有可安全重试的规则，已提交或已发布规则不会重发", 409);
  }
  if (prepared.kind === "lineage_conflict") {
    return serviceError("该死信重试尝试已记录，原因与既有审计事实不一致", 409);
  }
  if (prepared.kind === "collision") return serviceError("项目通知重试幂等键冲突", 409);
  const drain = await bestEffortDrainProjectNotificationSignals([redriveSignalId]);
  return serviceOk({
    sourceSignalId: input.signalId,
    redriveSignalId,
    replayed: prepared.replayed,
    eligibleRuleCount: prepared.eligibleRuleCount,
    auditEventId: prepared.auditEventId,
    drain,
  });
}

export function projectNotificationRedriveSignalId(signalId: string, attemptCount: number) {
  const sourceHash = createHash("sha256").update(signalId).digest("hex");
  return `redrive:${sourceHash}:a${attemptCount}`;
}

export function selectProjectNotificationRedriveRules<
  Rule extends { ruleId: number; revision: number },
>(input: {
  eligibleRuleRevisions: readonly Rule[];
  evaluations: readonly RuleEvaluationState[];
  intents: readonly RuleIntentState[];
  failureCode: string | null;
}) {
  const evaluationByRule = new Map(input.evaluations.map((item) => [item.ruleId, item]));
  const intentByRule = new Map(input.intents.map((item) => [item.ruleId, item]));
  return input.eligibleRuleRevisions.filter((rule) => {
    const evaluation = evaluationByRule.get(rule.ruleId);
    const intent = intentByRule.get(rule.ruleId);
    if (intent?.status === "committed" || evaluation?.outcome === "published") return false;
    if (evaluation && evaluation.outcome !== "error") return false;
    return !evaluation || evaluation.errorCode === input.failureCode;
  });
}

function parseFailedSignalSnapshot(signal: FailedSignalRow) {
  try {
    return parseClaimedProjectNotificationSnapshot({
      ...signal,
      nextAttemptAt: null,
      leaseToken: "redrive-validation",
      leaseExpiresAt: new Date(),
    });
  } catch {
    return null;
  }
}
