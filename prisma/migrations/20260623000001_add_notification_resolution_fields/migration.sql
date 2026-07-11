ALTER TABLE "Notification" ADD COLUMN "rejectedAt" DATETIME;
ALTER TABLE "Notification" ADD COLUMN "clearedAt" DATETIME;

DROP INDEX "Notification_recipientUserId_readAt_acknowledgedAt_createdAt_idx";
CREATE INDEX "Notification_recipientUserId_clearedAt_readAt_acknowledgedAt_createdAt_idx" ON "Notification"("recipientUserId", "clearedAt", "readAt", "acknowledgedAt", "createdAt");
