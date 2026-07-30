-- workspace:migration-mode=maintenance
-- Add versioned low-code notification definitions and synchronous workspace publication receipts.

CREATE TABLE "NotificationDefinition" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "titleTemplate" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "hrefTemplate" TEXT,
    "responseMode" TEXT NOT NULL DEFAULT 'read',
    "isImportant" BOOLEAN NOT NULL DEFAULT false,
    "variableKeysJson" TEXT NOT NULL DEFAULT '[]',
    "allowUserApi" BOOLEAN NOT NULL DEFAULT false,
    "allowedOpenApiClientIdsJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "publishedRevision" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "archivedByUserId" INTEGER,
    "createdByUserId" INTEGER NOT NULL,
    "updatedByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationDefinition_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NotificationDefinition_responseMode_check" CHECK ("responseMode" IN ('read', 'acknowledge')),
    CONSTRAINT "NotificationDefinition_status_check" CHECK ("status" IN ('active', 'archived')),
    CONSTRAINT "NotificationDefinition_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "NotificationDefinition_version_check" CHECK ("version" > 0),
    CONSTRAINT "NotificationDefinition_publishedRevision_check" CHECK ("publishedRevision" IS NULL OR ("publishedRevision" > 0 AND "publishedRevision" <= "revision"))
);

CREATE UNIQUE INDEX "NotificationDefinition_key_key" ON "NotificationDefinition"("key");
CREATE INDEX "NotificationDefinition_status_updatedAt_idx" ON "NotificationDefinition"("status", "updatedAt");
CREATE INDEX "NotificationDefinition_publishedRevision_status_idx" ON "NotificationDefinition"("publishedRevision", "status");
CREATE INDEX "NotificationDefinition_createdByUserId_idx" ON "NotificationDefinition"("createdByUserId");
CREATE INDEX "NotificationDefinition_updatedByUserId_idx" ON "NotificationDefinition"("updatedByUserId");
CREATE INDEX "NotificationDefinition_publishedByUserId_idx" ON "NotificationDefinition"("publishedByUserId");
CREATE INDEX "NotificationDefinition_archivedByUserId_idx" ON "NotificationDefinition"("archivedByUserId");

CREATE TABLE "NotificationDefinitionRevision" (
    "id" SERIAL NOT NULL,
    "definitionId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "titleTemplate" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "hrefTemplate" TEXT,
    "responseMode" TEXT NOT NULL,
    "isImportant" BOOLEAN NOT NULL,
    "variableKeysJson" TEXT NOT NULL,
    "allowUserApi" BOOLEAN NOT NULL,
    "allowedOpenApiClientIdsJson" TEXT NOT NULL,
    "contentFingerprint" TEXT NOT NULL,
    "createdByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationDefinitionRevision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NotificationDefinitionRevision_responseMode_check" CHECK ("responseMode" IN ('read', 'acknowledge')),
    CONSTRAINT "NotificationDefinitionRevision_revision_check" CHECK ("revision" > 0)
);

CREATE UNIQUE INDEX "NotificationDefinitionRevision_definitionId_revision_key" ON "NotificationDefinitionRevision"("definitionId", "revision");
CREATE INDEX "NotificationDefinitionRevision_key_revision_idx" ON "NotificationDefinitionRevision"("key", "revision");
CREATE INDEX "NotificationDefinitionRevision_createdByUserId_idx" ON "NotificationDefinitionRevision"("createdByUserId");

CREATE TABLE "NotificationPublication" (
    "id" TEXT NOT NULL,
    "definitionId" INTEGER NOT NULL,
    "definitionKey" TEXT NOT NULL,
    "definitionRevision" INTEGER NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "audienceJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'committed',
    "recipientCount" INTEGER NOT NULL,
    "deliveryCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationPublication_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NotificationPublication_sourceKind_check" CHECK ("sourceKind" IN ('internal', 'user-api', 'open-api')),
    CONSTRAINT "NotificationPublication_status_check" CHECK ("status" IN ('committed')),
    CONSTRAINT "NotificationPublication_counts_check" CHECK ("recipientCount" >= 0 AND "deliveryCount" >= 0)
);

