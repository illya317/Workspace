import "dotenv/config";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import {
  buildNotificationPublicationCommand,
  NOTIFICATION_PUBLICATION_COMMIT_GUARD_REJECTED,
  NOTIFICATION_PUBLICATION_RATE_LIMITED,
  publishNotificationDefinition,
  saveNotificationDefinition,
  type NotificationPublicationCommand,
} from "@workspace/platform/server/notification-publishing";
import { publishConfiguredNotification } from "@workspace/platform/server/notifications";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import {
  canCommitProjectNotificationPublication,
  createProjectNotificationPublicationIntent,
  failProjectNotificationPublicationIntentsForSignal,
  findProjectNotificationRedriveSourceIntent,
  reactivateProjectNotificationPublicationIntentForRedrive,
} from "@workspace/work/server/project-notification-publication-intent";
import {
  evaluatePersistedProjectNotificationSignal,
} from "@workspace/work/server/project-notification-evaluator";
import {
  createStoredProjectNotificationSnapshot,
  ProjectNotificationSignalProcessingError,
  projectNotificationSignalFingerprint,
  type ClaimedProjectNotificationSignal,
  type StoredProjectNotificationSnapshot,
} from "@workspace/work/server/project-notification-signal-contract";
import {
  drainProjectNotificationSignals,
  enqueueProjectNotificationSignal,
} from "@workspace/work/server/project-notification-signals";

import { requirePostgresqlCiDatabase } from "./testing/e2e-database";
import { assertMixedNotificationFactsAreGuarded } from "./postgresql-project-notification-mixed-fact-guards";

type PublishCommand = Extract<NotificationPublicationCommand, { kind: "publish" }>;

type Fixture = {
  token: string;
  actorUserId: number;
  recipientUsername: string;
  project: {
    id: number;
    code: string | null;
    name: string;
    status: string;
    projectLevel: string;
    completionPercent: number | null;
    plannedStartDate: Date | null;
    plannedEndDate: Date | null;
    riskNote: string | null;
    isArchived: boolean;
    version: number;
  };
  ruleId: number;
  publishedAt: Date;
  definitionKey: string;
};

type PreparedScenario = {
  sourceSignalRecordId: string;
  signalId: string;
  leaseToken: string;
  attemptCount: number;
  intentId: string;
  idempotencyKey: string;
  command: PublishCommand;
  occurredAt: Date;
  snapshotJson: string;
  factsFingerprint: string;
};

