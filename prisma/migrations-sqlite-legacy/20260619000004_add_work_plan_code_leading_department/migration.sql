ALTER TABLE "Project" ADD COLUMN "code" TEXT;
ALTER TABLE "Project" ADD COLUMN "leadingDepartmentId" INTEGER REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code") WHERE "code" IS NOT NULL;
CREATE INDEX "Project_leadingDepartmentId_idx" ON "Project"("leadingDepartmentId");
