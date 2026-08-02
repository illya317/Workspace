import "server-only";

import { randomUUID } from "node:crypto";

import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { Prisma, prisma } from "@workspace/platform/server/prisma";

import { evaluatePersistedProjectNotificationSignal } from "./project-notification-evaluator";
import { failProjectNotificationPublicationIntentsForSignal } from "./project-notification-publication-intent";
import { PROJECT_NOTIFICATION_SIGNAL_LEASE_SECONDS } from "./project-notification-lease";
import {
  createStoredProjectNotificationSnapshot,
  parseClaimedProjectNotificationSnapshot,
  projectNotificationSignalFailurePlan,
  projectNotificationSignalFingerprint,
  projectNotificationSignalReplayMatches,
  ProjectNotificationSignalProcessingError,
} from "./project-notification-signal-runtime";
import {
  PROJECT_NOTIFICATION_SIGNAL_MAX_ATTEMPTS,
  projectNotificationSignalInputSchema,
  type ClaimedProjectNotificationSignal,
  type ProjectNotificationSignalProjectRow,
  type ProjectNotificationSignalKind,
  type ProjectNotificationSignalReplayPolicy,
} from "./project-notification-signal-contract";

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_BATCHES = 20;

type ProjectNotificationSignalLedgerRow = ClaimedProjectNotificationSignal & {
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
};

type StoredProjectNotificationSignalIdentity = {
  id: string;
  projectId: number;
  projectVersion: number;
  signalKind: string;
  signalId: string;
  changedField: string;
  snapshotJson: string;
  factsFingerprint: string;
};

export type ProjectNotificationDrainSummary = {
  claimed: number;
  completed: number;
  retried: number;
  failed: number;
  processed: number;
  published: number;
  skipped: number;
  errors: number;
};

const emptyDrainSummary = (): ProjectNotificationDrainSummary => ({
  claimed: 0,
  completed: 0,
  retried: 0,
  failed: 0,
  processed: 0,
  published: 0,
  skipped: 0,
  errors: 0,
});