function requireServiceOk<T>(result: { ok: true; data: T } | { ok: false; error: string }) {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

async function createFixture(): Promise<Fixture> {
  const token = `pgprojnotify${process.pid}${Date.now()}`;
  const [actor, recipient] = await Promise.all([
    prisma.user.create({ data: { username: `${token}actor`, canLogin: true } }),
    prisma.user.create({ data: { username: `${token}recipient`, canLogin: true } }),
  ]);
  const project = await prisma.project.create({
    data: { name: `PG notification durability ${token}` },
    select: {
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
    },
  });
  const definitionKey = `custom.${token}`;
  const definition = requireServiceOk(await saveNotificationDefinition(actor.id, {
    key: definitionKey,
    label: `PG project notification ${token}`,
    description: "Disposable stale-publisher fence fixture",
    titleTemplate: "项目 {{project_name}} 通知",
    bodyTemplate: "项目 {{project_name}} 的受监管通知。",
    hrefTemplate: "/work/projects",
    responseMode: "read",
    isImportant: false,
    allowProjectMonitoring: true,
    allowUserApi: false,
    allowedOpenApiClientIds: [],
  }));
  requireServiceOk(await publishNotificationDefinition(
    actor.id,
    definition.key,
    definition.version,
  ));
  const publishedAt = new Date(Date.now() - 1_000);
  const conditionJson = JSON.stringify({
    op: "eq",
    path: "project.status",
    value: project.status,
  });
  const rule = await prisma.projectNotificationRule.create({
    data: {
      projectId: project.id,
      key: `pg.${token}`,
      label: `PG durability ${token}`,
      definitionKey,
      eventType: "project.updated",
      conditionJson,
      audiencePolicyJson: JSON.stringify({ roles: ["A"] }),
      channelPolicyJson: JSON.stringify({ channels: ["workspace"] }),
      status: "published",
      revision: 1,
      publishedRevision: 1,
      version: 1,
      createdByUserId: actor.id,
      updatedByUserId: actor.id,
      publishedByUserId: actor.id,
      publishedAt,
    },
  });
  await prisma.projectNotificationRuleRevision.create({
    data: {
      ruleId: rule.id,
      revision: 1,
      key: rule.key,
      label: rule.label,
      definitionKey,
      eventType: rule.eventType,
      conditionJson,
      conditionFingerprint: createHash("sha256").update(conditionJson).digest("hex"),
      audiencePolicyJson: rule.audiencePolicyJson,
      channelPolicyJson: rule.channelPolicyJson,
      cooldownSeconds: 0,
      createdByUserId: actor.id,
      createdAt: publishedAt,
    },
  });
  return {
    token,
    actorUserId: actor.id,
    recipientUsername: recipient.username,
    project,
    ruleId: rule.id,
    publishedAt,
    definitionKey,
  };
}

async function prepareSourceScenario(
  fixture: Fixture,
  suffix: string,
  attemptCount = 8,
): Promise<PreparedScenario> {
  const occurredAt = new Date();
  const signalId = `pg:${fixture.token}:${suffix}`;
  const sourceSignalRecordId = randomUUID();
  const leaseToken = randomUUID();
  const snapshot = createStoredProjectNotificationSnapshot({
    project: fixture.project,
    signalKind: "project.updated",
    changedField: "status",
    occurredAt,
    eligibleRuleRevisions: [{
      ruleId: fixture.ruleId,
      revision: 1,
      publishedAt: fixture.publishedAt,
    }],
  });
  const snapshotJson = JSON.stringify(snapshot);
  const factsFingerprint = projectNotificationSignalFingerprint(snapshot);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "ProjectNotificationSignal" (
      "id", "projectId", "projectVersion", "signalKind", "signalId", "changedField",
      "snapshotJson", "factsFingerprint", "occurredAt", "status", "attemptCount",
      "nextAttemptAt", "leaseToken", "leaseExpiresAt", "createdAt", "updatedAt"
    ) VALUES (
      ${sourceSignalRecordId}, ${fixture.project.id}, ${fixture.project.version},
      'project.updated', ${signalId}, 'status', ${snapshotJson}, ${factsFingerprint},
      ${occurredAt}, 'leased', ${attemptCount}, ${occurredAt}, ${leaseToken},
      ${new Date(Date.now() + 60_000)}, ${occurredAt}, ${occurredAt}
    )
  `);
  const idempotencyKey = `project-rule:${fixture.ruleId}:r1:${createHash("sha256")
    .update(signalId).digest("hex").slice(0, 32)}`;
  const request = {
    definitionKey: fixture.definitionKey,
    idempotencyKey,
    usernames: [fixture.recipientUsername],
    variables: { project_name: fixture.project.name },
    deliveryChannels: ["workspace"] as const,
  };
  const intent = await prisma.$transaction((tx) => (
    createProjectNotificationPublicationIntent(tx, {
      ruleId: fixture.ruleId,
      ruleRevision: 1,
      projectId: fixture.project.id,
      signalKind: "project.updated",
      signalId,
      request,
      preparedAt: occurredAt,
    })
  ));
  const { deliveryChannels, ...publicationRequest } = request;
  const command = await buildNotificationPublicationCommand({
    source: {
      kind: "internal",
      id: `work.project-notification:${fixture.project.id}`,
      label: "项目通知监管",
    },
    deliveryChannels,
    request: publicationRequest,
  });
  assert.equal(command.ok, true, command.ok ? undefined : command.issue.message);
  if (!command.ok || command.data.kind !== "publish") {
    throw new Error("Expected a fresh project notification publication command");
  }
  return {
    sourceSignalRecordId,
    signalId,
    leaseToken,
    attemptCount,
    intentId: intent.id,
    idempotencyKey,
    command: command.data,
    occurredAt,
    snapshotJson,
    factsFingerprint,
  };
}

async function assertNonMatchingRulesDoNotEnqueue(fixture: Fixture) {
  const signalId = `pg:${fixture.token}:no-matching-rule`;
  const result = await prisma.$transaction((tx) => enqueueProjectNotificationSignal(tx, {
    project: fixture.project,
    signalKind: "project.scheduled",
    signalId,
    changedField: "scheduled",
    occurredAt: new Date(),
  }));
  assert.equal(result.queued, false);
  assert.equal(result.id, null);
  assert.equal(await prisma.projectNotificationSignal.count({ where: { signalId } }), 0);
}

async function deadLetterSignal(input: {
  signalRecordId: string;
  signalId: string;
  leaseToken: string;
  errorCode: string;
}) {
  const failedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const changed = await tx.$executeRaw(Prisma.sql`
      UPDATE "ProjectNotificationSignal"
      SET
        "status" = 'failed', "nextAttemptAt" = NULL, "leaseToken" = NULL,
        "leaseExpiresAt" = NULL, "processedAt" = NULL, "failedAt" = ${failedAt},
        "lastErrorCode" = ${input.errorCode}, "lastErrorSummary" = 'PG forced dead letter',
        "updatedAt" = ${failedAt}
      WHERE "id" = ${input.signalRecordId}
        AND "status" = 'leased'
        AND "leaseToken" = ${input.leaseToken}
    `);
    assert.equal(changed, 1);
    await failProjectNotificationPublicationIntentsForSignal(tx, {
      signalKind: "project.updated",
      signalId: input.signalId,
      errorCode: input.errorCode,
      failedAt,
    });
  });
}

async function createRedriveChild(
  fixture: Fixture,
  source: PreparedScenario,
  suffix: string,
  parent: {
    signalRecordId: string;
    signalId: string;
    attemptCount: number;
  } = {
    signalRecordId: source.sourceSignalRecordId,
    signalId: source.signalId,
    attemptCount: source.attemptCount,
  },
) {
  const signalRecordId = randomUUID();
  const signalId = `redrive:${createHash("sha256").update(parent.signalId).digest("hex")}:a${parent.attemptCount}`;
  const leaseToken = randomUUID();
  const attemptCount = 1;
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ProjectNotificationSignal" (
        "id", "projectId", "projectVersion", "signalKind", "signalId", "changedField",
        "snapshotJson", "factsFingerprint", "occurredAt", "status", "attemptCount",
        "nextAttemptAt", "leaseToken", "leaseExpiresAt", "createdAt", "updatedAt"
      ) VALUES (
        ${signalRecordId}, ${fixture.project.id}, ${fixture.project.version},
        'project.updated', ${signalId}, 'status', ${source.snapshotJson},
        ${source.factsFingerprint}, ${source.occurredAt}, 'leased', ${attemptCount},
        ${now}, ${leaseToken}, ${new Date(Date.now() + 60_000)}, ${now}, ${now}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ProjectNotificationSignalRedriveEvent" (
        "id", "projectId", "sourceSignalRecordId", "redriveSignalRecordId",
        "sourceAttemptCount", "actorUserId", "reason", "occurredAt"
      ) VALUES (
        ${randomUUID()}, ${fixture.project.id}, ${parent.signalRecordId},
        ${signalRecordId}, ${parent.attemptCount}, ${fixture.actorUserId},
        ${`PG ${suffix} redrive`}, ${now}
      )
    `);
    const sourceIntent = await findProjectNotificationRedriveSourceIntent(tx, {
      redriveSignalRecordId: signalRecordId,
      ruleId: fixture.ruleId,
    });
    assert.equal(sourceIntent?.id, source.intentId);
    const reactivated = await reactivateProjectNotificationPublicationIntentForRedrive(tx, {
      intentId: source.intentId,
      redriveSignalRecordId: signalRecordId,
      reactivatedAt: now,
    });
    assert.equal(reactivated?.status, "publishing");
  });
  return { signalRecordId, signalId, leaseToken, attemptCount };
}

