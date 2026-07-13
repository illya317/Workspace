-- Project workspace opt-in and department ownership fields.
ALTER TABLE "Project" ADD COLUMN "owningDepartmentId" INTEGER;
ALTER TABLE "Project" ADD COLUMN "workspaceEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Project_owningDepartmentId_idx" ON "Project"("owningDepartmentId");
CREATE INDEX "Project_workspaceEnabled_idx" ON "Project"("workspaceEnabled");
