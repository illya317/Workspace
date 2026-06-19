ALTER TABLE "Department" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Position" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Project" ADD COLUMN "archivedAt" DATETIME;

CREATE INDEX "Department_archivedAt_idx" ON "Department"("archivedAt");
CREATE INDEX "Position_archivedAt_idx" ON "Position"("archivedAt");
CREATE INDEX "Project_archivedAt_idx" ON "Project"("archivedAt");