function publicationGuard(
  scenario: Pick<PreparedScenario, "intentId">,
  signal: { signalRecordId: string; leaseToken: string; attemptCount: number },
) {
  return (tx: Prisma.TransactionClient) => canCommitProjectNotificationPublication(tx, {
    intentId: scenario.intentId,
    signalRecordId: signal.signalRecordId,
    leaseToken: signal.leaseToken,
    attemptCount: signal.attemptCount,
  });
}

async function publicationCounts(fixture: Fixture, idempotencyKey: string) {
  const [row] = await prisma.$queryRaw<Array<{
    publications: number;
    notifications: number;
    deliveries: number;
  }>>(Prisma.sql`
    SELECT
      COUNT(DISTINCT publication."id")::int AS "publications",
      COUNT(DISTINCT notification."id")::int AS "notifications",
      COUNT(DISTINCT delivery."id")::int AS "deliveries"
    FROM "NotificationPublication" AS publication
    LEFT JOIN "Notification" AS notification ON notification."dispatchId" = publication."id"
    LEFT JOIN "NotificationDelivery" AS delivery ON delivery."publicationId" = publication."id"
    WHERE publication."sourceKind" = 'internal'
      AND publication."sourceId" = ${`work.project-notification:${fixture.project.id}`}
      AND publication."idempotencyKey" = ${idempotencyKey}
  `);
  return row ?? { publications: 0, notifications: 0, deliveries: 0 };
}

