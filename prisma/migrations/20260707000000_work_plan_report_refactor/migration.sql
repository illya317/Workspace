-- Work plans become long-lived work pools; reports own period snapshots.
UPDATE "WorkPlan" SET "kind" = 'okr' WHERE "kind" = 'ad_hoc';
UPDATE "WorkPlan" SET "periodType" = NULL, "okrCycleId" = NULL WHERE "kind" = 'okr';

ALTER TABLE "WorkItem" ADD COLUMN "completedAt" DATETIME;
UPDATE "WorkItem" SET "completedAt" = COALESCE("dueDate", "createdAt") WHERE "status" = 'done';

ALTER TABLE "WorkReportItem" ADD COLUMN "workPlanId" INTEGER;
ALTER TABLE "WorkReportItem" ADD COLUMN "workPlanTitleSnapshot" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkReportItem" ADD COLUMN "workPlanKindSnapshot" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkReportItem" ADD COLUMN "workItemTypeSnapshot" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkReportItem" ADD COLUMN "parentWorkItemIdSnapshot" INTEGER;
ALTER TABLE "WorkReportItem" ADD COLUMN "parentTitleSnapshot" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkReportItem" ADD COLUMN "note" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkReportItem" ADD COLUMN "selfScore" INTEGER;
ALTER TABLE "WorkReportItem" ADD COLUMN "performanceScore" INTEGER;
ALTER TABLE "WorkReport" ADD COLUMN "reportStage" TEXT NOT NULL DEFAULT 'final';

UPDATE "WorkReportItem"
SET
  "workPlanId" = (
    SELECT "planId"
    FROM "WorkItem"
    WHERE "WorkItem"."id" = "WorkReportItem"."workItemId"
  ),
  "workItemTypeSnapshot" = COALESCE((
    SELECT "itemType"
    FROM "WorkItem"
    WHERE "WorkItem"."id" = "WorkReportItem"."workItemId"
  ), ''),
  "parentWorkItemIdSnapshot" = (
    SELECT "parentWorkItemId"
    FROM "WorkItem"
    WHERE "WorkItem"."id" = "WorkReportItem"."workItemId"
  );

UPDATE "WorkReportItem"
SET
  "workPlanTitleSnapshot" = COALESCE((
    SELECT "title"
    FROM "WorkPlan"
    WHERE "WorkPlan"."id" = "WorkReportItem"."workPlanId"
  ), ''),
  "workPlanKindSnapshot" = COALESCE((
    SELECT "kind"
    FROM "WorkPlan"
    WHERE "WorkPlan"."id" = "WorkReportItem"."workPlanId"
  ), ''),
  "parentTitleSnapshot" = COALESCE((
    SELECT "content"
    FROM "WorkItem" AS "ParentWorkItem"
    WHERE "ParentWorkItem"."id" = "WorkReportItem"."parentWorkItemIdSnapshot"
  ), '');

CREATE INDEX "WorkReportItem_workPlanId_idx" ON "WorkReportItem"("workPlanId");

DROP INDEX IF EXISTS "WorkReport_targetType_targetId_periodType_periodStart_submittedBy_key";
DROP INDEX IF EXISTS "WorkReport_targetType_targetId_periodType_periodStart_idx";
CREATE UNIQUE INDEX "WorkReport_targetType_targetId_periodType_periodStart_submittedBy_reportStage_key" ON "WorkReport"("targetType", "targetId", "periodType", "periodStart", "submittedBy", "reportStage");
CREATE INDEX "WorkReport_targetType_targetId_periodType_periodStart_reportStage_idx" ON "WorkReport"("targetType", "targetId", "periodType", "periodStart", "reportStage");
