-- OKR two-stage approval runtime.
ALTER TABLE "WorkPlan" ADD COLUMN "okrStage" TEXT NOT NULL DEFAULT 'objective_draft';
ALTER TABLE "WorkPlan" ADD COLUMN "objectiveSubmittedAt" DATETIME;
ALTER TABLE "WorkPlan" ADD COLUMN "objectiveApprovedAt" DATETIME;
ALTER TABLE "WorkPlan" ADD COLUMN "objectiveApprovedByUserId" INTEGER;
ALTER TABLE "WorkPlan" ADD COLUMN "krReviewOpensAt" DATETIME;
ALTER TABLE "WorkPlan" ADD COLUMN "krSubmittedAt" DATETIME;
ALTER TABLE "WorkPlan" ADD COLUMN "krApprovedAt" DATETIME;
ALTER TABLE "WorkPlan" ADD COLUMN "krApprovedByUserId" INTEGER;

UPDATE "WorkPlan"
SET
  "okrStage" = CASE
    WHEN "status" IN ('closed', 'archived') THEN 'closed'
    ELSE 'executing'
  END,
  "objectiveApprovedAt" = CASE
    WHEN "status" NOT IN ('closed', 'archived') THEN COALESCE("updatedAt", "createdAt")
    ELSE "objectiveApprovedAt"
  END,
  "krReviewOpensAt" = "periodEnd",
  "krApprovedAt" = CASE
    WHEN "status" IN ('closed', 'archived') THEN COALESCE("updatedAt", "createdAt")
    ELSE "krApprovedAt"
  END;

CREATE TABLE "WorkKrEvidence" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "krWorkItemId" INTEGER NOT NULL,
  "taskWorkItemId" INTEGER NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkKrEvidence_krWorkItemId_fkey" FOREIGN KEY ("krWorkItemId") REFERENCES "WorkItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkKrEvidence_taskWorkItemId_fkey" FOREIGN KEY ("taskWorkItemId") REFERENCES "WorkItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkKrEvidence_krWorkItemId_taskWorkItemId_key" ON "WorkKrEvidence"("krWorkItemId", "taskWorkItemId");
CREATE INDEX "WorkKrEvidence_krWorkItemId_sortOrder_idx" ON "WorkKrEvidence"("krWorkItemId", "sortOrder");
CREATE INDEX "WorkKrEvidence_taskWorkItemId_idx" ON "WorkKrEvidence"("taskWorkItemId");
CREATE INDEX "WorkPlan_targetType_targetId_okrStage_idx" ON "WorkPlan"("targetType", "targetId", "okrStage");
CREATE INDEX "WorkPlan_krReviewOpensAt_okrStage_idx" ON "WorkPlan"("krReviewOpensAt", "okrStage");
