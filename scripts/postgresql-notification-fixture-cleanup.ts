import assert from "node:assert/strict";

import { prisma, Prisma } from "@workspace/platform/server/prisma";
import { requirePostgresqlCiDatabase } from "./testing/e2e-database";

export type NotificationPublicationFixtureIdentity = {
  token: string;
  definitionPrefix: string;
  usernamePrefix: string;
  sourcePrefix: string;
  clientKeyHashPrefix: string;
};

export async function cleanupNotificationPublicationFixture(
  fixture: NotificationPublicationFixtureIdentity,
) {
  requirePostgresqlCiDatabase();
  const users = await prisma.user.findMany({
    where: { username: { startsWith: fixture.usernamePrefix } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const publications = await prisma.notificationPublication.findMany({
    where: {
      OR: [
        { sourceId: { startsWith: fixture.sourcePrefix } },
        { definitionKey: { startsWith: fixture.definitionPrefix } },
      ],
    },
    select: { id: true },
  });
  const publicationIds = publications.map((publication) => publication.id);

  await prisma.$transaction(async (tx) => {
    await disableFixtureCleanupTriggers(tx);
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM "NotificationDefinitionLifecycleEvent"
      WHERE "definitionId" IN (
        SELECT "id"
        FROM "NotificationDefinition"
        WHERE "key" LIKE ${`${fixture.definitionPrefix}%`}
      )
    `);
    if (userIds.length > 0) {
      await tx.notification.deleteMany({
        where: { recipientUserId: { in: userIds } },
      });
      await tx.notificationDelivery.deleteMany({
        where: { recipientUserId: { in: userIds } },
      });
    }
    await tx.notificationDelivery.deleteMany({
      where: { recipientUsername: { startsWith: fixture.usernamePrefix } },
    });
    if (publicationIds.length > 0) {
      await tx.notificationDelivery.deleteMany({
        where: { publicationId: { in: publicationIds } },
      });
      await tx.notificationPublication.deleteMany({
        where: { id: { in: publicationIds } },
      });
    }
    await tx.notificationDefinition.deleteMany({
      where: { key: { startsWith: fixture.definitionPrefix } },
    });
    await tx.openApiClient.deleteMany({
      where: { keyHash: { startsWith: fixture.clientKeyHashPrefix } },
    });
    if (userIds.length > 0) {
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await enableFixtureCleanupTriggers(tx);
  });

  const [
    definitions,
    publicationsAfterCleanup,
    notifications,
    deliveries,
    usersAfterCleanup,
    clients,
  ] = await Promise.all([
    prisma.notificationDefinition.count({
      where: { key: { startsWith: fixture.definitionPrefix } },
    }),
    prisma.notificationPublication.count({
      where: {
        OR: [
          { sourceId: { startsWith: fixture.sourcePrefix } },
          { definitionKey: { startsWith: fixture.definitionPrefix } },
        ],
      },
    }),
    prisma.notification.count({
      where: { title: { startsWith: `PG ${fixture.token}` } },
    }),
    prisma.notificationDelivery.count({
      where: { recipientUsername: { startsWith: fixture.usernamePrefix } },
    }),
    prisma.user.count({
      where: { username: { startsWith: fixture.usernamePrefix } },
    }),
    prisma.openApiClient.count({
      where: { keyHash: { startsWith: fixture.clientKeyHashPrefix } },
    }),
  ]);
  assert.deepEqual(
    {
      definitions,
      publications: publicationsAfterCleanup,
      notifications,
      deliveries,
      users: usersAfterCleanup,
      clients,
    },
    {
      definitions: 0,
      publications: 0,
      notifications: 0,
      deliveries: 0,
      users: 0,
      clients: 0,
    },
    "notification publication PostgreSQL fixtures are cleaned precisely",
  );
  console.log("✓ notification publication PostgreSQL fixtures are cleaned precisely");
}

async function disableFixtureCleanupTriggers(tx: Prisma.TransactionClient) {
  await tx.$executeRawUnsafe(
    'ALTER TABLE "NotificationPublication" DISABLE TRIGGER "NotificationPublication_no_delete"',
  );
  await tx.$executeRawUnsafe(
    'ALTER TABLE "NotificationDelivery" DISABLE TRIGGER "NotificationDelivery_no_delete"',
  );
  await tx.$executeRawUnsafe(
    'ALTER TABLE "NotificationDefinitionLifecycleEvent" DISABLE TRIGGER "NotificationDefinitionLifecycleEvent_append_only"',
  );
  await tx.$executeRawUnsafe(
    'ALTER TABLE "NotificationDefinitionRevision" DISABLE TRIGGER "NotificationDefinitionRevision_append_only"',
  );
  await tx.$executeRawUnsafe(
    'ALTER TABLE "NotificationDeliveryAttempt" DISABLE TRIGGER "NotificationDeliveryAttempt_append_only"',
  );
}

async function enableFixtureCleanupTriggers(tx: Prisma.TransactionClient) {
  await tx.$executeRawUnsafe(
    'ALTER TABLE "NotificationDeliveryAttempt" ENABLE TRIGGER "NotificationDeliveryAttempt_append_only"',
  );
  await tx.$executeRawUnsafe(
    'ALTER TABLE "NotificationDefinitionRevision" ENABLE TRIGGER "NotificationDefinitionRevision_append_only"',
  );
  await tx.$executeRawUnsafe(
    'ALTER TABLE "NotificationDefinitionLifecycleEvent" ENABLE TRIGGER "NotificationDefinitionLifecycleEvent_append_only"',
  );
  await tx.$executeRawUnsafe(
    'ALTER TABLE "NotificationDelivery" ENABLE TRIGGER "NotificationDelivery_no_delete"',
  );
  await tx.$executeRawUnsafe(
    'ALTER TABLE "NotificationPublication" ENABLE TRIGGER "NotificationPublication_no_delete"',
  );
}
