-- Canonical completion status, lifecycle classification, and planned/actual date names.

ALTER TABLE "Project" RENAME COLUMN "baselineStartDate" TO "plannedStartDate";
ALTER TABLE "Project" RENAME COLUMN "baselineEndDate" TO "plannedEndDate";
ALTER TABLE "Project" RENAME COLUMN "startDate" TO "actualStartDate";
ALTER TABLE "Project" RENAME COLUMN "endDate" TO "actualEndDate";
ALTER TABLE "Project" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';
UPDATE "Project"
SET "status" = CASE
  WHEN "actualEndDate" IS NOT NULL THEN 'done'
  WHEN "actualStartDate" IS NOT NULL THEN 'active'
  ELSE 'pending'
END;
UPDATE "Project" SET "actualStartDate" = NULL WHERE date("actualStartDate") > date('now', 'localtime');
UPDATE "Project" SET "actualEndDate" = NULL WHERE date("actualEndDate") > date('now', 'localtime');
CREATE INDEX "Project_status_idx" ON "Project"("status");

ALTER TABLE "WorkItem" RENAME COLUMN "startDate" TO "actualStartDate";
ALTER TABLE "WorkItem" RENAME COLUMN "dueDate" TO "actualEndDate";
UPDATE "WorkItem" SET "isArchived" = 1 WHERE "status" = 'archived';
UPDATE "WorkItem"
SET "status" = CASE
  WHEN "actualEndDate" IS NOT NULL THEN 'done'
  WHEN "status" IN ('todo', 'doing', 'archived') THEN 'active'
  ELSE "status"
END;
UPDATE "WorkItem" SET "completedAt" = COALESCE("completedAt", "actualEndDate") WHERE "status" = 'done' AND "actualEndDate" IS NOT NULL;
UPDATE "WorkItem" SET "actualStartDate" = NULL WHERE date("actualStartDate") > date('now', 'localtime');
UPDATE "WorkItem" SET "actualEndDate" = NULL WHERE date("actualEndDate") > date('now', 'localtime');

ALTER TABLE "WorkPlan" RENAME COLUMN "periodStart" TO "actualStartDate";
ALTER TABLE "WorkPlan" RENAME COLUMN "periodEnd" TO "actualEndDate";
ALTER TABLE "WorkPlan" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;
UPDATE "WorkPlan" SET "isArchived" = 1 WHERE "status" = 'archived';
UPDATE "WorkPlan"
SET "status" = CASE
  WHEN "actualEndDate" IS NOT NULL OR "status" = 'closed' OR ("status" = 'archived' AND "okrStage" = 'closed') THEN 'done'
  ELSE 'active'
END;
UPDATE "WorkPlan" SET "actualStartDate" = NULL WHERE date("actualStartDate") > date('now', 'localtime');
UPDATE "WorkPlan" SET "actualEndDate" = NULL WHERE date("actualEndDate") > date('now', 'localtime');
DROP INDEX IF EXISTS "WorkPlan_targetType_targetId_kind_status_idx";
CREATE INDEX "WorkPlan_targetType_targetId_kind_status_isArchived_idx" ON "WorkPlan"("targetType", "targetId", "kind", "status", "isArchived");
DROP INDEX IF EXISTS "WorkPlan_targetType_targetId_periodType_periodStart_idx";
CREATE INDEX "WorkPlan_targetType_targetId_periodType_actualStartDate_idx" ON "WorkPlan"("targetType", "targetId", "periodType", "actualStartDate");

ALTER TABLE "ProjectPlanPhase" RENAME COLUMN "startDate" TO "plannedStartDate";
ALTER TABLE "ProjectPlanPhase" RENAME COLUMN "endDate" TO "plannedEndDate";
ALTER TABLE "ProjectPlanBaselineItem" RENAME COLUMN "startDate" TO "plannedStartDate";
ALTER TABLE "ProjectPlanBaselineItem" RENAME COLUMN "endDate" TO "plannedEndDate";

ALTER TABLE "WorkReportItem" RENAME COLUMN "plannedStartDateSnapshot" TO "snapshotPlannedStartDate";
ALTER TABLE "WorkReportItem" RENAME COLUMN "plannedEndDateSnapshot" TO "snapshotPlannedEndDate";
ALTER TABLE "WorkReportItem" RENAME COLUMN "actualEndDateSnapshot" TO "snapshotActualEndDate";
ALTER TABLE "WorkReportItem" RENAME COLUMN "completedAtSnapshot" TO "snapshotCompletedAt";
