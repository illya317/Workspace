PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Department" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "alias" TEXT,
  "level" INTEGER NOT NULL DEFAULT 1,
  "parentId" INTEGER,
  "managerPositionId" INTEGER,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" DATETIME,
  "endDate" DATETIME,
  "editedBy" INTEGER,
  "editedAt" DATETIME,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "Department_managerPositionId_fkey" FOREIGN KEY ("managerPositionId") REFERENCES "Position" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Department" (
  "id",
  "code",
  "name",
  "alias",
  "level",
  "parentId",
  "managerPositionId",
  "isArchived",
  "archivedAt",
  "endDate",
  "editedBy",
  "editedAt",
  "version"
)
SELECT
  "id",
  "code",
  "name",
  "alias",
  "level",
  "parentId",
  "managerPositionId",
  "isArchived",
  "archivedAt",
  "endDate",
  "editedBy",
  "editedAt",
  "version"
FROM "Department";

DROP TABLE "Department";
ALTER TABLE "new_Department" RENAME TO "Department";

CREATE INDEX "Department_code_idx" ON "Department"("code");
CREATE INDEX "Department_name_idx" ON "Department"("name");
CREATE INDEX "Department_managerPositionId_idx" ON "Department"("managerPositionId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
