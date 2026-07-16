-- workspace:migration-mode=expand
-- Executable Agent profiles and dual-identity run audit.
CREATE TABLE "AgentProfile" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "actorUserId" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "responsibilities" TEXT NOT NULL,
    "allowedToolKeysJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" INTEGER,
    "editedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AgentSession" ADD COLUMN "agentProfileId" INTEGER;

ALTER TABLE "AgentProposal" ADD COLUMN "actorUserId" INTEGER;
ALTER TABLE "AgentProposal" ADD COLUMN "agentProfileId" INTEGER;
ALTER TABLE "AgentProposal" ADD COLUMN "toolKey" TEXT;
ALTER TABLE "AgentProposal" ADD COLUMN "executionToken" TEXT;
ALTER TABLE "AgentProposal" ADD COLUMN "executionStartedAt" TIMESTAMP(3);
UPDATE "AgentProposal" SET "actorUserId" = "userId" WHERE "actorUserId" IS NULL;
-- Keep actorUserId nullable during this expand deployment. The previous PM2
-- release remains online while migrate deploy runs and does not write this
-- column. New code always persists actorUserId; a later contract migration may
-- enforce NOT NULL after every writer has been upgraded.

CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "requesterUserId" INTEGER NOT NULL,
    "actorUserId" INTEGER NOT NULL,
    "agentProfileId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'running',
    "pagePath" TEXT,
    "toolKey" TEXT,
    "resultType" TEXT,
    "proposalId" INTEGER,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentProfile_key_key" ON "AgentProfile"("key");
CREATE UNIQUE INDEX "AgentProfile_actorUserId_key" ON "AgentProfile"("actorUserId");
CREATE INDEX "AgentProfile_status_displayName_idx" ON "AgentProfile"("status", "displayName");
CREATE INDEX CONCURRENTLY "AgentSession_agentProfileId_updatedAt_idx" ON "AgentSession"("agentProfileId", "updatedAt");
CREATE INDEX CONCURRENTLY "AgentProposal_agentProfileId_createdAt_idx" ON "AgentProposal"("agentProfileId", "createdAt");
CREATE INDEX CONCURRENTLY "AgentProposal_actorUserId_createdAt_idx" ON "AgentProposal"("actorUserId", "createdAt");
CREATE INDEX CONCURRENTLY "AgentProposal_status_executionStartedAt_idx" ON "AgentProposal"("status", "executionStartedAt");
CREATE INDEX "AgentRun_requesterUserId_startedAt_idx" ON "AgentRun"("requesterUserId", "startedAt");
CREATE INDEX "AgentRun_actorUserId_startedAt_idx" ON "AgentRun"("actorUserId", "startedAt");
CREATE INDEX "AgentRun_agentProfileId_startedAt_idx" ON "AgentRun"("agentProfileId", "startedAt");
CREATE INDEX "AgentRun_status_startedAt_idx" ON "AgentRun"("status", "startedAt");

ALTER TABLE "AgentProfile"
  ADD CONSTRAINT "AgentProfile_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentSession"
  ADD CONSTRAINT "AgentSession_agentProfileId_fkey"
  FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentProposal"
  ADD CONSTRAINT "AgentProposal_agentProfileId_fkey"
  FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentRun"
  ADD CONSTRAINT "AgentRun_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRun"
  ADD CONSTRAINT "AgentRun_agentProfileId_fkey"
  FOREIGN KEY ("agentProfileId") REFERENCES "AgentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
