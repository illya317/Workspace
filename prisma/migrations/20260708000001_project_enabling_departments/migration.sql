-- Store the complete multi-select set of project enabling departments.
CREATE TABLE "ProjectEnablingDepartment" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "projectId" INTEGER NOT NULL,
  "departmentId" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectEnablingDepartment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectEnablingDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProjectEnablingDepartment_projectId_departmentId_key" ON "ProjectEnablingDepartment"("projectId", "departmentId");
CREATE INDEX "ProjectEnablingDepartment_departmentId_idx" ON "ProjectEnablingDepartment"("departmentId");

INSERT OR IGNORE INTO "ProjectEnablingDepartment" ("projectId", "departmentId")
SELECT "id", "leadingDepartmentId"
FROM "Project"
WHERE "leadingDepartmentId" IS NOT NULL;
