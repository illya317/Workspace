import "server-only";

import { Prisma, prisma } from "@workspace/platform/server/prisma";

import {
  ProjectNotificationSignalProcessingError,
  type ClaimedProjectNotificationSignal,
} from "./project-notification-signal-contract";

export const PROJECT_NOTIFICATION_SIGNAL_LEASE_SECONDS = 120;

export async function renewClaimedProjectNotificationSignalLease(
  signal: ClaimedProjectNotificationSignal,
  now = new Date(),
) {
  const [renewed] = await prisma.$queryRaw<Array<{ leaseExpiresAt: Date }>>(Prisma.sql`
    UPDATE "ProjectNotificationSignal"
    SET
      "leaseExpiresAt" = ${now}::timestamp
        + (${PROJECT_NOTIFICATION_SIGNAL_LEASE_SECONDS} * INTERVAL '1 second'),
      "updatedAt" = ${now}
    WHERE "id" = ${signal.id}
      AND "status" = 'leased'
      AND "leaseToken" = ${signal.leaseToken}
      AND "attemptCount" = ${signal.attemptCount}
    RETURNING "leaseExpiresAt"
  `);
  if (!renewed) {
    throw new ProjectNotificationSignalProcessingError(
      "publication_lease_lost",
      "项目通知发布租约已失效",
      false,
    );
  }
  return renewed.leaseExpiresAt;
}
