-- Move project planning details onto ProjectTask and retire subproject/project-type semantics from the app model.
ALTER TABLE "ProjectTask" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProjectTask" ADD COLUMN "baselineStartDate" DATETIME;
ALTER TABLE "ProjectTask" ADD COLUMN "baselineEndDate" DATETIME;

UPDATE "ProjectTask"
SET "name" = "description"
WHERE "name" = '';

CREATE TABLE IF NOT EXISTS "ProjectTaskAssignment" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "taskId" INTEGER NOT NULL,
  "employeeId" INTEGER NOT NULL,
  "role" TEXT,
  "editedBy" INTEGER,
  "editedAt" DATETIME,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectTaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectTaskAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectTaskAssignment_taskId_employeeId_key" ON "ProjectTaskAssignment"("taskId", "employeeId");
CREATE INDEX IF NOT EXISTS "ProjectTaskAssignment_employeeId_idx" ON "ProjectTaskAssignment"("employeeId");

INSERT OR IGNORE INTO "ProjectTaskAssignment" ("taskId", "employeeId", "role", "editedBy")
SELECT "id", "ownerEmployeeId", '负责人', "editedBy"
FROM "ProjectTask"
WHERE "ownerEmployeeId" IS NOT NULL;

INSERT OR IGNORE INTO "ProjectPlanDependency" (
  "projectId",
  "predecessorKind",
  "predecessorId",
  "successorKind",
  "successorId",
  "dependencyType",
  "lagDays",
  "createdBy",
  "editedBy"
)
SELECT
  "projectId",
  'task',
  "predecessorTaskId",
  'task',
  "id",
  'finish_start',
  0,
  "createdBy",
  "editedBy"
FROM "ProjectTask"
WHERE "predecessorTaskId" IS NOT NULL;

