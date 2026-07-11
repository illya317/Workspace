ALTER TABLE "FunctionalPositionPlacement" ADD COLUMN "companyId" INTEGER REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "FunctionalPositionPlacement_positionId_departmentId_key";
CREATE UNIQUE INDEX "FunctionalPositionPlacement_positionId_companyId_departmentId_key" ON "FunctionalPositionPlacement"("positionId", "companyId", "departmentId");
CREATE INDEX "FunctionalPositionPlacement_companyId_idx" ON "FunctionalPositionPlacement"("companyId");