CREATE UNIQUE INDEX "NotificationPublication_sourceKind_sourceId_idempotencyKey_key" ON "NotificationPublication"("sourceKind", "sourceId", "idempotencyKey");
CREATE INDEX "NotificationPublication_definitionId_definitionRevision_idx" ON "NotificationPublication"("definitionId", "definitionRevision");
CREATE INDEX "NotificationPublication_sourceKind_sourceId_createdAt_idx" ON "NotificationPublication"("sourceKind", "sourceId", "createdAt");

ALTER TABLE "Notification"
    ADD COLUMN "responseMode" TEXT NOT NULL DEFAULT 'read',
    ADD COLUMN "dispatchId" TEXT;

UPDATE "Notification"
SET "responseMode" = CASE
  WHEN "type" IN ('work.department.collaboration.invited', 'work.project.member.added', 'work.project.member.roleChanged') THEN 'accept_reject'
  WHEN "requiresAcknowledgement" IS TRUE THEN 'acknowledge'
  ELSE 'read'
END;

ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_responseMode_check" CHECK ("responseMode" IN ('read', 'acknowledge', 'accept_reject'));

CREATE INDEX "Notification_dispatchId_idx" ON "Notification"("dispatchId");

CREATE TABLE "NotificationDelivery" (
    "id" SERIAL NOT NULL,
    "publicationId" TEXT NOT NULL,
    "recipientUserId" INTEGER,
    "recipientUsername" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'workspace',
    "status" TEXT NOT NULL DEFAULT 'delivered',
    "notificationId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NotificationDelivery_channel_check" CHECK ("channel" IN ('workspace')),
    CONSTRAINT "NotificationDelivery_status_check" CHECK ("status" IN ('delivered'))
);

CREATE UNIQUE INDEX "NotificationDelivery_notificationId_key" ON "NotificationDelivery"("notificationId");
CREATE UNIQUE INDEX "NotificationDelivery_publicationId_recipientUsername_channel_key" ON "NotificationDelivery"("publicationId", "recipientUsername", "channel");
CREATE INDEX "NotificationDelivery_recipientUserId_createdAt_idx" ON "NotificationDelivery"("recipientUserId", "createdAt");
CREATE INDEX "NotificationDelivery_recipientUsername_createdAt_idx" ON "NotificationDelivery"("recipientUsername", "createdAt");
CREATE INDEX "NotificationDelivery_status_createdAt_idx" ON "NotificationDelivery"("status", "createdAt");

ALTER TABLE "NotificationDefinitionRevision"
    ADD CONSTRAINT "NotificationDefinitionRevision_definitionId_fkey"
    FOREIGN KEY ("definitionId") REFERENCES "NotificationDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationDefinition"
    ADD CONSTRAINT "NotificationDefinition_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "NotificationDefinition_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "NotificationDefinition_publishedByUserId_fkey"
    FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "NotificationDefinition_archivedByUserId_fkey"
    FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotificationDefinitionRevision"
    ADD CONSTRAINT "NotificationDefinitionRevision_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NotificationPublication"
    ADD CONSTRAINT "NotificationPublication_definitionId_fkey"
    FOREIGN KEY ("definitionId") REFERENCES "NotificationDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_dispatchId_fkey"
    FOREIGN KEY ("dispatchId") REFERENCES "NotificationPublication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotificationDelivery"
    ADD CONSTRAINT "NotificationDelivery_publicationId_fkey"
    FOREIGN KEY ("publicationId") REFERENCES "NotificationPublication"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "NotificationDelivery_recipientUserId_fkey"
    FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "NotificationDelivery_notificationId_fkey"
    FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