export async function enqueueProjectNotificationSignal(
  tx: Prisma.TransactionClient,
  input: {
    project: ProjectNotificationSignalProjectRow;
    signalKind: ProjectNotificationSignalKind;
    signalId: string;
    changedField: string;
    occurredAt?: Date;
    replayPolicy?: ProjectNotificationSignalReplayPolicy;
  },
) {
  const parsed = projectNotificationSignalInputSchema.parse({
    projectId: input.project.id,
    signalKind: input.signalKind,
    signalId: input.signalId,
    changedField: input.changedField,
    occurredAt: input.occurredAt,
  });
  const occurredAt = parsed.occurredAt ?? new Date();
  const eligibleRuleRevisions = await tx.$queryRaw<Array<{
    ruleId: number;
    revision: number;
    publishedAt: Date;
  }>>(Prisma.sql`
    SELECT rule."id" AS "ruleId", revision."revision", rule."publishedAt"
    FROM "ProjectNotificationRule" AS rule
    INNER JOIN "ProjectNotificationRuleRevision" AS revision
      ON revision."ruleId" = rule."id"
      AND revision."revision" = rule."publishedRevision"
    WHERE rule."projectId" = ${input.project.id}
      AND rule."status" = 'published'
      AND rule."publishedRevision" IS NOT NULL
      AND rule."publishedAt" <= ${occurredAt}
      AND revision."eventType" = ${parsed.signalKind}
    ORDER BY rule."id" ASC
    FOR SHARE OF rule, revision
  `);
  const snapshot = createStoredProjectNotificationSnapshot({
    project: input.project,
    signalKind: parsed.signalKind,
    changedField: parsed.changedField,
    occurredAt,
    eligibleRuleRevisions,
  });
  const snapshotJson = JSON.stringify(snapshot);
  const factsFingerprint = projectNotificationSignalFingerprint(snapshot);
  const attemptedSignal = {
    projectId: input.project.id,
    projectVersion: input.project.version,
    signalKind: parsed.signalKind,
    signalId: parsed.signalId,
    changedField: parsed.changedField,
    snapshotJson,
    factsFingerprint,
  };
  if (eligibleRuleRevisions.length === 0) {
    const [existing] = await findStoredProjectNotificationSignal(tx, parsed.signalId);
    if (!existing) {
      return {
        id: null,
        signalId: parsed.signalId,
        replayed: false,
        queued: false,
      };
    }
    if (!projectNotificationSignalReplayMatches({
      policy: input.replayPolicy ?? "strict",
      stored: existing,
      attempted: attemptedSignal,
    })) {
      throw new Error("项目通知 signalId 已用于不同的事件快照");
    }
    return { id: existing.id, signalId: existing.signalId, replayed: true, queued: true };
  }
  const inserted = await tx.$queryRaw<StoredProjectNotificationSignalIdentity[]>(Prisma.sql`
    INSERT INTO "ProjectNotificationSignal" (
      "id", "projectId", "projectVersion", "signalKind", "signalId", "changedField",
      "snapshotJson", "factsFingerprint", "occurredAt", "status", "nextAttemptAt",
      "createdAt", "updatedAt"
    ) VALUES (
      ${randomUUID()}, ${input.project.id}, ${input.project.version}, ${parsed.signalKind},
      ${parsed.signalId}, ${parsed.changedField}, ${snapshotJson}, ${factsFingerprint},
      ${occurredAt}, 'pending', ${occurredAt}, ${occurredAt}, ${occurredAt}
    )
    ON CONFLICT ("signalId") DO NOTHING
    RETURNING
      "id", "projectId", "projectVersion", "signalKind", "signalId", "changedField",
      "snapshotJson", "factsFingerprint"
  `);
  const [row] = inserted.length > 0
    ? inserted
    : await findStoredProjectNotificationSignal(tx, parsed.signalId);
  if (!row) throw new Error("项目通知信号未写入");
  const replayed = inserted.length === 0;
  if (replayed && !projectNotificationSignalReplayMatches({
    policy: input.replayPolicy ?? "strict",
    stored: row,
    attempted: attemptedSignal,
  })) {
    throw new Error("项目通知 signalId 已用于不同的事件快照");
  }
  return { id: row.id, signalId: row.signalId, replayed, queued: true };
}

function findStoredProjectNotificationSignal(
  tx: Prisma.TransactionClient,
  signalId: string,
) {
  return tx.$queryRaw<StoredProjectNotificationSignalIdentity[]>(Prisma.sql`
    SELECT
      "id", "projectId", "projectVersion", "signalKind", "signalId", "changedField",
      "snapshotJson", "factsFingerprint"
    FROM "ProjectNotificationSignal"
    WHERE "signalId" = ${signalId}
    LIMIT 1
  `);
}

export async function drainProjectNotificationSignals(input: {
  signalIds?: readonly string[];
  batchSize?: number;
  maxBatches?: number;
  now?: Date;
} = {}) {
  const summary = emptyDrainSummary();
  const batchSize = boundedInteger(input.batchSize, DEFAULT_BATCH_SIZE, 1, 100);
  const maxBatches = boundedInteger(input.maxBatches, DEFAULT_MAX_BATCHES, 1, 100);
  const signalIds = input.signalIds ? [...new Set(input.signalIds)] : undefined;
  if (signalIds?.length === 0) return summary;

  const claimBudget = batchSize * maxBatches;
  for (let claimNo = 0; claimNo < claimBudget; claimNo += 1) {
    const claim = await claimProjectNotificationSignals({
      signalIds,
      limit: 1,
      now: input.now ?? new Date(),
    });
    summary.failed += claim.exhausted;
    summary.errors += claim.exhausted;
    if (claim.signals.length === 0) {
      if (claim.exhausted === 1) continue;
      break;
    }
    summary.claimed += claim.signals.length;
    await consumeClaimedProjectNotificationSignal(claim.signals[0]!, summary);
  }
  return summary;
}

