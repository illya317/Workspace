PRAGMA foreign_keys=off;

CREATE TABLE "DocumentTemplateSpace_new" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "targetType" TEXT NOT NULL,
  "targetId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" DATETIME
);

INSERT INTO "DocumentTemplateSpace_new" (
  "id",
  "targetType",
  "targetId",
  "title",
  "description",
  "createdAt",
  "updatedAt",
  "deletedAt"
)
SELECT
  "id",
  CASE
    WHEN "kind" = 'personal' THEN 'personal'
    WHEN "kind" = 'department' THEN 'department'
    ELSE "kind"
  END,
  CASE
    WHEN "kind" = 'personal' THEN COALESCE("ownerUserId", "id")
    WHEN "kind" = 'department' THEN COALESCE("departmentId", "id")
    ELSE COALESCE("departmentId", "ownerUserId", "id")
  END,
  "title",
  "description",
  "createdAt",
  "updatedAt",
  "deletedAt"
FROM "DocumentTemplateSpace";

CREATE TABLE "DocumentTemplate_new" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "ownerUserId" INTEGER,
  "spaceId" INTEGER NOT NULL,
  "documentJson" TEXT NOT NULL,
  "fieldModelJson" TEXT NOT NULL,
  "sourceKind" TEXT,
  "sourceProductKey" TEXT,
  "sourceStageKeys" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" DATETIME,
  "publishRequestedAt" DATETIME,
  "publishedAt" DATETIME,
  "publishedByUserId" INTEGER,
  CONSTRAINT "DocumentTemplate_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "DocumentTemplateSpace_new" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "DocumentTemplate_new" (
  "id",
  "title",
  "type",
  "status",
  "ownerUserId",
  "spaceId",
  "documentJson",
  "fieldModelJson",
  "sourceKind",
  "sourceProductKey",
  "sourceStageKeys",
  "version",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "publishRequestedAt",
  "publishedAt",
  "publishedByUserId"
)
SELECT
  "id",
  "title",
  "type",
  "status",
  "ownerUserId",
  "spaceId",
  "documentJson",
  "fieldModelJson",
  "sourceKind",
  "sourceProductKey",
  "sourceStageKeys",
  "version",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "publishRequestedAt",
  "publishedAt",
  "publishedByUserId"
FROM "DocumentTemplate";

DROP TABLE "DocumentTemplatePermission";
DROP TABLE "DocumentTemplate";
DROP TABLE "DocumentTemplateSpace";

ALTER TABLE "DocumentTemplateSpace_new" RENAME TO "DocumentTemplateSpace";
ALTER TABLE "DocumentTemplate_new" RENAME TO "DocumentTemplate";

CREATE TABLE "DocumentTemplateSpacePermission" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "targetType" TEXT NOT NULL,
  "targetId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'template',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "DocumentTemplateSpace_targetType_targetId_key" ON "DocumentTemplateSpace"("targetType", "targetId");
CREATE INDEX "DocumentTemplateSpace_targetType_targetId_deletedAt_idx" ON "DocumentTemplateSpace"("targetType", "targetId", "deletedAt");
CREATE INDEX "DocumentTemplateSpace_deletedAt_idx" ON "DocumentTemplateSpace"("deletedAt");
CREATE INDEX "DocumentTemplate_spaceId_deletedAt_idx" ON "DocumentTemplate"("spaceId", "deletedAt");
CREATE INDEX "DocumentTemplate_ownerUserId_idx" ON "DocumentTemplate"("ownerUserId");
CREATE INDEX "DocumentTemplate_sourceKind_sourceProductKey_idx" ON "DocumentTemplate"("sourceKind", "sourceProductKey");
CREATE UNIQUE INDEX "DocumentTemplateSpacePermission_targetType_targetId_userId_kind_key" ON "DocumentTemplateSpacePermission"("targetType", "targetId", "userId", "kind");
CREATE INDEX "DocumentTemplateSpacePermission_userId_idx" ON "DocumentTemplateSpacePermission"("userId");
CREATE INDEX "DocumentTemplateSpacePermission_targetType_targetId_kind_idx" ON "DocumentTemplateSpacePermission"("targetType", "targetId", "kind");

PRAGMA foreign_keys=on;
