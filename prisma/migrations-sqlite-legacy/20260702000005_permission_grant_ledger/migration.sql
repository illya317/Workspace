CREATE TABLE "PermissionGrantLedgerEvent" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "eventType" TEXT NOT NULL,
  "actorUserId" INTEGER,
  "actorLabel" TEXT,
  "actorSnapshotJson" TEXT,
  "subjectType" TEXT NOT NULL,
  "subjectId" INTEGER NOT NULL,
  "subjectLabel" TEXT,
  "subjectSnapshotJson" TEXT,
  "resourceId" INTEGER,
  "resourceKey" TEXT NOT NULL,
  "resourceName" TEXT,
  "actionKey" TEXT NOT NULL,
  "scopeId" TEXT,
  "beforeValue" BOOLEAN NOT NULL,
  "afterValue" BOOLEAN NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'permission_request',
  "reason" TEXT,
  "batchId" TEXT,
  "metadataJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PermissionGrantLedgerEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PermissionGrantLedgerEvent_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "PermissionGrantLedgerEvent_createdAt_idx" ON "PermissionGrantLedgerEvent"("createdAt");
CREATE INDEX "PermissionGrantLedgerEvent_actorUserId_createdAt_idx" ON "PermissionGrantLedgerEvent"("actorUserId", "createdAt");
CREATE INDEX "PermissionGrantLedgerEvent_subjectType_subjectId_createdAt_idx" ON "PermissionGrantLedgerEvent"("subjectType", "subjectId", "createdAt");
CREATE INDEX "PermissionGrantLedgerEvent_resourceKey_actionKey_createdAt_idx" ON "PermissionGrantLedgerEvent"("resourceKey", "actionKey", "createdAt");
CREATE INDEX "PermissionGrantLedgerEvent_eventType_createdAt_idx" ON "PermissionGrantLedgerEvent"("eventType", "createdAt");
CREATE INDEX "PermissionGrantLedgerEvent_batchId_idx" ON "PermissionGrantLedgerEvent"("batchId");
