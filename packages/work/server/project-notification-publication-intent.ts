import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import { Prisma } from "@workspace/platform/server/prisma";

import { validateProjectNotificationWriteInput } from "./domain/project-notification-write-validation";
import { PROJECT_NOTIFICATION_AUDIENCE_MAX_COUNT } from "./project-notification-audience-capacity";

const storedPublicationIntentRequestSchema = z.object({
  definitionKey: z.string().min(1).max(120),
  idempotencyKey: z.string().min(1).max(200),
  usernames: z.array(z.string().min(1).max(120)).min(1).max(PROJECT_NOTIFICATION_AUDIENCE_MAX_COUNT),
  variables: z.record(z.string(), z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
  ])),
  deliveryChannels: z.array(z.enum(["workspace", "wecom"])).min(1).max(2),
}).strict();

export type StoredProjectNotificationPublicationRequest = z.infer<
  typeof storedPublicationIntentRequestSchema
>;

export type ProjectNotificationPublicationIntentRow = {
  id: string;
  ruleId: number;
  ruleRevision: number;
  projectId: number;
  signalKind: string;
  signalId: string;
  definitionKey: string;
  idempotencyKey: string;
  requestJson: string;
  requestFingerprint: string;
  status: string;
  publicationId: string | null;
  preparedAt: Date;
  committedAt: Date | null;
  failedAt: Date | null;
  lastErrorCode: string | null;
};

export type ProjectNotificationRootSignal = {
  id: string;
  projectId: number;
  signalKind: string;
  signalId: string;
  depth: number;
};

const PROJECT_NOTIFICATION_REDRIVE_MAX_DEPTH = 32;

export async function findProjectNotificationRootSignal(
  tx: Prisma.TransactionClient,
  signalRecordId: string,
) {
  const [root] = await tx.$queryRaw<ProjectNotificationRootSignal[]>(Prisma.sql`
    WITH RECURSIVE ancestors AS (
      SELECT
        signal."id", signal."projectId", signal."signalKind", signal."signalId",
        0::integer AS "depth", ARRAY[signal."id"]::text[] AS "path"
      FROM "ProjectNotificationSignal" AS signal
      WHERE signal."id" = ${signalRecordId}
      UNION ALL
      SELECT
        source_signal."id", source_signal."projectId", source_signal."signalKind",
        source_signal."signalId", ancestor."depth" + 1,
        ancestor."path" || source_signal."id"
      FROM ancestors AS ancestor
      INNER JOIN "ProjectNotificationSignalRedriveEvent" AS redrive
        ON redrive."redriveSignalRecordId" = ancestor."id"
      INNER JOIN "ProjectNotificationSignal" AS source_signal
        ON source_signal."id" = redrive."sourceSignalRecordId"
        AND source_signal."projectId" = ancestor."projectId"
      WHERE ancestor."depth" < ${PROJECT_NOTIFICATION_REDRIVE_MAX_DEPTH}
        AND NOT source_signal."id" = ANY(ancestor."path")
    )
    SELECT "id", "projectId", "signalKind", "signalId", "depth"
    FROM ancestors AS ancestor
    WHERE NOT EXISTS (
      SELECT 1
      FROM "ProjectNotificationSignalRedriveEvent" AS parent_redrive
      WHERE parent_redrive."redriveSignalRecordId" = ancestor."id"
    )
    ORDER BY "depth" DESC
    LIMIT 1
  `);
  return root ?? null;
}

export async function findProjectNotificationPublicationIntent(
  tx: Prisma.TransactionClient,
  input: { ruleId: number; signalKind: string; signalId: string },
) {
  const [row] = await tx.$queryRaw<ProjectNotificationPublicationIntentRow[]>(Prisma.sql`
    SELECT *
    FROM "ProjectNotificationPublicationIntent"
    WHERE "ruleId" = ${input.ruleId}
      AND "signalKind" = ${input.signalKind}
      AND "signalId" = ${input.signalId}
    LIMIT 1
  `);
  return row ?? null;
}

export async function findProjectNotificationRedriveSourceIntent(
  tx: Prisma.TransactionClient,
  input: { redriveSignalRecordId: string; ruleId: number },
) {
  const root = await findProjectNotificationRootSignal(tx, input.redriveSignalRecordId);
  if (!root || root.depth === 0) return null;
  const [row] = await tx.$queryRaw<ProjectNotificationPublicationIntentRow[]>(Prisma.sql`
    SELECT *
    FROM "ProjectNotificationPublicationIntent"
    WHERE "projectId" = ${root.projectId}
      AND "signalKind" = ${root.signalKind}
      AND "signalId" = ${root.signalId}
      AND "ruleId" = ${input.ruleId}
    LIMIT 1
  `);
  return row ?? null;
}

