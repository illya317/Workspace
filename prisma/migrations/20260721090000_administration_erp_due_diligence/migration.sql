-- workspace:migration-mode=expand
CREATE TABLE "ErpDueDiligenceSubmission" (
    "id" SERIAL NOT NULL,
    "campaignKey" TEXT NOT NULL DEFAULT 'order-to-cash-2026',
    "definitionVersion" INTEGER NOT NULL DEFAULT 1,
    "respondentUserId" INTEGER NOT NULL,
    "respondentName" TEXT NOT NULL,
    "departmentName" TEXT NOT NULL,
    "roleTitle" TEXT NOT NULL,
    "primaryArea" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "answersJson" JSONB NOT NULL DEFAULT '{}',
    "processStepsJson" JSONB NOT NULL DEFAULT '[]',
    "evidenceItemsJson" JSONB NOT NULL DEFAULT '[]',
    "submittedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpDueDiligenceSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ErpDueDiligenceSubmission_campaignKey_respondentUserId_key"
ON "ErpDueDiligenceSubmission"("campaignKey", "respondentUserId");

CREATE INDEX "ErpDueDiligenceSubmission_campaignKey_status_updatedAt_idx"
ON "ErpDueDiligenceSubmission"("campaignKey", "status", "updatedAt");

CREATE INDEX "ErpDueDiligenceSubmission_departmentName_primaryArea_idx"
ON "ErpDueDiligenceSubmission"("departmentName", "primaryArea");

ALTER TABLE "ErpDueDiligenceSubmission"
ADD CONSTRAINT "ErpDueDiligenceSubmission_respondentUserId_fkey"
FOREIGN KEY ("respondentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