async function assertFailedLedger(intentId: string, signalId: string) {
  const [intent] = await prisma.$queryRaw<Array<{ status: string }>>(Prisma.sql`
    SELECT "status" FROM "ProjectNotificationPublicationIntent" WHERE "id" = ${intentId}
  `);
  const [evaluation] = await prisma.$queryRaw<Array<{ outcome: string }>>(Prisma.sql`
    SELECT "outcome"
    FROM "ProjectNotificationEvaluation"
    WHERE "signalKind" = 'project.updated' AND "signalId" = ${signalId}
  `);
  assert.equal(intent?.status, "failed");
  assert.equal(evaluation?.outcome, "error");
}

async function assertStaleSourcePublisherIsFenced(fixture: Fixture) {
  const scenario = await prepareSourceScenario(fixture, "stalesource");
  await deadLetterSignal({
    signalRecordId: scenario.sourceSignalRecordId,
    signalId: scenario.signalId,
    leaseToken: scenario.leaseToken,
    errorCode: "signal_attempts_exhausted",
  });
  const result = await publishConfiguredNotification(
    scenario.command,
    publicationGuard(scenario, {
      signalRecordId: scenario.sourceSignalRecordId,
      leaseToken: scenario.leaseToken,
      attemptCount: scenario.attemptCount,
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 409);
    assert.equal(result.details?.code, NOTIFICATION_PUBLICATION_COMMIT_GUARD_REJECTED);
  }
  assert.deepEqual(await publicationCounts(fixture, scenario.idempotencyKey), {
    publications: 0,
    notifications: 0,
    deliveries: 0,
  });
  await assertFailedLedger(scenario.intentId, scenario.signalId);
}

async function assertReclaimedLeaseCanPublishAfterStaleWorkerExits(fixture: Fixture) {
  const scenario = await prepareSourceScenario(fixture, "reclaimedlease", 1);
  const replacementLeaseToken = randomUUID();
  const replacementAttemptCount = 2;
  const replacementLeaseExpiresAt = new Date(Date.now() + 120_000);
  const reclaimed = await prisma.$executeRaw(Prisma.sql`
    UPDATE "ProjectNotificationSignal"
    SET
      "attemptCount" = ${replacementAttemptCount},
      "leaseToken" = ${replacementLeaseToken},
      "leaseExpiresAt" = ${replacementLeaseExpiresAt},
      "updatedAt" = ${new Date()}
    WHERE "id" = ${scenario.sourceSignalRecordId}
      AND "status" = 'leased'
      AND "leaseToken" = ${scenario.leaseToken}
      AND "attemptCount" = ${scenario.attemptCount}
  `);
  assert.equal(reclaimed, 1);
  const snapshot = JSON.parse(scenario.snapshotJson) as StoredProjectNotificationSnapshot;
  const staleSignal = claimedSignal(scenario, {
    leaseToken: scenario.leaseToken,
    attemptCount: scenario.attemptCount,
  });
  await assert.rejects(
    () => evaluatePersistedProjectNotificationSignal({ signal: staleSignal, snapshot }),
    (error: unknown) => (
      error instanceof ProjectNotificationSignalProcessingError
      && error.code === "publication_lease_lost"
      && error.permanent === false
    ),
  );
  const [unpollutedIntent] = await prisma.$queryRaw<Array<{ status: string }>>(Prisma.sql`
    SELECT "status" FROM "ProjectNotificationPublicationIntent"
    WHERE "id" = ${scenario.intentId}
  `);
  const [staleEvaluation] = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "ProjectNotificationEvaluation"
    WHERE "ruleId" = ${fixture.ruleId}
      AND "signalKind" = 'project.updated'
      AND "signalId" = ${scenario.signalId}
  `);
  assert.equal(unpollutedIntent?.status, "publishing");
  assert.equal(staleEvaluation, undefined);
  assert.deepEqual(await publicationCounts(fixture, scenario.idempotencyKey), {
    publications: 0,
    notifications: 0,
    deliveries: 0,
  });

  const replacementSignal = claimedSignal(scenario, {
    leaseToken: replacementLeaseToken,
    attemptCount: replacementAttemptCount,
    leaseExpiresAt: replacementLeaseExpiresAt,
  });
  const processed = await evaluatePersistedProjectNotificationSignal({
    signal: replacementSignal,
    snapshot,
  });
  assert.equal(processed.published, 1);
  assert.deepEqual(await publicationCounts(fixture, scenario.idempotencyKey), {
    publications: 1,
    notifications: 1,
    deliveries: 1,
  });
  const [committedIntent] = await prisma.$queryRaw<Array<{ status: string }>>(Prisma.sql`
    SELECT "status" FROM "ProjectNotificationPublicationIntent"
    WHERE "id" = ${scenario.intentId}
  `);
  const [publishedEvaluation] = await prisma.$queryRaw<Array<{ outcome: string }>>(Prisma.sql`
    SELECT "outcome" FROM "ProjectNotificationEvaluation"
    WHERE "ruleId" = ${fixture.ruleId}
      AND "signalKind" = 'project.updated'
      AND "signalId" = ${scenario.signalId}
  `);
  assert.equal(committedIntent?.status, "committed");
  assert.equal(publishedEvaluation?.outcome, "published");
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "ProjectNotificationSignal"
    SET
      "status" = 'completed', "nextAttemptAt" = NULL, "leaseToken" = NULL,
      "leaseExpiresAt" = NULL, "processedAt" = ${new Date()}, "updatedAt" = ${new Date()}
    WHERE "id" = ${scenario.sourceSignalRecordId}
      AND "status" = 'leased'
      AND "leaseToken" = ${replacementLeaseToken}
      AND "attemptCount" = ${replacementAttemptCount}
  `);
}

