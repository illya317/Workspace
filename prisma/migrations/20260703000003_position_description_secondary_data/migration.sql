PRAGMA foreign_keys=OFF;

CREATE TABLE "new_PositionDescription" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "reportToPositionId" INTEGER,
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
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PositionDescription_reportToPositionId_fkey" FOREIGN KEY ("reportToPositionId") REFERENCES "Position" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_PositionDescription" (
  "id",
  "reportToPositionId",
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
  description."id",
  (
    SELECT reportToPosition."id"
    FROM "Position" reportToPosition
    WHERE reportToPosition."name" = description."reportTo"
       OR reportToPosition."code" = description."reportTo"
    ORDER BY reportToPosition."isArchived" ASC, reportToPosition."id" ASC
    LIMIT 1
  ),
  description."positionPurpose",
  description."summary",
  description."headcount",
  description."version",
  description."effectiveDate",
  description."sourceFile",
  description."details",
  description."editedBy",
  description."editedAt",
  description."createdAt",
  description."updatedAt"
FROM "PositionDescription" description;

DROP TABLE "PositionDescription";
ALTER TABLE "new_PositionDescription" RENAME TO "PositionDescription";

CREATE INDEX "PositionDescription_reportToPositionId_idx" ON "PositionDescription"("reportToPositionId");
CREATE UNIQUE INDEX "Position_positionDescriptionId_key" ON "Position"("positionDescriptionId");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
