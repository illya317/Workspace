CREATE TABLE "NotificationManagedGroup" (
  "id" SERIAL NOT NULL,
  "groupKey" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'wecom',
  "providerConversationRef" TEXT NOT NULL,
  "displayName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'discovered',
  "ownerUserId" INTEGER,
  "ownerPositionId" INTEGER,
  "verificationStatus" TEXT NOT NULL DEFAULT 'pending',
  "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastVerifiedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "claimedByUserId" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationManagedGroup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationManagedGroup_status_check"
    CHECK ("status" IN ('discovered', 'unclaimed', 'active', 'suspended')),
  CONSTRAINT "NotificationManagedGroup_verification_check"
    CHECK ("verificationStatus" IN ('pending', 'verified', 'failed'))
);

CREATE UNIQUE INDEX "NotificationManagedGroup_groupKey_key"
  ON "NotificationManagedGroup"("groupKey");
CREATE UNIQUE INDEX "NotificationManagedGroup_provider_ref_key"
  ON "NotificationManagedGroup"("provider", "providerConversationRef");
CREATE INDEX "NotificationManagedGroup_status_verification_idx"
  ON "NotificationManagedGroup"("status", "verificationStatus");
CREATE INDEX "NotificationManagedGroup_ownerUser_idx"
  ON "NotificationManagedGroup"("ownerUserId");
CREATE INDEX "NotificationManagedGroup_ownerPosition_idx"
  ON "NotificationManagedGroup"("ownerPositionId");

CREATE TABLE "NotificationGroupPolicy" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "groupId" INTEGER NOT NULL,
  "definitionKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "dataScopeJson" TEXT NOT NULL,
  "scheduleJson" TEXT NOT NULL,
  "weeklyAgentKey" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" INTEGER NOT NULL,
  "updatedByUserId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationGroupPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationGroupPolicy_group_fkey"
    FOREIGN KEY ("groupId") REFERENCES "NotificationManagedGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "NotificationManagedGroup"
  ADD CONSTRAINT "NotificationManagedGroup_ownerUser_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "NotificationManagedGroup_ownerPosition_fkey" FOREIGN KEY ("ownerPositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "NotificationManagedGroup_claimedBy_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotificationGroupPolicy"
  ADD CONSTRAINT "NotificationGroupPolicy_createdBy_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "NotificationGroupPolicy_updatedBy_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "NotificationGroupPolicy_key_key"
  ON "NotificationGroupPolicy"("key");
CREATE UNIQUE INDEX "NotificationGroupPolicy_group_definition_key_key"
  ON "NotificationGroupPolicy"("groupId", "definitionKey", "key");
CREATE INDEX "NotificationGroupPolicy_group_enabled_idx"
  ON "NotificationGroupPolicy"("groupId", "enabled");
CREATE INDEX "NotificationGroupPolicy_definition_enabled_idx"
  ON "NotificationGroupPolicy"("definitionKey", "enabled");
CREATE INDEX "NotificationGroupPolicy_weeklyAgent_enabled_idx"
  ON "NotificationGroupPolicy"("weeklyAgentKey", "enabled");
