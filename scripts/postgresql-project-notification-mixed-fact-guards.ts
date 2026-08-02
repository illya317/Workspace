import assert from "node:assert/strict";

import { recalculateNotificationPublicationState } from "@workspace/platform/server/notification-delivery-outbox";
import { Prisma, prisma } from "@workspace/platform/server/prisma";

export async function assertMixedNotificationFactsAreGuarded(input: {
  projectId: number;
  ruleId: number;
}) {
  const [facts] = await prisma.$queryRaw<Array<{
    publicationId: string;
    deliveryId: number;
    recipientUserId: number | null;
    notificationId: number | null;
    intentId: string;
    signalRecordId: string;
  }>>(Prisma.sql`
    SELECT
      publication."id" AS "publicationId", delivery."id" AS "deliveryId",
      delivery."recipientUserId", delivery."notificationId", intent."id" AS "intentId",
      signal."id" AS "signalRecordId"
    FROM "NotificationPublication" AS publication
    INNER JOIN "NotificationDelivery" AS delivery
      ON delivery."publicationId" = publication."id"
    INNER JOIN "ProjectNotificationPublicationIntent" AS intent
      ON intent."publicationId" = publication."id"
    INNER JOIN "ProjectNotificationSignal" AS signal
      ON signal."projectId" = intent."projectId"
      AND signal."signalKind" = intent."signalKind"
      AND signal."signalId" = intent."signalId"
    WHERE publication."sourceKind" = 'internal'
      AND publication."sourceId" = ${`work.project-notification:${input.projectId}`}
    ORDER BY publication."createdAt" DESC
    LIMIT 1
  `);
  assert.ok(facts);
  assert.notEqual(facts.recipientUserId, null);
  assert.notEqual(facts.notificationId, null);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "NotificationDefinition"
      SET "updatedAt" = ${new Date()}
      WHERE "id" = (
        SELECT "definitionId" FROM "NotificationPublication"
        WHERE "id" = ${facts.publicationId}
      )
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "ProjectNotificationRule"
      SET "updatedAt" = ${new Date()}
      WHERE "id" = ${input.ruleId}
    `);
    await recalculateNotificationPublicationState(tx, facts.publicationId);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "NotificationDelivery"
      SET "attemptCount" = "attemptCount" + 1, "updatedAt" = ${new Date()}
      WHERE "id" = ${facts.deliveryId}
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "ProjectNotificationPublicationIntent"
      SET "updatedAt" = ${new Date()}
      WHERE "id" = ${facts.intentId}
    `);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "ProjectNotificationSignal"
      SET "lastErrorSummary" = "lastErrorSummary", "updatedAt" = ${new Date()}
      WHERE "id" = ${facts.signalRecordId}
    `);
  });

  await assertDatabaseGuardRejects(prisma.$executeRaw(Prisma.sql`
    UPDATE "NotificationDefinition"
    SET "createdAt" = "createdAt" + INTERVAL '1 millisecond'
    WHERE "id" = (
      SELECT "definitionId" FROM "NotificationPublication"
      WHERE "id" = ${facts.publicationId}
    )
  `));
  await assertDatabaseGuardRejects(prisma.$executeRaw(Prisma.sql`
    UPDATE "ProjectNotificationRule"
    SET "key" = "key" || '.tampered'
    WHERE "id" = ${input.ruleId}
  `));
  await assertDatabaseGuardRejects(prisma.$executeRaw(Prisma.sql`
    UPDATE "NotificationPublication"
    SET "sourceId" = "sourceId" || ':tampered'
    WHERE "id" = ${facts.publicationId}
  `));
  await assertDatabaseGuardRejects(prisma.$executeRaw(Prisma.sql`
    UPDATE "NotificationDelivery"
    SET "recipientUsername" = "recipientUsername" || '.tampered'
    WHERE "id" = ${facts.deliveryId}
  `));
  await assertDatabaseGuardRejects(prisma.$executeRaw(Prisma.sql`
    UPDATE "ProjectNotificationPublicationIntent"
    SET "requestJson" = '{}'
    WHERE "id" = ${facts.intentId}
  `));
  await assertDatabaseGuardRejects(prisma.$executeRaw(Prisma.sql`
    UPDATE "ProjectNotificationSignal"
    SET "snapshotJson" = '{}'
    WHERE "id" = ${facts.signalRecordId}
  `));

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "NotificationDelivery"
    SET "recipientUserId" = NULL, "notificationId" = NULL, "updatedAt" = ${new Date()}
    WHERE "id" = ${facts.deliveryId}
  `);
  await assertDatabaseGuardRejects(prisma.$executeRaw(Prisma.sql`
    UPDATE "NotificationDelivery"
    SET "recipientUserId" = ${facts.recipientUserId}
    WHERE "id" = ${facts.deliveryId}
  `));
  await assertDatabaseGuardRejects(prisma.$executeRaw(Prisma.sql`
    UPDATE "NotificationDelivery"
    SET "notificationId" = ${facts.notificationId}
    WHERE "id" = ${facts.deliveryId}
  `));

  for (const statement of [
    Prisma.sql`DELETE FROM "NotificationDelivery" WHERE "id" = ${facts.deliveryId}`,
    Prisma.sql`DELETE FROM "NotificationPublication" WHERE "id" = ${facts.publicationId}`,
    Prisma.sql`DELETE FROM "ProjectNotificationPublicationIntent" WHERE "id" = ${facts.intentId}`,
    Prisma.sql`DELETE FROM "ProjectNotificationSignal" WHERE "id" = ${facts.signalRecordId}`,
  ]) {
    await assertDatabaseGuardRejects(prisma.$executeRaw(statement));
  }
  for (const table of [
    "NotificationDelivery",
    "NotificationPublication",
    "ProjectNotificationPublicationIntent",
    "ProjectNotificationSignal",
  ]) {
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
        throw new Error("notification truncate guard missing");
      }),
      /append-only/,
    );
  }
}

async function assertDatabaseGuardRejects(operation: Promise<unknown>) {
  await assert.rejects(operation, /immutable|append-only/);
}
