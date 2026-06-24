ALTER TABLE "WorkItem" ADD COLUMN "periodType" TEXT;
ALTER TABLE "WorkItem" ADD COLUMN "periodStart" DATETIME;
ALTER TABLE "WorkItem" ADD COLUMN "periodEnd" DATETIME;

CREATE INDEX "WorkItem_targetType_targetId_periodType_periodStart_idx" ON "WorkItem"("targetType", "targetId", "periodType", "periodStart");
