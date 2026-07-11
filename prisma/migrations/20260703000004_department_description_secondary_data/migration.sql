PRAGMA foreign_keys=OFF;

CREATE TABLE "new_DepartmentDescription" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "departmentId" INTEGER NOT NULL,
  "sourceFile" TEXT NOT NULL,
  "codeRaw" TEXT,
  "details" TEXT,
  "editedBy" INTEGER,
  "editedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DepartmentDescription_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_DepartmentDescription" (
  "id",
  "departmentId",
  "sourceFile",
  "codeRaw",
  "details",
  "editedBy",
  "editedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "departmentId",
  "sourceFile",
  "codeRaw",
  "details",
  "editedBy",
  "editedAt",
  "createdAt",
  "updatedAt"
FROM "DepartmentDescription";

DROP TABLE "DepartmentDescription";
ALTER TABLE "new_DepartmentDescription" RENAME TO "DepartmentDescription";

CREATE INDEX "DepartmentDescription_departmentId_idx" ON "DepartmentDescription"("departmentId");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
