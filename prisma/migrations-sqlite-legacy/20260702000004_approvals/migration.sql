CREATE TABLE "ApprovalRequest" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "resourceKey" TEXT NOT NULL,
  "scopeId" TEXT,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT,
  "operation" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "latestPayloadJson" TEXT NOT NULL DEFAULT '{}',
  "submitterUserId" INTEGER NOT NULL,
  "submittedAt" DATETIME,
  "resolvedByUserId" INTEGER,
  "resolvedAt" DATETIME,
  "committedEntityType" TEXT,
  "committedEntityId" TEXT,
  "committedAt" DATETIME,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalRequest_submitterUserId_fkey" FOREIGN KEY ("submitterUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ApprovalRequest_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ApprovalEvent" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "requestId" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "eventType" TEXT NOT NULL,
  "actorUserId" INTEGER NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "comment" TEXT,
  "payloadJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ApprovalEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ApprovalRequest_resourceKey_scopeId_status_updatedAt_idx" ON "ApprovalRequest"("resourceKey", "scopeId", "status", "updatedAt");
CREATE INDEX "ApprovalRequest_submitterUserId_status_updatedAt_idx" ON "ApprovalRequest"("submitterUserId", "status", "updatedAt");
CREATE INDEX "ApprovalRequest_subjectType_subjectId_idx" ON "ApprovalRequest"("subjectType", "subjectId");
CREATE UNIQUE INDEX "ApprovalEvent_requestId_sequence_key" ON "ApprovalEvent"("requestId", "sequence");
CREATE INDEX "ApprovalEvent_actorUserId_createdAt_idx" ON "ApprovalEvent"("actorUserId", "createdAt");
CREATE INDEX "ApprovalEvent_requestId_createdAt_idx" ON "ApprovalEvent"("requestId", "createdAt");