async function assertStaleRedrivePublisherIsFenced(fixture: Fixture) {
  const scenario = await prepareSourceScenario(fixture, "staleredrive");
  await deadLetterSignal({
    signalRecordId: scenario.sourceSignalRecordId,
    signalId: scenario.signalId,
    leaseToken: scenario.leaseToken,
    errorCode: "signal_attempts_exhausted",
  });
  const child = await createRedriveChild(fixture, scenario, "stale-child");
  await deadLetterSignal({
    signalRecordId: child.signalRecordId,
    signalId: child.signalId,
    leaseToken: child.leaseToken,
    errorCode: "signal_attempts_exhausted",
  });
  const result = await publishConfiguredNotification(
    scenario.command,
    publicationGuard(scenario, child),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 409);
  assert.deepEqual(await publicationCounts(fixture, scenario.idempotencyKey), {
    publications: 0,
    notifications: 0,
    deliveries: 0,
  });
  await assertFailedLedger(scenario.intentId, child.signalId);
  const grandchild = await createRedriveChild(
    fixture,
    scenario,
    "second-level-child",
    child,
  );
  await deadLetterSignal({
    signalRecordId: grandchild.signalRecordId,
    signalId: grandchild.signalId,
    leaseToken: grandchild.leaseToken,
    errorCode: "signal_attempts_exhausted",
  });
  const grandchildResult = await publishConfiguredNotification(
    scenario.command,
    publicationGuard(scenario, grandchild),
  );
  assert.equal(grandchildResult.ok, false);
  if (!grandchildResult.ok) assert.equal(grandchildResult.status, 409);
  assert.deepEqual(await publicationCounts(fixture, scenario.idempotencyKey), {
    publications: 0,
    notifications: 0,
    deliveries: 0,
  });
  await assertFailedLedger(scenario.intentId, grandchild.signalId);
}

