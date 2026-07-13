PRAGMA foreign_keys=OFF;

DELETE FROM "PositionReportOverride" WHERE "companyId" IS NULL;

DROP INDEX IF EXISTS "PositionReportOverride_positionId_companyId_departmentId_key";
DROP INDEX IF EXISTS "PositionReportOverride_companyId_idx";
DROP INDEX IF EXISTS "PositionReportOverride_departmentId_idx";
DROP INDEX IF EXISTS "PositionReportOverride_reportToPositionId_idx";
DROP INDEX IF EXISTS "PositionReportOverride_isActive_idx";

CREATE TABLE "new_PositionReportOverride" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "positionId" INTEGER NOT NULL,
  "companyId" INTEGER NOT NULL,
  "departmentId" INTEGER NOT NULL,
  "reportToPositionId" INTEGER,
  "headcount" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "remark" TEXT,
  "editedBy" INTEGER,
  "editedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PositionReportOverride_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PositionReportOverride_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PositionReportOverride_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PositionReportOverride_reportToPositionId_fkey" FOREIGN KEY ("reportToPositionId") REFERENCES "Position" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_PositionReportOverride" (
  "id",
  "positionId",
  "companyId",
  "departmentId",
  "reportToPositionId",
  "headcount",
  "isActive",
  "remark",
  "editedBy",
  "editedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "positionId",
  "companyId",
  "departmentId",
  "reportToPositionId",
  "headcount",
  "isActive",
  "remark",
  "editedBy",
  "editedAt",
  "createdAt",
  "updatedAt"
FROM "PositionReportOverride";

DROP TABLE "PositionReportOverride";
ALTER TABLE "new_PositionReportOverride" RENAME TO "PositionReportOverride";

CREATE UNIQUE INDEX "PositionReportOverride_positionId_companyId_departmentId_key" ON "PositionReportOverride"("positionId", "companyId", "departmentId");
CREATE INDEX "PositionReportOverride_companyId_idx" ON "PositionReportOverride"("companyId");
CREATE INDEX "PositionReportOverride_departmentId_idx" ON "PositionReportOverride"("departmentId");
CREATE INDEX "PositionReportOverride_reportToPositionId_idx" ON "PositionReportOverride"("reportToPositionId");
CREATE INDEX "PositionReportOverride_isActive_idx" ON "PositionReportOverride"("isActive");

PRAGMA foreign_keys=ON;
