-- Add department as an explicit Work source type target.
ALTER TABLE "WorkPlan" ADD COLUMN "sourceDepartmentId" INTEGER;
ALTER TABLE "WorkItem" ADD COLUMN "sourceDepartmentId" INTEGER;

CREATE INDEX "WorkPlan_sourceDepartmentId_idx" ON "WorkPlan"("sourceDepartmentId");
CREATE INDEX "WorkItem_sourceDepartmentId_idx" ON "WorkItem"("sourceDepartmentId");