async function assertPublisherWinReconcilesWithoutDuplicate(fixture: Fixture) {
  const scenario = await prepareSourceScenario(fixture, "publisherwins");
  await deadLetterSignal({
    signalRecordId: scenario.sourceSignalRecordId,
    signalId: scenario.signalId,
    leaseToken: scenario.leaseToken,
    errorCode: "signal_attempts_exhausted",
  });
  const child = await createRedriveChild(fixture, scenario, "publisher-wins-child");
  const published = await publishConfiguredNotification(
    scenario.command,
    publicationGuard(scenario, child),
  );
  assert.equal(published.ok, true);
  await deadLetterSignal({
    signalRecordId: child.signalRecordId,
    signalId: child.signalId,
    leaseToken: child.leaseToken,
    errorCode: "signal_attempts_exhausted",
  });
  const replay = await publishConfiguredNotification(
    scenario.command,
    publicationGuard(scenario, child),
  );
  assert.equal(replay.ok, true);
  if (replay.ok) assert.equal(replay.data.replayed, true);
  assert.deepEqual(await publicationCounts(fixture, scenario.idempotencyKey), {
    publications: 1,
    notifications: 1,
    deliveries: 1,
  });
  const [intent] = await prisma.$queryRaw<Array<{
    status: string;
    publicationId: string | null;
  }>>(Prisma.sql`
    SELECT "status", "publicationId"
    FROM "ProjectNotificationPublicationIntent"
    WHERE "id" = ${scenario.intentId}
  `);
  const [evaluation] = await prisma.$queryRaw<Array<{
    outcome: string;
    publicationId: string | null;
  }>>(Prisma.sql`
    SELECT "outcome", "publicationId"
    FROM "ProjectNotificationEvaluation"
    WHERE "ruleId" = ${fixture.ruleId}
      AND "signalKind" = 'project.updated'
      AND "signalId" = ${child.signalId}
  `);
  assert.equal(intent?.status, "committed");
  assert.equal(evaluation?.outcome, "published");
  assert.equal(evaluation?.publicationId, intent?.publicationId);
}

