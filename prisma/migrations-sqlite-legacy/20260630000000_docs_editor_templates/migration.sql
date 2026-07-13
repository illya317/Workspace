CREATE TABLE "DocumentTemplateSpace" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "ownerUserId" INTEGER,
  "departmentId" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" DATETIME
);

CREATE TABLE "DocumentTemplate" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "ownerUserId" INTEGER NOT NULL,
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
  CONSTRAINT "DocumentTemplate_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "DocumentTemplateSpace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DocumentTemplatePermission" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "templateId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentTemplatePermission_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DocumentTemplateSpace_personal_owner_active_key" ON "DocumentTemplateSpace"("ownerUserId") WHERE "kind" = 'personal' AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX "DocumentTemplateSpace_department_active_key" ON "DocumentTemplateSpace"("departmentId") WHERE "kind" = 'department' AND "deletedAt" IS NULL;
CREATE INDEX "DocumentTemplateSpace_kind_ownerUserId_departmentId_idx" ON "DocumentTemplateSpace"("kind", "ownerUserId", "departmentId");
CREATE INDEX "DocumentTemplateSpace_departmentId_idx" ON "DocumentTemplateSpace"("departmentId");
CREATE INDEX "DocumentTemplateSpace_deletedAt_idx" ON "DocumentTemplateSpace"("deletedAt");
CREATE INDEX "DocumentTemplate_spaceId_deletedAt_idx" ON "DocumentTemplate"("spaceId", "deletedAt");
CREATE INDEX "DocumentTemplate_ownerUserId_idx" ON "DocumentTemplate"("ownerUserId");
CREATE INDEX "DocumentTemplate_sourceKind_sourceProductKey_idx" ON "DocumentTemplate"("sourceKind", "sourceProductKey");
CREATE UNIQUE INDEX "DocumentTemplatePermission_templateId_userId_key" ON "DocumentTemplatePermission"("templateId", "userId");
CREATE INDEX "DocumentTemplatePermission_userId_idx" ON "DocumentTemplatePermission"("userId");