export async function reactivateProjectNotificationPublicationIntentForRedrive(
  tx: Prisma.TransactionClient,
  input: { intentId: string; redriveSignalRecordId: string; reactivatedAt: Date },
) {
  const root = await findProjectNotificationRootSignal(tx, input.redriveSignalRecordId);
  if (!root || root.depth === 0) return null;
  const rows = await tx.$queryRaw<ProjectNotificationPublicationIntentRow[]>(Prisma.sql`
    UPDATE "ProjectNotificationPublicationIntent" AS intent
    SET
      "status" = 'publishing',
      "failedAt" = NULL,
      "lastErrorCode" = NULL,
      "updatedAt" = ${input.reactivatedAt}
    WHERE intent."id" = ${input.intentId}
      AND intent."status" = 'failed'
      AND intent."projectId" = ${root.projectId}
      AND intent."signalKind" = ${root.signalKind}
      AND intent."signalId" = ${root.signalId}
    RETURNING intent.*
  `);
  return rows[0] ?? null;
}

export async function canCommitProjectNotificationPublication(
  tx: Prisma.TransactionClient,
  input: {
    intentId: string;
    signalRecordId: string;
    leaseToken: string;
    attemptCount: number;
  },
) {
  const root = await findProjectNotificationRootSignal(tx, input.signalRecordId);
  if (!root) return false;
  const [row] = await tx.$queryRaw<Array<{ intentId: string }>>(Prisma.sql`
    SELECT intent."id" AS "intentId"
    FROM "ProjectNotificationPublicationIntent" AS intent
    INNER JOIN "ProjectNotificationSignal" AS claimed_signal
      ON claimed_signal."id" = ${input.signalRecordId}
    WHERE intent."id" = ${input.intentId}
      AND intent."status" = 'publishing'
      AND claimed_signal."projectId" = intent."projectId"
      AND claimed_signal."status" = 'leased'
      AND claimed_signal."leaseToken" = ${input.leaseToken}
      AND claimed_signal."attemptCount" = ${input.attemptCount}
      AND intent."projectId" = ${root.projectId}
      AND intent."signalKind" = ${root.signalKind}
      AND intent."signalId" = ${root.signalId}
    FOR SHARE OF intent, claimed_signal SKIP LOCKED
    LIMIT 1
  `);
  return row?.intentId === input.intentId;
}

export async function createProjectNotificationPublicationIntent(
  tx: Prisma.TransactionClient,
  input: {
    ruleId: number;
    ruleRevision: number;
    projectId: number;
    signalKind: string;
    signalId: string;
    request: StoredProjectNotificationPublicationRequest;
    preparedAt: Date;
  },
) {
  validateProjectNotificationWriteInput(input);
  const request = storedPublicationIntentRequestSchema.parse(input.request);
  const requestJson = JSON.stringify(request);
  const requestFingerprint = createHash("sha256").update(requestJson).digest("hex");
  const inserted = await tx.$queryRaw<ProjectNotificationPublicationIntentRow[]>(Prisma.sql`
    INSERT INTO "ProjectNotificationPublicationIntent" (
      "id", "ruleId", "ruleRevision", "projectId", "signalKind", "signalId",
      "definitionKey", "idempotencyKey", "requestJson", "requestFingerprint",
      "status", "preparedAt", "updatedAt"
    ) VALUES (
      ${randomUUID()}, ${input.ruleId}, ${input.ruleRevision}, ${input.projectId},
      ${input.signalKind}, ${input.signalId}, ${request.definitionKey},
      ${request.idempotencyKey}, ${requestJson}, ${requestFingerprint},
      'publishing', ${input.preparedAt}, ${input.preparedAt}
    )
    ON CONFLICT ("ruleId", "signalKind", "signalId") DO NOTHING
    RETURNING *
  `);
  const row = inserted[0] ?? await findProjectNotificationPublicationIntent(tx, input);
  if (!row) throw new Error("项目通知发布意图未写入");
  if (
    row.ruleRevision !== input.ruleRevision
    || row.projectId !== input.projectId
    || row.definitionKey !== request.definitionKey
    || row.idempotencyKey !== request.idempotencyKey
    || row.requestFingerprint !== requestFingerprint
  ) {
    throw new Error("项目通知发布意图与既有幂等事实冲突");
  }
  return row;
}

export function parseProjectNotificationPublicationIntentRequest(
  row: ProjectNotificationPublicationIntentRow,
) {
  let raw: unknown;
  try {
    raw = JSON.parse(row.requestJson);
  } catch {
    throw new Error("项目通知发布意图请求无效");
  }
  const parsed = storedPublicationIntentRequestSchema.safeParse(raw);
  if (!parsed.success) throw new Error("项目通知发布意图请求无效");
  const fingerprint = createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex");
  if (fingerprint !== row.requestFingerprint) throw new Error("项目通知发布意图请求校验失败");
  return parsed.data;
}