export async function bestEffortDrainProjectNotificationSignals(
  signalIds: readonly string[],
) {
  try {
    return await drainProjectNotificationSignals({ signalIds, batchSize: 1, maxBatches: 1 });
  } catch (error) {
    console.error("Failed to start project notification signal drain", error);
    return { ...emptyDrainSummary(), errors: 1 };
  }
}

export async function evaluateProjectNotificationSignal(input: {
  projectId: number;
  signalKind: ProjectNotificationSignalKind;
  signalId: string;
  changedField: string;
  now?: Date;
}) {
  const parsed = projectNotificationSignalInputSchema.safeParse({
    ...input,
    occurredAt: input.now,
  });
  if (!parsed.success) {
    return { ...emptyDrainSummary(), errors: 1, issue: parsed.error.issues[0]?.message };
  }
  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: PROJECT_NOTIFICATION_SIGNAL_PROJECT_SELECT,
  });
  if (!project) return { ...emptyDrainSummary(), errors: 1, issue: "项目不存在" };
  const signal = await prisma.$transaction((tx) => enqueueProjectNotificationSignal(tx, {
    project,
    signalKind: parsed.data.signalKind,
    signalId: parsed.data.signalId,
    changedField: parsed.data.changedField,
    occurredAt: parsed.data.occurredAt,
  }));
  return signal.queued
    ? bestEffortDrainProjectNotificationSignals([signal.signalId])
    : emptyDrainSummary();
}

