DROP INDEX IF EXISTS "FunctionalPositionPlacement_positionId_companyId_departmentId_key";
DROP INDEX IF EXISTS "FunctionalPositionPlacement_positionId_departmentId_key";
DROP INDEX IF EXISTS "FunctionalPositionPlacement_companyId_idx";
DROP INDEX IF EXISTS "FunctionalPositionPlacement_departmentId_idx";
DROP INDEX IF EXISTS "FunctionalPositionPlacement_reportToPositionId_idx";
DROP INDEX IF EXISTS "FunctionalPositionPlacement_isActive_idx";
DROP INDEX IF EXISTS "EmployeePosition_functionalPlacementId_idx";

DELETE FROM "FunctionalPositionPlacement" WHERE "companyId" IS NULL;

ALTER TABLE "FunctionalPositionPlacement" RENAME TO "PositionReportOverride";
ALTER TABLE "EmployeePosition" RENAME COLUMN "functionalPlacementId" TO "positionReportOverrideId";
ALTER TABLE "EmployeePosition" ADD COLUMN "reportingCompanyId" INTEGER REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PositionReportOverride_positionId_companyId_departmentId_key" ON "PositionReportOverride"("positionId", "companyId", "departmentId");
CREATE INDEX "PositionReportOverride_companyId_idx" ON "PositionReportOverride"("companyId");
CREATE INDEX "PositionReportOverride_departmentId_idx" ON "PositionReportOverride"("departmentId");
CREATE INDEX "PositionReportOverride_reportToPositionId_idx" ON "PositionReportOverride"("reportToPositionId");
CREATE INDEX "PositionReportOverride_isActive_idx" ON "PositionReportOverride"("isActive");
CREATE INDEX "EmployeePosition_reportingCompanyId_idx" ON "EmployeePosition"("reportingCompanyId");
CREATE INDEX "EmployeePosition_positionReportOverrideId_idx" ON "EmployeePosition"("positionReportOverrideId");
