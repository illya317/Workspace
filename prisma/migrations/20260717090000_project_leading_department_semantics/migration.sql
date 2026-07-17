-- workspace:migration-mode=maintenance
-- `leadingDepartmentId` is the single owning/leading department.
-- Preserve the independent ProjectEnablingDepartment rows and migrate the former owning value.
UPDATE "Project"
SET "leadingDepartmentId" = "owningDepartmentId"
WHERE "owningDepartmentId" IS NOT NULL;

ALTER TABLE "Project" DROP CONSTRAINT "Project_owningDepartmentId_fkey";
DROP INDEX "Project_owningDepartmentId_idx";
ALTER TABLE "Project" DROP COLUMN "owningDepartmentId";