export async function runScheduledProjectNotificationEvaluations(now = new Date()) {
  const businessDate = workspaceBusinessDate(now);
  const projectRows = await prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    SELECT DISTINCT project."id"
    FROM "Project" AS project
    INNER JOIN "ProjectNotificationRule" AS rule
      ON rule."projectId" = project."id"
      AND rule."status" = 'published'
      AND rule."publishedRevision" IS NOT NULL
    INNER JOIN "ProjectNotificationRuleRevision" AS revision
      ON revision."ruleId" = rule."id"
      AND revision."revision" = rule."publishedRevision"
      AND revision."eventType" = 'project.scheduled'
    WHERE project."isArchived" IS FALSE
    ORDER BY project."id" ASC
  `);
  let queued = 0;
  let replayed = 0;
  let enqueueErrors = 0;
  for (const { id: projectId } of projectRows) {
    try {
      const signal = await prisma.$transaction(async (tx) => {
        const project = await tx.project.findFirst({
          where: { id: projectId, isArchived: false },
          select: PROJECT_NOTIFICATION_SIGNAL_PROJECT_SELECT,
        });
        if (!project) return null;
        return enqueueProjectNotificationSignal(tx, {
          project,
          signalKind: "project.scheduled",
          signalId: `scheduled:${businessDate}:project:${project.id}`,
          changedField: "scheduled",
          occurredAt: now,
          replayPolicy: "first-write-wins",
        });
      });
      if (signal?.queued && signal.replayed) replayed += 1;
      else if (signal?.queued) queued += 1;
    } catch (error) {
      enqueueErrors += 1;
      console.error(`Failed to enqueue scheduled project notification for project ${projectId}`, error);
    }
  }
  const drained = await drainProjectNotificationSignals({ now });
  return { projects: projectRows.length, queued, replayed, enqueueErrors, ...drained };
}

async function claimProjectNotificationSignals(input: {
  signalIds?: readonly string[];
  limit: number;
  now: Date;
}) {
  const signalFilter = input.signalIds
    ? Prisma.sql`AND signal."projectId" IN (
        SELECT DISTINCT target."projectId"
        FROM "ProjectNotificationSignal" AS target
        WHERE target."signalId" IN (${Prisma.join(input.signalIds)})
      )`
    : Prisma.sql``;
  const oldestOutstandingProjectSignal = Prisma.sql`
    AND NOT EXISTS (
      SELECT 1
      FROM "ProjectNotificationSignal" AS older_signal
      WHERE older_signal."projectId" = signal."projectId"
        AND older_signal."status" IN ('pending', 'retrying', 'leased')
        AND (
          older_signal."createdAt" < signal."createdAt"
          OR (
            older_signal."createdAt" = signal."createdAt"
            AND older_signal."id" < signal."id"
          )
        )
    )
  `;
  return prisma.$transaction(async (tx) => {
    const exhaustedSignals = await tx.$queryRaw<Array<{
      projectId: number;
      signalKind: string;
      signalId: string;
    }>>(Prisma.sql`
      WITH candidates AS (
        SELECT signal."id"
        FROM "ProjectNotificationSignal" AS signal
        WHERE signal."attemptCount" >= ${PROJECT_NOTIFICATION_SIGNAL_MAX_ATTEMPTS}
          AND (
            signal."status" IN ('pending', 'retrying')
            OR (signal."status" = 'leased' AND signal."leaseExpiresAt" <= ${input.now})
          )
          ${signalFilter}
          ${oldestOutstandingProjectSignal}
        ORDER BY signal."nextAttemptAt" ASC NULLS FIRST, signal."createdAt" ASC, signal."id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${input.limit}
      )
      UPDATE "ProjectNotificationSignal" AS signal
      SET
        "status" = 'failed',
        "nextAttemptAt" = NULL,
        "leaseToken" = NULL,
        "leaseExpiresAt" = NULL,
        "processedAt" = NULL,
        "failedAt" = ${input.now},
        "lastErrorCode" = 'signal_attempts_exhausted',
        "lastErrorSummary" = '项目通知信号重试次数已耗尽',
        "updatedAt" = ${input.now}
      FROM candidates
      WHERE signal."id" = candidates."id"
      RETURNING signal."projectId", signal."signalKind", signal."signalId"
    `);
    exhaustedSignals.sort((left, right) => (
      left.projectId - right.projectId || left.signalId.localeCompare(right.signalId)
    ));
    for (const signal of exhaustedSignals) {
      await failProjectNotificationPublicationIntentsForSignal(tx, {
        signalKind: signal.signalKind,
        signalId: signal.signalId,
        errorCode: "signal_attempts_exhausted",
        failedAt: input.now,
      });
    }
    const rows = await tx.$queryRaw<ProjectNotificationSignalLedgerRow[]>(Prisma.sql`
      WITH candidates AS (
        SELECT signal."id"
        FROM "ProjectNotificationSignal" AS signal
        WHERE (
          (
            signal."status" IN ('pending', 'retrying')
            AND signal."nextAttemptAt" <= ${input.now}
          )
          OR (
            signal."status" = 'leased'
            AND signal."leaseExpiresAt" <= ${input.now}
          )
        )
        AND signal."attemptCount" < ${PROJECT_NOTIFICATION_SIGNAL_MAX_ATTEMPTS}
        ${signalFilter}
        ${oldestOutstandingProjectSignal}
        ORDER BY signal."nextAttemptAt" ASC NULLS FIRST, signal."createdAt" ASC, signal."id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${input.limit}
      )
      UPDATE "ProjectNotificationSignal" AS signal
      SET
        "status" = 'leased',
        "attemptCount" = signal."attemptCount" + 1,
        "leaseToken" = gen_random_uuid()::text,
        "leaseExpiresAt" = ${input.now}::timestamp
          + (${PROJECT_NOTIFICATION_SIGNAL_LEASE_SECONDS} * INTERVAL '1 second'),
        "lastErrorCode" = NULL,
        "lastErrorSummary" = NULL,
        "updatedAt" = ${input.now}
      FROM candidates
      WHERE signal."id" = candidates."id"
      RETURNING signal.*
    `);
    return {
      exhausted: exhaustedSignals.length,
      signals: rows.filter((row): row is ClaimedProjectNotificationSignal => (
        row.leaseToken !== null && row.leaseExpiresAt !== null
      )),
    };
  });
}

async function consumeClaimedProjectNotificationSignal(
  signal: ClaimedProjectNotificationSignal,
  summary: ProjectNotificationDrainSummary,
) {
  try {
    const snapshot = parseClaimedProjectNotificationSnapshot(signal);
    const result = await evaluatePersistedProjectNotificationSignal({ signal, snapshot });
    const completed = await completeProjectNotificationSignal(signal);
    if (!completed) return;
    summary.completed += 1;
    summary.processed += result.processed;
    summary.published += result.published;
    summary.skipped += result.skipped;
    summary.errors += result.errors;
  } catch (error) {
    const issue = error instanceof ProjectNotificationSignalProcessingError
      ? error
      : new ProjectNotificationSignalProcessingError(
        "signal_processing_failed",
        "项目通知评估发生内部错误",
        false,
      );
    const outcome = await failProjectNotificationSignal(signal, issue);
    if (outcome === "failed") summary.failed += 1;
    if (outcome === "retrying") summary.retried += 1;
    summary.errors += 1;
    if (!(error instanceof ProjectNotificationSignalProcessingError)) {
      console.error("Failed to evaluate durable project notification signal", error);
    }
  }
}

async function completeProjectNotificationSignal(signal: ClaimedProjectNotificationSignal) {
  const now = new Date();
  const changed = await prisma.$executeRaw(Prisma.sql`
    UPDATE "ProjectNotificationSignal"
    SET
      "status" = 'completed',
      "nextAttemptAt" = NULL,
      "leaseToken" = NULL,
      "leaseExpiresAt" = NULL,
      "processedAt" = ${now},
      "failedAt" = NULL,
      "lastErrorCode" = NULL,
      "lastErrorSummary" = NULL,
      "updatedAt" = ${now}
    WHERE "id" = ${signal.id}
      AND "status" = 'leased'
      AND "leaseToken" = ${signal.leaseToken}
  `);
  return changed === 1;
}

async function failProjectNotificationSignal(
  signal: ClaimedProjectNotificationSignal,
  issue: ProjectNotificationSignalProcessingError,
) {
  const now = new Date();
  const plan = projectNotificationSignalFailurePlan({
    attemptCount: signal.attemptCount,
    now,
    permanent: issue.permanent,
    preserveAttempt: issue.code === "publication_rate_limited",
    retryAt: issue.retryAt,
  });
  const storedAttemptCount = issue.code === "publication_rate_limited"
    ? Math.max(0, signal.attemptCount - 1)
    : signal.attemptCount;
  const failedAt = plan.status === "failed" ? now : null;
  return prisma.$transaction(async (tx) => {
    const changed = await tx.$executeRaw(Prisma.sql`
      UPDATE "ProjectNotificationSignal"
      SET
        "status" = ${plan.status},
        "attemptCount" = ${storedAttemptCount},
        "nextAttemptAt" = ${plan.nextAttemptAt},
        "leaseToken" = NULL,
        "leaseExpiresAt" = NULL,
        "processedAt" = NULL,
        "failedAt" = ${failedAt},
        "lastErrorCode" = ${issue.code.slice(0, 120)},
        "lastErrorSummary" = ${issue.safeSummary.slice(0, 500)},
        "updatedAt" = ${now}
      WHERE "id" = ${signal.id}
        AND "status" = 'leased'
        AND "leaseToken" = ${signal.leaseToken}
        AND "attemptCount" = ${signal.attemptCount}
    `);
    if (changed === 1 && plan.status === "failed") {
      await failProjectNotificationPublicationIntentsForSignal(tx, {
        signalKind: signal.signalKind,
        signalId: signal.signalId,
        errorCode: issue.code,
        failedAt: now,
      });
    }
    return changed === 1 ? plan.status : null;
  });
}

export const PROJECT_NOTIFICATION_SIGNAL_PROJECT_SELECT = {
  id: true,
  code: true,
  name: true,
  status: true,
  projectLevel: true,
  completionPercent: true,
  plannedStartDate: true,
  plannedEndDate: true,
  riskNote: true,
  isArchived: true,
  version: true,
} satisfies Prisma.ProjectSelect;

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value!));
}
