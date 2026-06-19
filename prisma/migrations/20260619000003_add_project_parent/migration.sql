ALTER TABLE "Project" ADD COLUMN "parentId" INTEGER REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Project_parentId_idx" ON "Project"("parentId");
