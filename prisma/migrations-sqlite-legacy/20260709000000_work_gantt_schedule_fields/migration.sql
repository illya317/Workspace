-- Add explicit schedule fields for Work space gantt planning.
ALTER TABLE "WorkPlan" ADD COLUMN "plannedStartDate" DATETIME;
ALTER TABLE "WorkPlan" ADD COLUMN "plannedEndDate" DATETIME;
ALTER TABLE "WorkPlan" ADD COLUMN "isMilestone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkPlan" ADD COLUMN "milestoneDate" DATETIME;

ALTER TABLE "WorkItem" ADD COLUMN "plannedStartDate" DATETIME;
ALTER TABLE "WorkItem" ADD COLUMN "plannedEndDate" DATETIME;
ALTER TABLE "WorkItem" ADD COLUMN "isMilestone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkItem" ADD COLUMN "milestoneDate" DATETIME;

UPDATE "WorkPlan"
SET
  "plannedStartDate" = "periodStart",
  "plannedEndDate" = "periodEnd"
WHERE "periodStart" IS NOT NULL OR "periodEnd" IS NOT NULL;

UPDATE "WorkItem"
SET
  "plannedStartDate" = "startDate",
  "plannedEndDate" = "dueDate"
WHERE "startDate" IS NOT NULL OR "dueDate" IS NOT NULL;

CREATE INDEX "WorkPlan_targetType_targetId_plannedStartDate_plannedEndDate_idx" ON "WorkPlan"("targetType", "targetId", "plannedStartDate", "plannedEndDate");
CREATE INDEX "WorkPlan_targetType_targetId_isMilestone_milestoneDate_idx" ON "WorkPlan"("targetType", "targetId", "isMilestone", "milestoneDate");

CREATE INDEX "WorkItem_targetType_targetId_plannedStartDate_plannedEndDate_idx" ON "WorkItem"("targetType", "targetId", "plannedStartDate", "plannedEndDate");
CREATE INDEX "WorkItem_targetType_targetId_isMilestone_milestoneDate_idx" ON "WorkItem"("targetType", "targetId", "isMilestone", "milestoneDate");
