CREATE TABLE IF NOT EXISTS "AgentSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "pagePath" TEXT,
    "contextLabel" TEXT,
    "title" TEXT,
    "storageKey" TEXT NOT NULL,
    "summaryShort" TEXT,
    "summaryLongStorageKey" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "compactedMessageCount" INTEGER NOT NULL DEFAULT 0,
    "byteSize" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "deletedAt" DATETIME
);

CREATE INDEX IF NOT EXISTS "AgentSession_userId_updatedAt_idx" ON "AgentSession"("userId", "updatedAt");

CREATE TABLE "new_AgentProposal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "sessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "actionKey" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "payloadJson" TEXT NOT NULL,
    "diffJson" TEXT,
    "resultJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME
);

INSERT INTO "new_AgentProposal" (
    "id",
    "userId",
    "status",
    "actionKey",
    "targetType",
    "targetId",
    "payloadJson",
    "diffJson",
    "resultJson",
    "createdAt",
    "confirmedAt"
)
SELECT
    "id",
    "userId",
    "status",
    "actionKey",
    "targetType",
    "targetId",
    "payloadJson",
    "diffJson",
    "resultJson",
    "createdAt",
    "confirmedAt"
FROM "AgentProposal";

DROP TABLE "AgentProposal";
ALTER TABLE "new_AgentProposal" RENAME TO "AgentProposal";
CREATE INDEX IF NOT EXISTS "AgentProposal_sessionId_idx" ON "AgentProposal"("sessionId");