async function assertRateLimitDeferralPreservesAttemptBudget(fixture: Fixture) {
  const scenario = await prepareSourceScenario(fixture, "rate-window", 0);
  const newerScenario = await prepareSourceScenario(fixture, "rate-window-newer", 0);
  const [definition] = await prisma.$queryRaw<Array<{
    id: number;
    publishedRevision: number;
  }>>(Prisma.sql`
    SELECT "id", "publishedRevision"
    FROM "NotificationDefinition"
    WHERE "key" = ${fixture.definitionKey}
  `);
  assert.ok(definition?.publishedRevision);
  const fillerCreatedAt = new Date(Date.now() - 55_000);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "NotificationPublication" (
      "id", "definitionId", "definitionKey", "definitionRevision", "sourceKind",
      "sourceId", "sourceLabel", "idempotencyKey", "fingerprint", "audienceJson",
      "status", "recipientCount", "deliveryCount", "pendingDeliveryCount",
      "deliveredDeliveryCount", "failedDeliveryCount", "createdAt"
    ) VALUES (
      ${randomUUID()}, ${definition.id}, ${fixture.definitionKey},
      ${definition.publishedRevision}, 'internal',
      ${`work.project-notification:${fixture.project.id}`}, 'PG rate window',
      ${`pg-rate-window:${fixture.token}`},
      ${createHash("sha256").update(`pg-rate-window:${fixture.token}`).digest("hex")},
      '[]', 'committed', 500, 0, 0, 0, 0, ${fillerCreatedAt}
    )
  `);
  const limited = await buildNotificationPublicationCommand({
    source: scenario.command.source,
    deliveryChannels: scenario.command.deliveryChannels,
    request: scenario.command.request,
  });
  assert.equal(limited.ok, false);
  if (!limited.ok) {
    assert.equal(limited.issue.status, 429);
    assert.equal(limited.issue.details?.code, NOTIFICATION_PUBLICATION_RATE_LIMITED);
    assert.equal(typeof limited.issue.details?.retryAt, "string");
    assert.equal(typeof limited.issue.details?.retryAfter, "number");
  }
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "ProjectNotificationSignal"
    SET
      "status" = 'retrying', "attemptCount" = 0, "nextAttemptAt" = ${new Date()},
      "leaseToken" = NULL, "leaseExpiresAt" = NULL, "updatedAt" = ${new Date()}
    WHERE "id" = ${scenario.sourceSignalRecordId}
  `);
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "ProjectNotificationSignal"
    SET
      "status" = 'pending', "attemptCount" = 0, "nextAttemptAt" = ${new Date()},
      "leaseToken" = NULL, "leaseExpiresAt" = NULL, "updatedAt" = ${new Date()}
    WHERE "id" = ${newerScenario.sourceSignalRecordId}
  `);

  for (let windowNo = 0; windowNo < 9; windowNo += 1) {
    const deferredAt = new Date();
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "ProjectNotificationSignal"
      SET "nextAttemptAt" = ${deferredAt}, "updatedAt" = ${deferredAt}
      WHERE "id" = ${scenario.sourceSignalRecordId}
        AND "status" = 'retrying'
    `);
    const drainOnce = () => drainProjectNotificationSignals({
      signalIds: [windowNo === 0 ? newerScenario.signalId : scenario.signalId],
      batchSize: 1,
      maxBatches: 1,
      now: deferredAt,
    });
    const drains = windowNo === 0
      ? await Promise.all([drainOnce(), drainOnce()])
      : [await drainOnce()];
    assert.equal(drains.reduce((sum, item) => sum + item.claimed, 0), 1);
    assert.equal(drains.reduce((sum, item) => sum + item.retried, 0), 1);
    const [state] = await prisma.$queryRaw<Array<{
      status: string;
      attemptCount: number;
      nextAttemptAt: Date | null;
      lastErrorCode: string | null;
    }>>(Prisma.sql`
      SELECT "status", "attemptCount", "nextAttemptAt", "lastErrorCode"
      FROM "ProjectNotificationSignal"
      WHERE "id" = ${scenario.sourceSignalRecordId}
    `);
    assert.equal(state?.status, "retrying");
    assert.equal(state?.attemptCount, 0);
    assert.equal(state?.lastErrorCode, "publication_rate_limited");
    assert.ok((state?.nextAttemptAt?.getTime() ?? 0) >= deferredAt.getTime() + 60_000);
    if (windowNo === 0) {
      const [newerState] = await prisma.$queryRaw<Array<{
        status: string;
        attemptCount: number;
      }>>(Prisma.sql`
        SELECT "status", "attemptCount"
        FROM "ProjectNotificationSignal"
        WHERE "id" = ${newerScenario.sourceSignalRecordId}
      `);
      assert.equal(newerState?.status, "pending");
      assert.equal(newerState?.attemptCount, 0);
    }
  }
  const [unpollutedIntent] = await prisma.$queryRaw<Array<{ status: string }>>(Prisma.sql`
    SELECT "status" FROM "ProjectNotificationPublicationIntent"
    WHERE "id" = ${scenario.intentId}
  `);
  const evaluationCount = await prisma.projectNotificationEvaluation.count({
    where: {
      ruleId: fixture.ruleId,
      signalKind: "project.updated",
      signalId: scenario.signalId,
    },
  });
  assert.equal(unpollutedIntent?.status, "publishing");
  assert.equal(evaluationCount, 0);

  const safeWindowAt = fillerCreatedAt.getTime() + 61_000;
  const remainingWaitMs = Math.max(0, safeWindowAt - Date.now() + 100);
  if (remainingWaitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingWaitMs));
  }
  const finalDueAt = new Date();
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "ProjectNotificationSignal"
    SET "nextAttemptAt" = ${finalDueAt}, "updatedAt" = ${finalDueAt}
    WHERE "id" = ${scenario.sourceSignalRecordId}
      AND "status" = 'retrying'
  `);
  const nextWindow = await drainProjectNotificationSignals({
    signalIds: [scenario.signalId],
    batchSize: 1,
    maxBatches: 1,
    now: finalDueAt,
  });
  assert.equal(nextWindow.completed, 1);
  assert.equal(nextWindow.published, 1);
  const [completed] = await prisma.$queryRaw<Array<{
    status: string;
    attemptCount: number;
  }>>(Prisma.sql`
    SELECT "status", "attemptCount"
    FROM "ProjectNotificationSignal"
    WHERE "id" = ${scenario.sourceSignalRecordId}
  `);
  assert.equal(completed?.status, "completed");
  assert.equal(completed?.attemptCount, 1);
  const newerWindow = await drainProjectNotificationSignals({
    signalIds: [newerScenario.signalId],
    batchSize: 1,
    maxBatches: 1,
    now: new Date(),
  });
  assert.equal(newerWindow.completed, 1);
  assert.equal(newerWindow.published, 1);
}

export async function assertProjectNotificationPublicationDurability() {
  const database = requirePostgresqlCiDatabase();
  const fixture = await createFixture();
  await assertNonMatchingRulesDoNotEnqueue(fixture);
  await assertStaleSourcePublisherIsFenced(fixture);
  await assertReclaimedLeaseCanPublishAfterStaleWorkerExits(fixture);
  await assertStaleRedrivePublisherIsFenced(fixture);
  await assertPublisherWinReconcilesWithoutDuplicate(fixture);
  await assertMixedNotificationFactsAreGuarded({
    projectId: fixture.project.id,
    ruleId: fixture.ruleId,
  });
  await assertRateLimitDeferralPreservesAttemptBudget(fixture);
  console.log(
    `✓ project notification stale publishers are fenced in PostgreSQL (${database.databaseName})`,
  );
}

function claimedSignal(
  scenario: PreparedScenario,
  lease: { leaseToken: string; attemptCount: number; leaseExpiresAt?: Date },
): ClaimedProjectNotificationSignal {
  return {
    id: scenario.sourceSignalRecordId,
    projectId: JSON.parse(scenario.snapshotJson).project.id,
    projectVersion: JSON.parse(scenario.snapshotJson).project.version,
    signalKind: "project.updated",
    signalId: scenario.signalId,
    changedField: "status",
    snapshotJson: scenario.snapshotJson,
    factsFingerprint: scenario.factsFingerprint,
    occurredAt: scenario.occurredAt,
    status: "leased",
    attemptCount: lease.attemptCount,
    nextAttemptAt: scenario.occurredAt,
    leaseToken: lease.leaseToken,
    leaseExpiresAt: lease.leaseExpiresAt ?? new Date(Date.now() + 60_000),
    createdAt: scenario.occurredAt,
  };
}

async function main() {
  try {
    await assertProjectNotificationPublicationDurability();
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
