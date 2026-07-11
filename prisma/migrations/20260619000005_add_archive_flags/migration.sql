ALTER TABLE "Department" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Position" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Department_isArchived_idx" ON "Department"("isArchived");
CREATE INDEX "Position_isArchived_idx" ON "Position"("isArchived");
CREATE INDEX "Project_isArchived_idx" ON "Project"("isArchived");
