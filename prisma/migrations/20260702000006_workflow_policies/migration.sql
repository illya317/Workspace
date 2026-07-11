ALTER TABLE "ApprovalRequest" ADD COLUMN "businessActionKey" TEXT NOT NULL DEFAULT 'legacy.approval';
ALTER TABLE "ApprovalRequest" ADD COLUMN "flowType" TEXT NOT NULL DEFAULT 'approval';
ALTER TABLE "ApprovalRequest" ADD COLUMN "separationPolicy" TEXT NOT NULL DEFAULT 'self_allowed';

CREATE TABLE "WorkflowPolicy" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "businessActionKey" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL DEFAULT '',
  "mode" TEXT NOT NULL DEFAULT 'optional',
  "flowType" TEXT NOT NULL DEFAULT 'approval',
  "separationPolicy" TEXT NOT NULL DEFAULT 'self_allowed',
  "handlerSource" TEXT NOT NULL DEFAULT 'permission',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" INTEGER,
  "updatedByUserId" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ApprovalRequest_businessActionKey_scopeId_status_updatedAt_idx" ON "ApprovalRequest"("businessActionKey", "scopeId", "status", "updatedAt");
CREATE UNIQUE INDEX "WorkflowPolicy_businessActionKey_scopeType_scopeId_key" ON "WorkflowPolicy"("businessActionKey", "scopeType", "scopeId");
CREATE INDEX "WorkflowPolicy_businessActionKey_scopeType_idx" ON "WorkflowPolicy"("businessActionKey", "scopeType");
