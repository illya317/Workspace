ALTER TABLE "Project" ADD COLUMN "createdBy" INTEGER;

UPDATE "Project"
SET "type" = 'department'
WHERE "type" IS NULL OR "type" = '' OR "type" = 'project';

UPDATE "Project"
SET "createdBy" = "editedBy"
WHERE "createdBy" IS NULL;
