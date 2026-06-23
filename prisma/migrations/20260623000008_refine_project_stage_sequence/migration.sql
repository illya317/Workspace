PRAGMA foreign_keys=off;

CREATE TABLE "new_ProjectStage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "sequenceNo" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "startDate" DATETIME,
    "note" TEXT,
    "createdBy" INTEGER,
    "editedBy" INTEGER,
    "editedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectStage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_ProjectStage" (
    "id",
    "projectId",
    "sequenceNo",
    "stage",
    "startDate",
    "note",
    "createdBy",
    "editedBy",
    "editedAt",
    "version",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "projectId",
    ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "sortOrder", "id"),
    "stage",
    "startDate",
    "note",
    "createdBy",
    "editedBy",
    "editedAt",
    "version",
    "createdAt",
    "updatedAt"
FROM "ProjectStage";

DROP TABLE "ProjectStage";
ALTER TABLE "new_ProjectStage" RENAME TO "ProjectStage";

CREATE UNIQUE INDEX "ProjectStage_projectId_sequenceNo_key" ON "ProjectStage"("projectId", "sequenceNo");
CREATE INDEX "ProjectStage_projectId_sequenceNo_idx" ON "ProjectStage"("projectId", "sequenceNo");

PRAGMA foreign_keys=on;
