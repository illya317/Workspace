ALTER TABLE "WorkItem" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'todo';
ALTER TABLE "WorkItem" ADD COLUMN "ownerEmployeeId" INTEGER;
ALTER TABLE "WorkItem" ADD COLUMN "startDate" DATETIME;
ALTER TABLE "WorkItem" ADD COLUMN "dueDate" DATETIME;
ALTER TABLE "WorkItem" ADD COLUMN "linkedProjectId" INTEGER;
ALTER TABLE "WorkItem" ADD COLUMN "linkedProjectTaskId" INTEGER;
ALTER TABLE "WorkItem" ADD COLUMN "parentWorkItemId" INTEGER;

CREATE TABLE "WorkScopePermission" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "targetType" TEXT NOT NULL,
  "targetId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'task',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkScopePermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "WorkItem_ownerEmployeeId_idx" ON "WorkItem"("ownerEmployeeId");
CREATE INDEX "WorkItem_status_idx" ON "WorkItem"("status");
CREATE INDEX "WorkItem_linkedProjectId_idx" ON "WorkItem"("linkedProjectId");
CREATE INDEX "WorkItem_linkedProjectTaskId_idx" ON "WorkItem"("linkedProjectTaskId");
CREATE INDEX "WorkItem_parentWorkItemId_idx" ON "WorkItem"("parentWorkItemId");
CREATE UNIQUE INDEX "WorkScopePermission_targetType_targetId_userId_kind_key" ON "WorkScopePermission"("targetType", "targetId", "userId", "kind");
CREATE INDEX "WorkScopePermission_userId_idx" ON "WorkScopePermission"("userId");
CREATE INDEX "WorkScopePermission_targetType_targetId_kind_idx" ON "WorkScopePermission"("targetType", "targetId", "kind");
