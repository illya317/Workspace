-- Add cross-period plan and OKR node relations.
ALTER TABLE "WorkPlan" ADD COLUMN "parentPeriodPlanId" INTEGER;
ALTER TABLE "WorkPlan" ADD COLUMN "previousPeriodPlanId" INTEGER;

ALTER TABLE "WorkItem" ADD COLUMN "parentPeriodWorkItemId" INTEGER;
ALTER TABLE "WorkItem" ADD COLUMN "previousPeriodWorkItemId" INTEGER;

CREATE INDEX "WorkPlan_parentPeriodPlanId_idx" ON "WorkPlan"("parentPeriodPlanId");
CREATE INDEX "WorkPlan_previousPeriodPlanId_idx" ON "WorkPlan"("previousPeriodPlanId");
CREATE INDEX "WorkItem_parentPeriodWorkItemId_idx" ON "WorkItem"("parentPeriodWorkItemId");
CREATE INDEX "WorkItem_previousPeriodWorkItemId_idx" ON "WorkItem"("previousPeriodWorkItemId");
