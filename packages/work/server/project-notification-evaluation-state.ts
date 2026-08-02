import "server-only";

import { Prisma, prisma } from "@workspace/platform/server/prisma";

import { validateProjectNotificationWriteInput } from "./domain/project-notification-write-validation";
import {
  commitProjectNotificationPublicationIntent,
  failProjectNotificationPublicationIntent,
  findProjectNotificationPublicationIntent,
  type ProjectNotificationPublicationIntentRow,
} from "./project-notification-publication-intent";
import type { ClaimedProjectNotificationSignal } from "./project-notification-signal-contract";

export type PublishedProjectNotificationRuleRevision = {
  ruleId: number;
  revision: number;
  definitionKey: string;
  eventType: string;
  conditionJson: string;
  audiencePolicyJson: string;
  channelPolicyJson: string;
  cooldownSeconds: number;
};

export type ProjectNotificationEvaluationOutcome =
  | "published"
  | "condition_not_matched"
  | "cooldown"
  | "no_recipients"
  | "error";

export type ProjectNotificationEvaluationRecord = {
  id: string;
  outcome: string;
  publicationId: string | null;
  errorCode: string | null;
};

export type ProjectNotificationEvaluationInput = {
  ruleId: number;
  ruleRevision: number;
  projectId: number;
  signalKind: string;
  signalId: string;
  outcome: ProjectNotificationEvaluationOutcome;
  factsFingerprint: string;
  publicationId?: string | null;
  errorCode?: string | null;
  evaluatedAt: Date;
};

export async function lockProjectNotificationRule(
  tx: Prisma.TransactionClient,
  ruleId: number,
) {
  const [row] = await tx.$queryRaw<Array<{
    id: number;
    projectId: number;
    status: string;
    publishedRevision: number | null;
    publishedAt: Date | null;
  }>>(Prisma.sql`
    SELECT "id", "projectId", "status", "publishedRevision", "publishedAt"
    FROM "ProjectNotificationRule"
    WHERE "id" = ${ruleId}
    FOR UPDATE
  `);
  return row ?? null;
}

export function findProjectNotificationEvaluation(
  tx: Prisma.TransactionClient,
  ruleId: number,
  signal: Pick<ClaimedProjectNotificationSignal, "signalKind" | "signalId">,
) {
  return tx.projectNotificationEvaluation.findUnique({
    where: {
      ruleId_signalKind_signalId: {
        ruleId,
        signalKind: signal.signalKind,
        signalId: signal.signalId,
      },
    },
  });
}

export async function findFinalProjectNotificationEvaluationRuleIds(input: {
  projectId: number;
  signalKind: string;
  signalId: string;
  ruleIds: readonly number[];
}) {
  if (input.ruleIds.length === 0) return new Set<number>();
  const rows = await prisma.projectNotificationEvaluation.findMany({
    where: {
      projectId: input.projectId,
      signalKind: input.signalKind,
      signalId: input.signalId,
      ruleId: { in: [...input.ruleIds] },
    },
    select: { ruleId: true },
  });
  return new Set(rows.map((row) => row.ruleId));
}

export function loadProjectNotificationRuleRevision(
  tx: Prisma.TransactionClient,
  eligibleRule: { ruleId: number; revision: number },
) {
  return tx.projectNotificationRuleRevision.findUnique({
    where: {
      ruleId_revision: {
        ruleId: eligibleRule.ruleId,
        revision: eligibleRule.revision,
      },
    },
    select: {
      ruleId: true,
      revision: true,
      definitionKey: true,
      eventType: true,
      conditionJson: true,
      audiencePolicyJson: true,
      channelPolicyJson: true,
      cooldownSeconds: true,
    },
  });
}