export async function hasRecentProjectNotificationPublicationIntent(
  tx: Prisma.TransactionClient,
  input: { ruleId: number; since: Date; excludeIntentId?: string },
) {
  const exclude = input.excludeIntentId
    ? Prisma.sql`AND "id" <> ${input.excludeIntentId}`
    : Prisma.sql``;
  const [row] = await tx.$queryRaw<Array<{ present: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1
      FROM "ProjectNotificationPublicationIntent"
      WHERE "ruleId" = ${input.ruleId}
        AND "status" IN ('publishing', 'committed')
        AND "preparedAt" >= ${input.since}
        ${exclude}
    ) AS "present"
  `);
  return row?.present === true;
}

export async function commitProjectNotificationPublicationIntent(
  tx: Prisma.TransactionClient,
  input: { intentId: string; publicationId: string; committedAt: Date },
) {
  const rows = await tx.$queryRaw<ProjectNotificationPublicationIntentRow[]>(Prisma.sql`
    UPDATE "ProjectNotificationPublicationIntent"
    SET
      "status" = 'committed',
      "publicationId" = ${input.publicationId},
      "committedAt" = ${input.committedAt},
      "failedAt" = NULL,
      "lastErrorCode" = NULL,
      "updatedAt" = ${input.committedAt}
    WHERE "id" = ${input.intentId}
      AND (
        "status" IN ('publishing', 'failed')
        OR ("status" = 'committed' AND "publicationId" = ${input.publicationId})
      )
    RETURNING *
  `);
  return rows[0] ?? null;
}

export async function failProjectNotificationPublicationIntent(
  tx: Prisma.TransactionClient,
  input: { intentId: string; errorCode: string; failedAt: Date },
) {
  await tx.$executeRaw(Prisma.sql`
    UPDATE "ProjectNotificationPublicationIntent"
    SET
      "status" = 'failed',
      "publicationId" = NULL,
      "committedAt" = NULL,
      "failedAt" = ${input.failedAt},
      "lastErrorCode" = ${input.errorCode.slice(0, 120)},
      "updatedAt" = ${input.failedAt}
    WHERE "id" = ${input.intentId}
      AND "status" = 'publishing'
  `);
}

export async function reconcileProjectNotificationPublicationIntentsForSignal(
  tx: Prisma.TransactionClient,
  input: {
    projectId: number;
    signalRecordId: string;
    evaluationSignalKind: string;
    evaluationSignalId: string;
    reconciledAt: Date;
  },
) {
  const root = await findProjectNotificationRootSignal(tx, input.signalRecordId);
  if (!root || root.projectId !== input.projectId) {
    throw new Error("项目通知重驱根信号无效");
  }
  await acquireProjectNotificationPublicationLock(tx, input.projectId);
  const sourceId = `work.project-notification:${input.projectId}`;
  await tx.$executeRaw(Prisma.sql`
    UPDATE "ProjectNotificationPublicationIntent" AS intent
    SET
      "status" = 'committed',
      "publicationId" = publication."id",
      "committedAt" = ${input.reconciledAt},
      "failedAt" = NULL,
      "lastErrorCode" = NULL,
      "updatedAt" = ${input.reconciledAt}
    FROM "NotificationPublication" AS publication
    WHERE intent."signalKind" = ${root.signalKind}
      AND intent."signalId" = ${root.signalId}
      AND intent."projectId" = ${input.projectId}
      AND intent."status" IN ('publishing', 'failed')
      AND publication."sourceKind" = 'internal'
      AND publication."sourceId" = ${sourceId}
      AND publication."idempotencyKey" = intent."idempotencyKey"
  `);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "ProjectNotificationEvaluation" (
      "id", "ruleId", "ruleRevision", "projectId", "signalKind", "signalId",
      "outcome", "factsFingerprint", "publicationId", "errorCode", "evaluatedAt"
    )
    SELECT
      gen_random_uuid()::text, intent."ruleId", intent."ruleRevision", intent."projectId",
      ${input.evaluationSignalKind}, ${input.evaluationSignalId},
      'published', signal."factsFingerprint",
      intent."publicationId", NULL, ${input.reconciledAt}
    FROM "ProjectNotificationPublicationIntent" AS intent
    INNER JOIN "ProjectNotificationSignal" AS signal
      ON signal."signalKind" = ${input.evaluationSignalKind}
      AND signal."signalId" = ${input.evaluationSignalId}
    WHERE intent."signalKind" = ${root.signalKind}
      AND intent."signalId" = ${root.signalId}
      AND intent."projectId" = ${input.projectId}
      AND intent."status" = 'committed'
      AND intent."publicationId" IS NOT NULL
    ON CONFLICT ("ruleId", "signalKind", "signalId") DO NOTHING
  `);
}

