PRAGMA foreign_keys=OFF;

ALTER TABLE "Position" ADD COLUMN "reportToPositionId" INTEGER;

UPDATE "Position"
SET "reportToPositionId" = (
  SELECT "PositionDescription"."reportToPositionId"
  FROM "PositionDescription"
  WHERE "PositionDescription"."id" = "Position"."positionDescriptionId"
)
WHERE "positionDescriptionId" IS NOT NULL
  AND "reportToPositionId" IS NULL;

UPDATE "Position"
SET "reportToPositionId" = (
  SELECT "Department"."managerPositionId"
  FROM "Department"
  WHERE "Department"."id" = "Position"."departmentId"
)
WHERE "reportToPositionId" IS NULL
  AND "departmentId" IS NOT NULL
  AND (
    SELECT "Department"."managerPositionId"
    FROM "Department"
    WHERE "Department"."id" = "Position"."departmentId"
  ) IS NOT NULL
  AND "id" != (
    SELECT "Department"."managerPositionId"
    FROM "Department"
    WHERE "Department"."id" = "Position"."departmentId"
  );

DROP INDEX IF EXISTS "PositionDescription_reportToPositionId_idx";

CREATE TABLE "new_PositionDescription" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "positionPurpose" TEXT,
  "summary" TEXT,
  "headcount" INTEGER,
  "version" TEXT,
  "effectiveDate" TEXT,
  "sourceFile" TEXT NOT NULL,
  "details" TEXT,
  "editedBy" INTEGER,
  "editedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_PositionDescription" (
  "id",
  "positionPurpose",
  "summary",
  "headcount",
  "version",
  "effectiveDate",
  "sourceFile",
  "details",
  "editedBy",
  "editedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "positionPurpose",
  "summary",
  "headcount",
  "version",
  "effectiveDate",
  "sourceFile",
  "details",
  "editedBy",
  "editedAt",
  "createdAt",
  "updatedAt"
FROM "PositionDescription";

DROP TABLE "PositionDescription";
ALTER TABLE "new_PositionDescription" RENAME TO "PositionDescription";

CREATE INDEX "Position_reportToPositionId_idx" ON "Position"("reportToPositionId");

PRAGMA foreign_keys=ON;