export function projectNotificationEvaluationBase(
  revision: Pick<PublishedProjectNotificationRuleRevision, "ruleId" | "revision">,
  signal: ClaimedProjectNotificationSignal,
  evaluatedAt: Date,
) {
  return {
    ruleId: revision.ruleId,
    ruleRevision: revision.revision,
    projectId: signal.projectId,
    signalKind: signal.signalKind,
    signalId: signal.signalId,
    factsFingerprint: signal.factsFingerprint,
    evaluatedAt,
  };
}

export function recordProjectNotificationEvaluation(
  tx: Prisma.TransactionClient,
  input: ProjectNotificationEvaluationInput,
) {
  validateProjectNotificationWriteInput(input);
  return tx.projectNotificationEvaluation.create({
    data: {
      ruleId: input.ruleId,
      ruleRevision: input.ruleRevision,
      projectId: input.projectId,
      signalKind: input.signalKind,
      signalId: input.signalId,
      outcome: input.outcome,
      factsFingerprint: input.factsFingerprint,
      publicationId: input.publicationId ?? null,
      errorCode: input.errorCode ?? null,
      evaluatedAt: input.evaluatedAt,
    },
  });
}

export type ProjectNotificationCooldownDisposition = "ready" | "in_flight" | "cooldown";

export function decideProjectNotificationCooldown(input: {
  publishedEvaluation: boolean;
  committedIntent: boolean;
  publishingIntent: boolean;
}): ProjectNotificationCooldownDisposition {
  if (input.publishedEvaluation || input.committedIntent) return "cooldown";
  if (input.publishingIntent) return "in_flight";
  return "ready";
}

export async function projectNotificationCooldownDisposition(
  tx: Prisma.TransactionClient,
  revision: Pick<PublishedProjectNotificationRuleRevision, "ruleId" | "cooldownSeconds">,
  now: Date,
) {
  if (revision.cooldownSeconds <= 0) return "ready" as const;
  const since = new Date(now.getTime() - revision.cooldownSeconds * 1_000);
  const [evaluation, intentState] = await Promise.all([
    tx.projectNotificationEvaluation.findFirst({
      where: {
        ruleId: revision.ruleId,
        outcome: "published",
        evaluatedAt: { gte: since },
      },
      select: { id: true },
    }),
    tx.$queryRaw<Array<{ committed: boolean; publishing: boolean }>>(Prisma.sql`
      SELECT
        EXISTS (
          SELECT 1
          FROM "ProjectNotificationPublicationIntent"
          WHERE "ruleId" = ${revision.ruleId}
            AND "status" = 'committed'
            AND "committedAt" >= ${since}
        ) AS "committed",
        EXISTS (
          SELECT 1
          FROM "ProjectNotificationPublicationIntent"
          WHERE "ruleId" = ${revision.ruleId}
            AND "status" = 'publishing'
        ) AS "publishing"
    `),
  ]);
  return decideProjectNotificationCooldown({
    publishedEvaluation: Boolean(evaluation),
    committedIntent: intentState[0]?.committed === true,
    publishingIntent: intentState[0]?.publishing === true,
  });
}