export async function acquireProjectNotificationPublicationLock(
  tx: Prisma.TransactionClient,
  projectId: number,
) {
  const sourceId = `work.project-notification:${projectId}`;
  const publicationLockKey = `notification-publication:internal:${sourceId}`;
  await tx.$queryRaw<Array<{ lockResult: string }>>(Prisma.sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${publicationLockKey}, 0)
    )::text AS "lockResult"
  `);
}

export async function failProjectNotificationPublicationIntentsForSignal(
  tx: Prisma.TransactionClient,
  input: { signalKind: string; signalId: string; errorCode: string; failedAt: Date },
) {
  const [signal] = await tx.$queryRaw<Array<{
    id: string;
    projectId: number;
    factsFingerprint: string;
    snapshotJson: string;
  }>>(Prisma.sql`
    SELECT "id", "projectId", "factsFingerprint", "snapshotJson"
    FROM "ProjectNotificationSignal"
    WHERE "signalKind" = ${input.signalKind}
      AND "signalId" = ${input.signalId}
    LIMIT 1
  `);
  if (!signal) return;
  const root = await findProjectNotificationRootSignal(tx, signal.id);
  if (!root || root.projectId !== signal.projectId) {
    throw new Error("项目通知重驱根信号无效");
  }
  await reconcileProjectNotificationPublicationIntentsForSignal(tx, {
    projectId: signal.projectId,
    signalRecordId: signal.id,
    evaluationSignalKind: input.signalKind,
    evaluationSignalId: input.signalId,
    reconciledAt: input.failedAt,
  });
  await tx.$executeRaw(Prisma.sql`
    UPDATE "ProjectNotificationPublicationIntent"
    SET
      "status" = 'failed',
      "publicationId" = NULL,
      "committedAt" = NULL,
      "failedAt" = ${input.failedAt},
      "lastErrorCode" = ${input.errorCode.slice(0, 120)},
      "updatedAt" = ${input.failedAt}
    WHERE "signalKind" = ${root.signalKind}
      AND "signalId" = ${root.signalId}
      AND "projectId" = ${signal.projectId}
      AND "status" = 'publishing'
  `);
  const remainingRules = deadLetterProjectNotificationRuleRevisions(signal.snapshotJson);
  if (remainingRules.length > 0) {
    const pinnedValues = Prisma.join(remainingRules.map((rule) => (
      Prisma.sql`(${rule.ruleId}::integer, ${rule.revision}::integer)`
    )));
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ProjectNotificationEvaluation" (
        "id", "ruleId", "ruleRevision", "projectId", "signalKind", "signalId",
        "outcome", "factsFingerprint", "publicationId", "errorCode", "evaluatedAt"
      )
      SELECT
        gen_random_uuid()::text, pinned."ruleId", pinned."revision", ${signal.projectId},
        ${input.signalKind}, ${input.signalId}, 'error', ${signal.factsFingerprint},
        NULL, ${input.errorCode.slice(0, 120)}, ${input.failedAt}
      FROM (VALUES ${pinnedValues}) AS pinned("ruleId", "revision")
      INNER JOIN "ProjectNotificationRule" AS rule
        ON rule."id" = pinned."ruleId"
        AND rule."projectId" = ${signal.projectId}
      INNER JOIN "ProjectNotificationRuleRevision" AS revision
        ON revision."ruleId" = pinned."ruleId"
        AND revision."revision" = pinned."revision"
      ON CONFLICT ("ruleId", "signalKind", "signalId") DO NOTHING
    `);
  }
}

export function deadLetterProjectNotificationRuleRevisions(snapshotJson: string | undefined) {
  if (!snapshotJson) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(snapshotJson);
  } catch {
    return [];
  }
  if (!raw || typeof raw !== "object" || !("eligibleRuleRevisions" in raw)) return [];
  const revisions = (raw as { eligibleRuleRevisions?: unknown }).eligibleRuleRevisions;
  if (!Array.isArray(revisions)) return [];
  const unique = new Map<string, { ruleId: number; revision: number }>();
  for (const entry of revisions) {
    if (!entry || typeof entry !== "object") continue;
    const ruleId = "ruleId" in entry ? entry.ruleId : null;
    const revision = "revision" in entry ? entry.revision : null;
    if (!Number.isInteger(ruleId) || !Number.isInteger(revision)) continue;
    if ((ruleId as number) <= 0 || (revision as number) <= 0) continue;
    unique.set(`${ruleId}:${revision}`, { ruleId: ruleId as number, revision: revision as number });
  }
  return [...unique.values()];
}
