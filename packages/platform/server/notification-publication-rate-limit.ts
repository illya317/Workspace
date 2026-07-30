import "server-only";

import type { NotificationPublicationSource } from "./notification-definition-dsl";
import { Prisma } from "./prisma";
import { RECIPIENTS_PER_SOURCE_PER_MINUTE } from "./notification-publishing-storage";

export const NOTIFICATION_PUBLICATION_RATE_LIMITED =
  "notification_publication_rate_limited";

const NOTIFICATION_PUBLICATION_RATE_WINDOW_MS = 60_000;
const NOTIFICATION_PUBLICATION_RATE_SAFETY_MS = 1_000;

export type NotificationPublicationRateLimitDetails = {
  code: typeof NOTIFICATION_PUBLICATION_RATE_LIMITED;
  retryAt: string;
  retryAfter: number;
};

type NotificationPublicationRateLimitClient = {
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
};

export async function notificationPublicationRateLimit(
  client: NotificationPublicationRateLimitClient,
  input: {
    source: NotificationPublicationSource;
    requestedRecipientCount: number;
    now: Date;
  },
): Promise<NotificationPublicationRateLimitDetails | null> {
  const cutoff = new Date(input.now.getTime() - NOTIFICATION_PUBLICATION_RATE_WINDOW_MS);
  const recent = await client.$queryRaw<Array<{
    recipientCount: number;
    createdAt: Date;
  }>>(Prisma.sql`
    SELECT "recipientCount", "createdAt"
    FROM "NotificationPublication"
    WHERE "sourceKind" = ${input.source.kind}
      AND "sourceId" = ${input.source.id}
      AND "createdAt" >= ${cutoff}
    ORDER BY "createdAt" ASC, "id" ASC
  `);
  const usedRecipientCount = recent.reduce((sum, row) => sum + row.recipientCount, 0);
  if (
    usedRecipientCount + input.requestedRecipientCount
    <= RECIPIENTS_PER_SOURCE_PER_MINUTE
  ) {
    return null;
  }
  let remainingRecipientCount = usedRecipientCount;
  let retryAtMs = input.now.getTime()
    + NOTIFICATION_PUBLICATION_RATE_WINDOW_MS
    + NOTIFICATION_PUBLICATION_RATE_SAFETY_MS;
  for (const publication of recent) {
    remainingRecipientCount -= publication.recipientCount;
    if (
      remainingRecipientCount + input.requestedRecipientCount
      <= RECIPIENTS_PER_SOURCE_PER_MINUTE
    ) {
      retryAtMs = Math.max(
        input.now.getTime() + NOTIFICATION_PUBLICATION_RATE_SAFETY_MS,
        publication.createdAt.getTime()
          + NOTIFICATION_PUBLICATION_RATE_WINDOW_MS
          + NOTIFICATION_PUBLICATION_RATE_SAFETY_MS,
      );
      break;
    }
  }
  return {
    code: NOTIFICATION_PUBLICATION_RATE_LIMITED,
    retryAt: new Date(retryAtMs).toISOString(),
    retryAfter: Math.max(1, Math.ceil((retryAtMs - input.now.getTime()) / 1_000)),
  };
}
