PRAGMA foreign_keys=OFF;

CREATE TABLE "new_DepartmentCollaborationDepartment" (
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

INSERT INTO "new_DepartmentCollaborationDepartment" (
  "id", "collaborationId", "departmentId", "responseStatus", "responseNote", "respondedByUserId", "respondedAt", "invitedAt"
)
SELECT
  "id", "collaborationId", "departmentId", "responseStatus", "responseNote", "respondedByUserId", "respondedAt", "invitedAt"
FROM "DepartmentCollaborationDepartment";

DROP TABLE "DepartmentCollaborationDepartment";
ALTER TABLE "new_DepartmentCollaborationDepartment" RENAME TO "DepartmentCollaborationDepartment";

CREATE UNIQUE INDEX "DepartmentCollaborationDepartment_collaborationId_departmentId_key" ON "DepartmentCollaborationDepartment"("collaborationId", "departmentId");
CREATE INDEX "DepartmentCollaborationDepartment_departmentId_responseStatus_idx" ON "DepartmentCollaborationDepartment"("departmentId", "responseStatus");
CREATE INDEX "DepartmentCollaborationDepartment_respondedByUserId_idx" ON "DepartmentCollaborationDepartment"("respondedByUserId");

CREATE TABLE "DepartmentCollaborationPosition" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "collaborationId" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "positionId" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DepartmentCollaborationPosition_collaborationId_fkey" FOREIGN KEY ("collaborationId") REFERENCES "DepartmentCollaboration" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DepartmentCollaborationPosition_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DepartmentCollaborationPosition_kind_check" CHECK ("kind" IN ('responsible', 'executor'))
);

CREATE UNIQUE INDEX "DepartmentCollaborationPosition_collaborationId_kind_positionId_key" ON "DepartmentCollaborationPosition"("collaborationId", "kind", "positionId");
CREATE INDEX "DepartmentCollaborationPosition_positionId_kind_idx" ON "DepartmentCollaborationPosition"("positionId", "kind");

INSERT INTO "DepartmentCollaborationPosition" ("collaborationId", "kind", "positionId")
SELECT collaboration."id", 'responsible', department."managerPositionId"
FROM "DepartmentCollaboration" AS collaboration
JOIN "Department" AS department ON department."id" = collaboration."responsibleDepartmentId"
WHERE department."managerPositionId" IS NOT NULL;

INSERT INTO "DepartmentCollaborationPosition" ("collaborationId", "kind", "positionId")
SELECT relation."collaborationId", 'executor', department."managerPositionId"
FROM "DepartmentCollaborationDepartment" AS relation
JOIN "Department" AS department ON department."id" = relation."departmentId"
WHERE department."managerPositionId" IS NOT NULL;

PRAGMA foreign_keys=ON;
