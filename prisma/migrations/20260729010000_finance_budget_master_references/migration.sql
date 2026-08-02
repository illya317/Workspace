-- workspace:migration-mode=maintenance
ALTER TABLE "FinanceBudgetVersion" ADD COLUMN "companyId" INTEGER;
ALTER TABLE "FinanceBudgetDept" ADD COLUMN "departmentId" INTEGER;
ALTER TABLE "FinanceBudgetRd" ADD COLUMN "projectId" INTEGER;

DROP INDEX "FinanceBudgetDept_year_companyCode_idx";
DROP INDEX "FinanceBudgetRd_year_companyCode_idx";
ALTER TABLE "FinanceBudgetDept" DROP COLUMN "companyCode";
ALTER TABLE "FinanceBudgetRd" DROP COLUMN "companyCode";

UPDATE "FinanceBudgetVersion" version
SET "companyId" = company.id
FROM "Company" company
WHERE version."companyCode" = company.code;

UPDATE "FinanceBudgetDept" budget
SET "departmentId" = matches.id
FROM (
  SELECT name, MIN(id) AS id
  FROM "Department"
  GROUP BY name
  HAVING COUNT(*) = 1
) matches
WHERE budget.dept = matches.name;

UPDATE "FinanceBudgetRd" budget
SET "projectId" = matches.id
FROM (
  SELECT name, MIN(id) AS id
  FROM "Project"
  GROUP BY name
  HAVING COUNT(*) = 1
) matches
WHERE budget.project = matches.name;

DROP INDEX "idx_active_budget_version";
CREATE UNIQUE INDEX "idx_active_budget_version"
  ON "FinanceBudgetVersion"("year", COALESCE("companyId", 0))
  WHERE "status" = 'active';

CREATE INDEX "FinanceBudgetVersion_companyId_idx" ON "FinanceBudgetVersion"("companyId");
CREATE INDEX "FinanceBudgetDept_departmentId_idx" ON "FinanceBudgetDept"("departmentId");
CREATE INDEX "FinanceBudgetRd_projectId_idx" ON "FinanceBudgetRd"("projectId");

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
