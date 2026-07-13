ALTER TABLE "WorkItem" ADD COLUMN "itemType" TEXT NOT NULL DEFAULT 'task';
ALTER TABLE "WorkItem" ADD COLUMN "krStartValue" REAL;
ALTER TABLE "WorkItem" ADD COLUMN "krTargetValue" REAL;
ALTER TABLE "WorkItem" ADD COLUMN "krCurrentValue" REAL;
ALTER TABLE "WorkItem" ADD COLUMN "krUnit" TEXT;
ALTER TABLE "WorkItem" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "WorkItem" ADD COLUMN "sourceKind" TEXT;
ALTER TABLE "WorkItem" ADD COLUMN "linkedProjectPhaseId" INTEGER;

UPDATE "WorkItem"
SET
  "sourceType" = CASE
    WHEN "linkedProjectId" IS NOT NULL OR "linkedProjectTaskId" IS NOT NULL THEN 'project'
    WHEN "category" = 'routine' THEN 'routine'
    ELSE 'manual'
  END,
  "sourceKind" = CASE
    WHEN "linkedProjectTaskId" IS NOT NULL THEN 'project_task'
    WHEN "linkedProjectId" IS NOT NULL THEN 'project'
    ELSE NULL
  END;

CREATE INDEX "WorkItem_targetType_targetId_parentWorkItemId_itemType_idx" ON "WorkItem"("targetType", "targetId", "parentWorkItemId", "itemType");
CREATE INDEX "WorkItem_targetType_targetId_itemType_isArchived_idx" ON "WorkItem"("targetType", "targetId", "itemType", "isArchived");
CREATE INDEX "WorkItem_sourceType_linkedProjectId_linkedProjectTaskId_idx" ON "WorkItem"("sourceType", "linkedProjectId", "linkedProjectTaskId");
CREATE INDEX "WorkItem_linkedProjectPhaseId_idx" ON "WorkItem"("linkedProjectPhaseId");
