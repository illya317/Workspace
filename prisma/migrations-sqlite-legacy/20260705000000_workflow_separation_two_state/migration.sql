PRAGMA foreign_keys=OFF;

UPDATE "ApprovalRequest"
SET "separationPolicy" = 'auto_pass_if_authorized'
WHERE "separationPolicy" NOT IN ('independent_required', 'auto_pass_if_authorized');

UPDATE "WorkflowPolicy"
SET "separationPolicy" = 'auto_pass_if_authorized'
WHERE "separationPolicy" NOT IN ('independent_required', 'auto_pass_if_authorized');

DROP INDEX IF EXISTS "ApprovalRequest_resourceKey_scopeId_status_updatedAt_idx";
DROP INDEX IF EXISTS "ApprovalRequest_businessActionKey_scopeId_status_updatedAt_idx";
DROP INDEX IF EXISTS "ApprovalRequest_submitterUserId_status_updatedAt_idx";
DROP INDEX IF EXISTS "ApprovalRequest_subjectType_subjectId_idx";
DROP INDEX IF EXISTS "WorkflowPolicy_businessActionKey_scopeType_idx";
DROP INDEX IF EXISTS "WorkflowPolicy_businessActionKey_scopeType_scopeId_key";

CREATE TABLE "new_ApprovalRequest" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "resourceKey" TEXT NOT NULL,
  "scopeId" TEXT,
  "businessActionKey" TEXT NOT NULL DEFAULT 'legacy.approval',
  "flowType" TEXT NOT NULL DEFAULT 'approval',
  "separationPolicy" TEXT NOT NULL DEFAULT 'auto_pass_if_authorized',
  "handlerSource" TEXT NOT NULL DEFAULT 'permission',
  "handlerCanRevise" BOOLEAN NOT NULL DEFAULT true,
  "requestCanWithdraw" BOOLEAN NOT NULL DEFAULT true,
  "requestCanResubmit" BOOLEAN NOT NULL DEFAULT true,
  "requestCanCancel" BOOLEAN NOT NULL DEFAULT true,
  "requestCanRevise" BOOLEAN NOT NULL DEFAULT true,
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

INSERT INTO "new_ApprovalRequest" (
  "id",
  "resourceKey",
  "scopeId",
  "businessActionKey",
  "flowType",
  "separationPolicy",
  "handlerSource",
  "handlerCanRevise",
  "requestCanWithdraw",
  "requestCanResubmit",
  "requestCanCancel",
  "requestCanRevise",
  "subjectType",
  "subjectId",
  "operation",
  "status",
  "latestPayloadJson",
  "submitterUserId",
  "submittedAt",
  "resolvedByUserId",
  "resolvedAt",
  "committedEntityType",
  "committedEntityId",
  "committedAt",
  "version",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "resourceKey",
  "scopeId",
  "businessActionKey",
  "flowType",
  CASE WHEN "separationPolicy" = 'independent_required' THEN 'independent_required' ELSE 'auto_pass_if_authorized' END,
  "handlerSource",
  "handlerCanRevise",
  "requestCanWithdraw",
  "requestCanResubmit",
  "requestCanCancel",
  "requestCanRevise",
  "subjectType",
  "subjectId",
  "operation",
  "status",
  "latestPayloadJson",
  "submitterUserId",
  "submittedAt",
  "resolvedByUserId",
  "resolvedAt",
  "committedEntityType",
  "committedEntityId",
  "committedAt",
  "version",
  "createdAt",
  "updatedAt"
FROM "ApprovalRequest";

DROP TABLE "ApprovalRequest";
ALTER TABLE "new_ApprovalRequest" RENAME TO "ApprovalRequest";

CREATE TABLE "new_WorkflowPolicy" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "businessActionKey" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL DEFAULT '',
  "mode" TEXT NOT NULL DEFAULT 'optional',
  "flowType" TEXT NOT NULL DEFAULT 'approval',
  "separationPolicy" TEXT NOT NULL DEFAULT 'auto_pass_if_authorized',
  "handlerSource" TEXT NOT NULL DEFAULT 'permission',
  "handlerCanRevise" BOOLEAN NOT NULL DEFAULT true,
  "requestCanWithdraw" BOOLEAN NOT NULL DEFAULT true,
  "requestCanResubmit" BOOLEAN NOT NULL DEFAULT true,
  "requestCanCancel" BOOLEAN NOT NULL DEFAULT true,
  "requestCanRevise" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" INTEGER,
  "updatedByUserId" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_WorkflowPolicy" (
  "id",
  "businessActionKey",
  "scopeType",
  "scopeId",
  "mode",
  "flowType",
  "separationPolicy",
  "handlerSource",
  "handlerCanRevise",
  "requestCanWithdraw",
  "requestCanResubmit",
  "requestCanCancel",
  "requestCanRevise",
  "version",
  "createdByUserId",
  "updatedByUserId",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "businessActionKey",
  "scopeType",
  "scopeId",
  "mode",
  "flowType",
  CASE WHEN "separationPolicy" = 'independent_required' THEN 'independent_required' ELSE 'auto_pass_if_authorized' END,
  "handlerSource",
  "handlerCanRevise",
  "requestCanWithdraw",
  "requestCanResubmit",
  "requestCanCancel",
  "requestCanRevise",
  "version",
  "createdByUserId",
  "updatedByUserId",
  "createdAt",
  "updatedAt"
FROM "WorkflowPolicy";

DROP TABLE "WorkflowPolicy";
ALTER TABLE "new_WorkflowPolicy" RENAME TO "WorkflowPolicy";

CREATE INDEX "ApprovalRequest_resourceKey_scopeId_status_updatedAt_idx" ON "ApprovalRequest"("resourceKey", "scopeId", "status", "updatedAt");
CREATE INDEX "ApprovalRequest_businessActionKey_scopeId_status_updatedAt_idx" ON "ApprovalRequest"("businessActionKey", "scopeId", "status", "updatedAt");
CREATE INDEX "ApprovalRequest_submitterUserId_status_updatedAt_idx" ON "ApprovalRequest"("submitterUserId", "status", "updatedAt");
CREATE INDEX "ApprovalRequest_subjectType_subjectId_idx" ON "ApprovalRequest"("subjectType", "subjectId");
CREATE UNIQUE INDEX "WorkflowPolicy_businessActionKey_scopeType_scopeId_key" ON "WorkflowPolicy"("businessActionKey", "scopeType", "scopeId");
CREATE INDEX "WorkflowPolicy_businessActionKey_scopeType_idx" ON "WorkflowPolicy"("businessActionKey", "scopeType");

PRAGMA foreign_keys=ON;
