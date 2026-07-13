PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Project" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "code" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "projectType" TEXT NOT NULL DEFAULT 'department',
  "projectLevel" TEXT NOT NULL DEFAULT '普通',
  "plan" TEXT,
  "goal" TEXT,
  "milestones" TEXT,
  "budgetAmount" REAL,
  "budgetNote" TEXT,
  "riskNote" TEXT,
  "remark" TEXT,
  "baselineStartDate" DATETIME,
  "baselineEndDate" DATETIME,
  "startDate" DATETIME,
  "endDate" DATETIME,
  "completionPercent" REAL,
  "closureType" TEXT,
  "leadingDepartmentId" INTEGER,
  "parentProjectTaskId" INTEGER,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" DATETIME,
  "createdBy" INTEGER,
  "editedBy" INTEGER,
  "editedAt" DATETIME,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Project_leadingDepartmentId_fkey" FOREIGN KEY ("leadingDepartmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Project_parentProjectTaskId_fkey" FOREIGN KEY ("parentProjectTaskId") REFERENCES "ProjectTask" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Project" (
  "id",
  "code",
  "name",
  "description",
  "projectType",
  "projectLevel",
  "plan",
  "goal",
  "milestones",
  "budgetAmount",
  "budgetNote",
  "riskNote",
  "remark",
  "baselineStartDate",
  "baselineEndDate",
  "startDate",
  "endDate",
  "completionPercent",
  "closureType",
  "leadingDepartmentId",
  "parentProjectTaskId",
  "isArchived",
  "archivedAt",
  "createdBy",
  "editedBy",
  "editedAt",
  "version",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "code",
  "name",
  "description",
  CASE
    WHEN "code" GLOB 'FH-[0-9][0-9]-[0-9][0-9]' THEN 'company'
    WHEN "leadingDepartmentId" IS NOT NULL THEN 'department'
    ELSE 'other'
  END,
  "projectLevel",
  "plan",
  "goal",
  "milestones",
  "budgetAmount",
  "budgetNote",
  "riskNote",
  "remark",
  NULL,
  NULL,
  "startDate",
  "endDate",
  "completionPercent",
  "closureType",
  "leadingDepartmentId",
  NULL,
  "isArchived",
  "archivedAt",
  "createdBy",
  "editedBy",
  "editedAt",
  "version",
  "createdAt",
  "updatedAt"
FROM "Project";

DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";

CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code") WHERE "code" IS NOT NULL;
CREATE UNIQUE INDEX "Project_parentProjectTaskId_key" ON "Project"("parentProjectTaskId");
CREATE INDEX "Project_leadingDepartmentId_idx" ON "Project"("leadingDepartmentId");
CREATE INDEX "Project_isArchived_idx" ON "Project"("isArchived");
CREATE INDEX "Project_archivedAt_idx" ON "Project"("archivedAt");
CREATE INDEX "Project_projectType_idx" ON "Project"("projectType");
CREATE INDEX "Project_parentProjectTaskId_idx" ON "Project"("parentProjectTaskId");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
