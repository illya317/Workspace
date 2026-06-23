CREATE TABLE "ProjectTask" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "projectId" INTEGER NOT NULL,
  "isMilestone" BOOLEAN NOT NULL DEFAULT false,
  "ownerEmployeeId" INTEGER,
  "description" TEXT NOT NULL,
  "startDate" DATETIME,
  "endDate" DATETIME,
  "predecessorTaskId" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdBy" INTEGER,
  "editedBy" INTEGER,
  "editedAt" DATETIME,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectTask_ownerEmployeeId_fkey" FOREIGN KEY ("ownerEmployeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProjectTask_predecessorTaskId_fkey" FOREIGN KEY ("predecessorTaskId") REFERENCES "ProjectTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ProjectTask_projectId_sortOrder_idx" ON "ProjectTask"("projectId", "sortOrder");
CREATE INDEX "ProjectTask_ownerEmployeeId_idx" ON "ProjectTask"("ownerEmployeeId");
CREATE INDEX "ProjectTask_predecessorTaskId_idx" ON "ProjectTask"("predecessorTaskId");
