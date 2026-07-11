-- Move employee-level roster attributes from EDP to Employment.
-- EDP keeps only employee-position relationship facts.
ALTER TABLE "Employment" ADD COLUMN "personnelType" TEXT;
ALTER TABLE "Employment" ADD COLUMN "rank" TEXT;
ALTER TABLE "Employment" ADD COLUMN "title" TEXT;

UPDATE "Employment"
SET "personnelType" = (
  SELECT "personnelType"
  FROM "EmployeePosition"
  WHERE "EmployeePosition"."employeeId" = "Employment"."employeeId"
    AND "personnelType" IS NOT NULL
    AND "personnelType" <> ''
  ORDER BY "isPrimary" DESC, "id" ASC
  LIMIT 1
)
WHERE "personnelType" IS NULL;

UPDATE "Employment"
SET "rank" = (
  SELECT "rank"
  FROM "EmployeePosition"
  WHERE "EmployeePosition"."employeeId" = "Employment"."employeeId"
    AND "rank" IS NOT NULL
    AND "rank" <> ''
  ORDER BY "isPrimary" DESC, "id" ASC
  LIMIT 1
)
WHERE "rank" IS NULL;

UPDATE "Employment"
SET "title" = (
  SELECT "title"
  FROM "EmployeePosition"
  WHERE "EmployeePosition"."employeeId" = "Employment"."employeeId"
    AND "title" IS NOT NULL
    AND "title" <> ''
  ORDER BY "isPrimary" DESC, "id" ASC
  LIMIT 1
)
WHERE "title" IS NULL;

ALTER TABLE "EmployeePosition" DROP COLUMN "personnelType";
ALTER TABLE "EmployeePosition" DROP COLUMN "rank";
ALTER TABLE "EmployeePosition" DROP COLUMN "title";
ALTER TABLE "EmployeePosition" DROP COLUMN "reportTo2";
ALTER TABLE "EmployeePosition" DROP COLUMN "isResearch";
