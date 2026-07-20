-- workspace:migration-mode=maintenance
-- Add versioned KPI definitions, periodic assignments, immutable result snapshots,
-- and generalize the HR archived Work evidence field without data loss.

CREATE TABLE "WorkKpiDefinition" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "valueType" TEXT NOT NULL DEFAULT 'number',
    "displayType" TEXT NOT NULL DEFAULT 'number',
    "unit" TEXT NOT NULL DEFAULT '',
    "direction" TEXT NOT NULL DEFAULT 'higher_is_better',
    "defaultScoringRuleJson" TEXT NOT NULL DEFAULT '{}',
    "measurementMode" TEXT NOT NULL DEFAULT 'manual',
    "ownerDepartmentId" INTEGER NOT NULL,
    "createdByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkKpiDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkKpiAssignment" (
    "id" SERIAL NOT NULL,
    "workPlanId" INTEGER NOT NULL,
    "definitionId" INTEGER NOT NULL,
    "workItemId" INTEGER NOT NULL,
    "ownerEmployeeId" INTEGER NOT NULL,
    "sourceAssignmentId" INTEGER,
    "relationKind" TEXT NOT NULL DEFAULT 'direct',
    "weight" DECIMAL(20,6) NOT NULL,
    "baselineValue" DECIMAL(20,6),
    "targetValue" DECIMAL(20,6),
    "targetLowerBound" DECIMAL(20,6),
    "targetUpperBound" DECIMAL(20,6),
    "currentValue" DECIMAL(20,6),
    "definitionSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "scoringRuleSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkKpiAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkKpiResultSnapshot" (
    "id" SERIAL NOT NULL,
    "assignmentId" INTEGER NOT NULL,
    "workReportId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousSnapshotId" INTEGER,
    "actualValue" DECIMAL(20,6) NOT NULL,
    "scoreBeforeAdjustment" DECIMAL(20,6) NOT NULL,
    "confirmedScore" DECIMAL(20,6) NOT NULL,
    "adjustmentReason" TEXT NOT NULL DEFAULT '',
    "definitionSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "assignmentSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "scoringRuleSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "evidenceSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "approvedByUserId" INTEGER NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkKpiResultSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkKpiDefinition_code_version_key"
ON "WorkKpiDefinition"("code", "version");
CREATE INDEX "WorkKpiDefinition_status_ownerDepartmentId_idx"
ON "WorkKpiDefinition"("status", "ownerDepartmentId");
CREATE INDEX "WorkKpiDefinition_ownerDepartmentId_name_idx"
ON "WorkKpiDefinition"("ownerDepartmentId", "name");
CREATE INDEX "WorkKpiDefinition_createdByUserId_idx"
ON "WorkKpiDefinition"("createdByUserId");

CREATE UNIQUE INDEX "WorkKpiAssignment_workItemId_key"
ON "WorkKpiAssignment"("workItemId");
CREATE UNIQUE INDEX "WorkKpiAssignment_workPlanId_definitionId_key"
ON "WorkKpiAssignment"("workPlanId", "definitionId");
CREATE INDEX "WorkKpiAssignment_workPlanId_ownerEmployeeId_idx"
ON "WorkKpiAssignment"("workPlanId", "ownerEmployeeId");
CREATE INDEX "WorkKpiAssignment_definitionId_idx"
ON "WorkKpiAssignment"("definitionId");
CREATE INDEX "WorkKpiAssignment_ownerEmployeeId_idx"
ON "WorkKpiAssignment"("ownerEmployeeId");
CREATE INDEX "WorkKpiAssignment_sourceAssignmentId_idx"
ON "WorkKpiAssignment"("sourceAssignmentId");
CREATE INDEX "WorkKpiAssignment_updatedByUserId_idx"
ON "WorkKpiAssignment"("updatedByUserId");

CREATE UNIQUE INDEX "WorkKpiResultSnapshot_assignmentId_version_key"
ON "WorkKpiResultSnapshot"("assignmentId", "version");
CREATE INDEX "WorkKpiResultSnapshot_workReportId_idx"
ON "WorkKpiResultSnapshot"("workReportId");
CREATE INDEX "WorkKpiResultSnapshot_previousSnapshotId_idx"
ON "WorkKpiResultSnapshot"("previousSnapshotId");
CREATE INDEX "WorkKpiResultSnapshot_approvedByUserId_approvedAt_idx"
ON "WorkKpiResultSnapshot"("approvedByUserId", "approvedAt");

ALTER TABLE "WorkKpiDefinition"
ADD CONSTRAINT "WorkKpiDefinition_ownerDepartmentId_fkey"
FOREIGN KEY ("ownerDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkKpiDefinition"
ADD CONSTRAINT "WorkKpiDefinition_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkKpiAssignment"
ADD CONSTRAINT "WorkKpiAssignment_workPlanId_fkey"
FOREIGN KEY ("workPlanId") REFERENCES "WorkPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkKpiAssignment"
ADD CONSTRAINT "WorkKpiAssignment_definitionId_fkey"
FOREIGN KEY ("definitionId") REFERENCES "WorkKpiDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkKpiAssignment"
ADD CONSTRAINT "WorkKpiAssignment_workItemId_fkey"
FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkKpiAssignment"
ADD CONSTRAINT "WorkKpiAssignment_ownerEmployeeId_fkey"
FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkKpiAssignment"
ADD CONSTRAINT "WorkKpiAssignment_sourceAssignmentId_fkey"
FOREIGN KEY ("sourceAssignmentId") REFERENCES "WorkKpiAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkKpiAssignment"
ADD CONSTRAINT "WorkKpiAssignment_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkKpiResultSnapshot"
ADD CONSTRAINT "WorkKpiResultSnapshot_assignmentId_fkey"
FOREIGN KEY ("assignmentId") REFERENCES "WorkKpiAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkKpiResultSnapshot"
ADD CONSTRAINT "WorkKpiResultSnapshot_workReportId_fkey"
FOREIGN KEY ("workReportId") REFERENCES "WorkReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkKpiResultSnapshot"
ADD CONSTRAINT "WorkKpiResultSnapshot_previousSnapshotId_fkey"
FOREIGN KEY ("previousSnapshotId") REFERENCES "WorkKpiResultSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkKpiResultSnapshot"
ADD CONSTRAINT "WorkKpiResultSnapshot_approvedByUserId_fkey"
FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HrPerformanceReview"
RENAME COLUMN "okrSnapshotJson" TO "workEvidenceSnapshotJson";
