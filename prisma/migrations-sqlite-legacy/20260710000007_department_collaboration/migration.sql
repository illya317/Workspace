CREATE TABLE "DepartmentCollaboration" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "responsibleDepartmentId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DepartmentCollaboration_responsibleDepartmentId_fkey" FOREIGN KEY ("responsibleDepartmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DepartmentCollaboration_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "DepartmentCollaborationDepartment" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "collaborationId" INTEGER NOT NULL,
  "departmentId" INTEGER NOT NULL,
  "responseStatus" TEXT NOT NULL DEFAULT 'pending',
  "responseNote" TEXT NOT NULL DEFAULT '',
  "respondedByUserId" INTEGER,
  "respondedAt" DATETIME,
  "invitedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DepartmentCollaborationDepartment_collaborationId_fkey" FOREIGN KEY ("collaborationId") REFERENCES "DepartmentCollaboration" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DepartmentCollaborationDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DepartmentCollaborationDepartment_respondedByUserId_fkey" FOREIGN KEY ("respondedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "WorkPlan" ADD COLUMN "collaborationId" INTEGER REFERENCES "DepartmentCollaboration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkItem" ADD COLUMN "collaborationId" INTEGER REFERENCES "DepartmentCollaboration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "DepartmentCollaboration_responsibleDepartmentId_status_isArchived_idx" ON "DepartmentCollaboration"("responsibleDepartmentId", "status", "isArchived");
CREATE INDEX "DepartmentCollaboration_createdByUserId_idx" ON "DepartmentCollaboration"("createdByUserId");
CREATE UNIQUE INDEX "DepartmentCollaborationDepartment_collaborationId_departmentId_key" ON "DepartmentCollaborationDepartment"("collaborationId", "departmentId");
CREATE INDEX "DepartmentCollaborationDepartment_departmentId_responseStatus_idx" ON "DepartmentCollaborationDepartment"("departmentId", "responseStatus");
CREATE INDEX "DepartmentCollaborationDepartment_respondedByUserId_idx" ON "DepartmentCollaborationDepartment"("respondedByUserId");
CREATE INDEX "WorkPlan_collaborationId_idx" ON "WorkPlan"("collaborationId");
CREATE INDEX "WorkItem_collaborationId_idx" ON "WorkItem"("collaborationId");
