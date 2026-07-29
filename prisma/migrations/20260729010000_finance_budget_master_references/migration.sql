ALTER TABLE "FinanceBudgetVersion" ADD COLUMN "companyId" INTEGER;
ALTER TABLE "FinanceBudgetDept" ADD COLUMN "departmentId" INTEGER;
ALTER TABLE "FinanceBudgetRd" ADD COLUMN "projectId" INTEGER;

DROP INDEX "FinanceBudgetDept_year_companyCode_idx";
DROP INDEX "FinanceBudgetRd_year_companyCode_idx";
ALTER TABLE "FinanceBudgetDept" DROP COLUMN "companyCode";
ALTER TABLE "FinanceBudgetRd" DROP COLUMN "companyCode";

CREATE INDEX "FinanceBudgetVersion_companyId_idx" ON "FinanceBudgetVersion"("companyId");
CREATE INDEX "FinanceBudgetDept_departmentId_idx" ON "FinanceBudgetDept"("departmentId");
CREATE INDEX "FinanceBudgetRd_projectId_idx" ON "FinanceBudgetRd"("projectId");
CREATE UNIQUE INDEX "FinanceBudgetVersion_active_companyId_key"
  ON "FinanceBudgetVersion"("year", "companyId")
  WHERE "status" = 'active' AND "companyId" IS NOT NULL;

ALTER TABLE "FinanceBudgetVersion"
  ADD CONSTRAINT "FinanceBudgetVersion_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceBudgetDept"
  ADD CONSTRAINT "FinanceBudgetDept_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceBudgetRd"
  ADD CONSTRAINT "FinanceBudgetRd_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceBudgetVersion" ALTER CONSTRAINT "FinanceBudgetVersion_companyId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceBudgetDept" ALTER CONSTRAINT "FinanceBudgetDept_departmentId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "FinanceBudgetRd" ALTER CONSTRAINT "FinanceBudgetRd_projectId_fkey" DEFERRABLE INITIALLY DEFERRED;