export async function recordPermanentProjectNotificationRuleFailure(input: {
  eligibleRule: { ruleId: number; revision: number };
  signal: ClaimedProjectNotificationSignal;
  errorCode: string;
}) {
  return prisma.$transaction(async (tx) => {
    const locked = await lockProjectNotificationRule(tx, input.eligibleRule.ruleId);
    if (!locked || locked.projectId !== input.signal.projectId) return null;
    const existing = await findProjectNotificationEvaluation(
      tx,
      input.eligibleRule.ruleId,
      input.signal,
    );
    if (existing) return existing;
    const revision = await loadProjectNotificationRuleRevision(tx, input.eligibleRule);
    if (!revision || revision.eventType !== input.signal.signalKind) return null;
    const intent = await findProjectNotificationPublicationIntent(tx, {
      ruleId: input.eligibleRule.ruleId,
      signalKind: input.signal.signalKind,
      signalId: input.signal.signalId,
    });
    if (intent?.status === "committed" && intent.publicationId) {
      return recordProjectNotificationEvaluation(tx, {
        ...projectNotificationEvaluationBase(revision, input.signal, new Date()),
        outcome: "published",
        publicationId: intent.publicationId,
      });
    }
    if (intent?.status === "publishing") {
      await failProjectNotificationPublicationIntent(tx, {
        intentId: intent.id,
        errorCode: input.errorCode,
        failedAt: new Date(),
      });
    }
    return recordProjectNotificationEvaluation(tx, {
      ...projectNotificationEvaluationBase(revision, input.signal, new Date()),
      outcome: "error",
      errorCode: input.errorCode.slice(0, 120),
    });
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function finalizeProjectNotificationPublication(
  input: {
    intent: ProjectNotificationPublicationIntentRow;
    signal: ClaimedProjectNotificationSignal;
    publicationId: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const locked = await lockProjectNotificationRule(tx, input.intent.ruleId);
    if (!locked || locked.projectId !== input.signal.projectId) {
      throw new Error("项目通知发布意图所属规则不存在");
    }
    const existing = await findProjectNotificationEvaluation(tx, input.intent.ruleId, input.signal);
    if (existing) return existing;
    const currentIntent = await findProjectNotificationPublicationIntent(tx, {
      ruleId: input.intent.ruleId,
      signalKind: input.intent.signalKind,
      signalId: input.intent.signalId,
    });
    if (!currentIntent || currentIntent.id !== input.intent.id) {
      throw new Error("项目通知发布意图与评估信号不一致");
    }
    const committed = await commitProjectNotificationPublicationIntent(tx, {
      intentId: currentIntent.id,
      publicationId: input.publicationId,
      committedAt: new Date(),
    });
    if (!committed) throw new Error("项目通知发布意图无法提交");
    return recordProjectNotificationEvaluation(tx, {
      ...projectNotificationEvaluationBase(
        { ruleId: committed.ruleId, revision: committed.ruleRevision },
        input.signal,
        new Date(),
      ),
      outcome: "published",
      publicationId: input.publicationId,
    });
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function finalizeProjectNotificationPublicationError(
  input: {
    intent: ProjectNotificationPublicationIntentRow;
    signal: ClaimedProjectNotificationSignal;
    errorCode: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const locked = await lockProjectNotificationRule(tx, input.intent.ruleId);
    if (!locked || locked.projectId !== input.signal.projectId) {
      throw new Error("项目通知发布意图所属规则不存在");
    }
    const existing = await findProjectNotificationEvaluation(tx, input.intent.ruleId, input.signal);
    if (existing) return existing;
    const currentIntent = await findProjectNotificationPublicationIntent(tx, {
      ruleId: input.intent.ruleId,
      signalKind: input.intent.signalKind,
      signalId: input.intent.signalId,
    });
    if (!currentIntent || currentIntent.id !== input.intent.id) {
      throw new Error("项目通知发布意图与评估信号不一致");
    }
    if (currentIntent.status === "committed" && currentIntent.publicationId) {
      return recordProjectNotificationEvaluation(tx, {
        ...projectNotificationEvaluationBase(
          { ruleId: currentIntent.ruleId, revision: currentIntent.ruleRevision },
          input.signal,
          new Date(),
        ),
        outcome: "published",
        publicationId: currentIntent.publicationId,
      });
    }
    const errorCode = currentIntent.status === "failed"
      ? input.errorCode
      : currentIntent.lastErrorCode ?? input.errorCode;
    if (currentIntent.status === "publishing") {
      await failProjectNotificationPublicationIntent(tx, {
        intentId: currentIntent.id,
        errorCode,
        failedAt: new Date(),
      });
    }
    return recordProjectNotificationEvaluation(tx, {
      ...projectNotificationEvaluationBase(
        { ruleId: currentIntent.ruleId, revision: currentIntent.ruleRevision },
        input.signal,
        new Date(),
      ),
      outcome: "error",
      errorCode,
    });
  }, { maxWait: 10_000, timeout: 30_000 });
}
