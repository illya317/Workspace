-- Establish stable Library document/version identity, governed classification,
-- normalized tags, and current-version pointers. Paths and checksums remain
-- file observations; they do not determine document identity.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Create governed business categories and seed the existing folder-derived roots.
CREATE TABLE "LibraryCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "categoryUid" TEXT NOT NULL,
    "parentId" INTEGER,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "fullPath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "LibraryCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "LibraryCategory" (
    "categoryUid", "code", "name", "fullPath", "sortOrder"
)
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
    "categoryCode",
    COALESCE(MAX("categoryName"), "categoryCode"),
    "categoryCode" || ' ' || COALESCE(MAX("categoryName"), "categoryCode"),
    CAST("categoryCode" AS INTEGER)
FROM "LibraryDocument"
WHERE "categoryCode" IS NOT NULL AND trim("categoryCode") <> ''
GROUP BY "categoryCode";

-- Record physical folders independently from business categories.
CREATE TABLE "LibraryDirectory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "directoryUid" TEXT NOT NULL,
    "rootKey" TEXT NOT NULL DEFAULT 'default',
    "relativePath" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastScannedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

WITH RECURSIVE
distinct_directories("rootKey", "relativePath") AS (
    SELECT "rootKey", COALESCE("directoryPath", '')
    FROM "LibraryDocument"
    GROUP BY "rootKey", COALESCE("directoryPath", '')
),
directory_leaf("rootKey", "relativePath", "remaining") AS (
    SELECT "rootKey", "relativePath", "relativePath"
    FROM distinct_directories
    UNION ALL
    SELECT "rootKey", "relativePath", substr("remaining", instr("remaining", '/') + 1)
    FROM directory_leaf
    WHERE instr("remaining", '/') > 0
)
INSERT INTO "LibraryDirectory" (
    "directoryUid", "rootKey", "relativePath", "name", "lastScannedAt"
)
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
    "rootKey",
    "relativePath",
    CASE WHEN "relativePath" = '' THEN '/' ELSE "remaining" END,
    CURRENT_TIMESTAMP
FROM directory_leaf
WHERE instr("remaining", '/') = 0;

-- Normalize topic-like tag definitions before rebuilding the join table.
CREATE TABLE "LibraryTag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tagUid" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "LibraryTag" ("tagUid", "key", "name")
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
    lower(trim("tag")),
    MIN(trim("tag"))
FROM "LibraryDocumentTag"
WHERE trim("tag") <> ''
GROUP BY lower(trim("tag"));

-- Rebuild file versions with immutable version IDs and complete file facts.
CREATE TABLE "new_LibraryDocumentVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "versionUid" TEXT NOT NULL,
    "documentId" INTEGER NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "versionLabel" TEXT,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "extension" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "sourceModifiedAt" DATETIME,
    "checksumSha256" TEXT,
    "gitCommit" TEXT,
    "changeNote" TEXT,
    "createdBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LibraryDocumentVersion_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_LibraryDocumentVersion" (
    "id", "versionUid", "documentId", "versionNo", "versionLabel",
    "fileName", "storagePath", "relativePath", "extension", "mimeType",
    "fileSizeBytes", "sourceModifiedAt", "checksumSha256", "gitCommit",
    "changeNote", "createdBy", "createdAt"
)
SELECT
    v."id",
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
    v."documentId",
    v."versionNo",
    'V' || v."versionNo",
    d."fileName",
    v."relativePath",
    v."relativePath",
    d."extension",
    d."mimeType",
    v."fileSizeBytes",
    v."fileMtime",
    v."checksumSha256",
    v."gitCommit",
    v."changeNote",
    v."createdBy",
    v."createdAt"
FROM "LibraryDocumentVersion" v
JOIN "LibraryDocument" d ON d."id" = v."documentId";

DROP TABLE "LibraryDocumentVersion";
ALTER TABLE "new_LibraryDocumentVersion" RENAME TO "LibraryDocumentVersion";

-- Rebuild documents so stable technical/business IDs are required and the
-- current directory/category/version can be referenced explicitly.
CREATE TABLE "new_LibraryDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "documentUid" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "rootKey" TEXT NOT NULL DEFAULT 'default',
    "relativePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "extension" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "fileMtime" DATETIME,
    "checksumSha256" TEXT,
    "categoryCode" TEXT,
    "categoryName" TEXT,
    "subcategoryPath" TEXT,
    "directoryPath" TEXT,
    "title" TEXT,
    "summary" TEXT,
    "categoryId" INTEGER,
    "currentDirectoryId" INTEGER,
    "categorySource" TEXT NOT NULL DEFAULT 'folder',
    "currentVersionId" INTEGER,
    "confidentialityLevel" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'active',
    "origin" TEXT NOT NULL DEFAULT 'uploaded',
    "generatorKey" TEXT,
    "versionLabel" TEXT,
    "ownerUserId" INTEGER,
    "asOfDate" DATETIME,
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "reviewedAt" DATETIME,
    "reviewedBy" INTEGER,
    "gitRepo" TEXT,
    "gitCommit" TEXT,
    "gitPath" TEXT,
    "editedBy" INTEGER,
    "editedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryDocument_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LibraryDocument_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LibraryDocument_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LibraryDocument_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "LibraryCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LibraryDocument_currentDirectoryId_fkey" FOREIGN KEY ("currentDirectoryId") REFERENCES "LibraryDirectory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LibraryDocument_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "LibraryDocumentVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "chk_doc_confidentiality" CHECK ("confidentialityLevel" >= 0 AND "confidentialityLevel" <= 4)
);

WITH identities AS (
    SELECT
        d.*,
        lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))) AS "newDocumentUid"
    FROM "LibraryDocument" d
)
INSERT INTO "new_LibraryDocument" (
    "id", "documentUid", "docId", "stableKey", "rootKey", "relativePath",
    "fileName", "extension", "mimeType", "fileSizeBytes", "fileMtime",
    "checksumSha256", "categoryCode", "categoryName", "subcategoryPath",
    "directoryPath", "title", "summary", "categoryId", "currentDirectoryId",
    "categorySource", "currentVersionId", "confidentialityLevel", "status",
    "origin", "generatorKey", "versionLabel", "ownerUserId", "asOfDate",
    "reviewStatus", "reviewedAt", "reviewedBy", "gitRepo", "gitCommit",
    "gitPath", "editedBy", "editedAt", "version", "createdAt", "updatedAt"
)
SELECT
    d."id",
    d."newDocumentUid",
    COALESCE(
        d."docId",
        'LIB-' || strftime('%Y', COALESCE(d."createdAt", CURRENT_TIMESTAMP)) || '-' || upper(substr(replace(d."newDocumentUid", '-', ''), 1, 12))
    ),
    d."stableKey",
    d."rootKey",
    d."relativePath",
    d."fileName",
    d."extension",
    d."mimeType",
    d."fileSizeBytes",
    d."fileMtime",
    d."checksumSha256",
    d."categoryCode",
    d."categoryName",
    d."subcategoryPath",
    d."directoryPath",
    d."title",
    d."summary",
    (SELECT c."id" FROM "LibraryCategory" c WHERE c."code" = d."categoryCode" LIMIT 1),
    (SELECT dir."id" FROM "LibraryDirectory" dir WHERE dir."rootKey" = d."rootKey" AND dir."relativePath" = COALESCE(d."directoryPath", '') LIMIT 1),
    'folder',
    NULL,
    d."confidentialityLevel",
    d."status",
    d."origin",
    d."generatorKey",
    d."versionLabel",
    NULL,
    NULL,
    'pending',
    NULL,
    NULL,
    d."gitRepo",
    d."gitCommit",
    d."gitPath",
    d."editedBy",
    d."editedAt",
    d."version",
    d."createdAt",
    d."updatedAt"
FROM identities d;

DROP TABLE "LibraryDocument";
ALTER TABLE "new_LibraryDocument" RENAME TO "LibraryDocument";

-- Preserve any existing tags while switching to the normalized many-to-many relation.
CREATE TABLE "new_LibraryDocumentTag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "documentId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "createdBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryDocumentTag_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LibraryDocumentTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "LibraryTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LibraryDocumentTag_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_LibraryDocumentTag" ("id", "documentId", "tagId")
SELECT old."id", old."documentId", tag."id"
FROM "LibraryDocumentTag" old
JOIN "LibraryTag" tag ON tag."key" = lower(trim(old."tag"));

DROP TABLE "LibraryDocumentTag";
ALTER TABLE "new_LibraryDocumentTag" RENAME TO "LibraryDocumentTag";

-- Every existing document receives at least one usable V1 file version.
INSERT INTO "LibraryDocumentVersion" (
    "versionUid", "documentId", "versionNo", "versionLabel", "fileName",
    "storagePath", "relativePath", "extension", "mimeType", "fileSizeBytes",
    "sourceModifiedAt", "checksumSha256", "gitCommit", "changeNote",
    "createdBy", "createdAt"
)
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
    d."id",
    1,
    'V1',
    d."fileName",
    d."relativePath",
    d."relativePath",
    d."extension",
    d."mimeType",
    d."fileSizeBytes",
    d."fileMtime",
    d."checksumSha256",
    d."gitCommit",
    'Initial version migrated from current file',
    d."editedBy",
    d."createdAt"
FROM "LibraryDocument" d
WHERE NOT EXISTS (
    SELECT 1 FROM "LibraryDocumentVersion" v WHERE v."documentId" = d."id"
);

UPDATE "LibraryDocument"
SET
    "currentVersionId" = (
        SELECT v."id" FROM "LibraryDocumentVersion" v
        WHERE v."documentId" = "LibraryDocument"."id"
        ORDER BY v."versionNo" DESC, v."id" DESC LIMIT 1
    ),
    "version" = COALESCE((
        SELECT v."versionNo" FROM "LibraryDocumentVersion" v
        WHERE v."documentId" = "LibraryDocument"."id"
        ORDER BY v."versionNo" DESC, v."id" DESC LIMIT 1
    ), 1),
    "versionLabel" = COALESCE((
        SELECT v."versionLabel" FROM "LibraryDocumentVersion" v
        WHERE v."documentId" = "LibraryDocument"."id"
        ORDER BY v."versionNo" DESC, v."id" DESC LIMIT 1
    ), 'V1');

-- Recreate indexes after the table rebuilds.
CREATE UNIQUE INDEX "LibraryDocument_documentUid_key" ON "LibraryDocument"("documentUid");
CREATE UNIQUE INDEX "LibraryDocument_docId_key" ON "LibraryDocument"("docId");
CREATE UNIQUE INDEX "LibraryDocument_stableKey_key" ON "LibraryDocument"("stableKey");
CREATE UNIQUE INDEX "LibraryDocument_currentVersionId_key" ON "LibraryDocument"("currentVersionId");
CREATE INDEX "LibraryDocument_stableKey_idx" ON "LibraryDocument"("stableKey");
CREATE INDEX "LibraryDocument_rootKey_idx" ON "LibraryDocument"("rootKey");
CREATE INDEX "LibraryDocument_categoryCode_idx" ON "LibraryDocument"("categoryCode");
CREATE INDEX "LibraryDocument_categoryId_idx" ON "LibraryDocument"("categoryId");
CREATE INDEX "LibraryDocument_directoryPath_idx" ON "LibraryDocument"("directoryPath");
CREATE INDEX "LibraryDocument_currentDirectoryId_idx" ON "LibraryDocument"("currentDirectoryId");
CREATE INDEX "LibraryDocument_status_idx" ON "LibraryDocument"("status");
CREATE INDEX "LibraryDocument_confidentialityLevel_idx" ON "LibraryDocument"("confidentialityLevel");
CREATE INDEX "LibraryDocument_origin_idx" ON "LibraryDocument"("origin");
CREATE INDEX "LibraryDocument_reviewStatus_idx" ON "LibraryDocument"("reviewStatus");
CREATE INDEX "LibraryDocument_asOfDate_idx" ON "LibraryDocument"("asOfDate");

CREATE UNIQUE INDEX "LibraryDocumentVersion_versionUid_key" ON "LibraryDocumentVersion"("versionUid");
CREATE UNIQUE INDEX "LibraryDocumentVersion_documentId_versionNo_key" ON "LibraryDocumentVersion"("documentId", "versionNo");
CREATE INDEX "LibraryDocumentVersion_documentId_idx" ON "LibraryDocumentVersion"("documentId");
CREATE INDEX "LibraryDocumentVersion_versionNo_idx" ON "LibraryDocumentVersion"("versionNo");

CREATE UNIQUE INDEX "LibraryCategory_categoryUid_key" ON "LibraryCategory"("categoryUid");
CREATE UNIQUE INDEX "LibraryCategory_code_key" ON "LibraryCategory"("code");
CREATE UNIQUE INDEX "LibraryCategory_fullPath_key" ON "LibraryCategory"("fullPath");
CREATE INDEX "LibraryCategory_parentId_idx" ON "LibraryCategory"("parentId");
CREATE INDEX "LibraryCategory_status_idx" ON "LibraryCategory"("status");

CREATE UNIQUE INDEX "LibraryDirectory_directoryUid_key" ON "LibraryDirectory"("directoryUid");
CREATE UNIQUE INDEX "LibraryDirectory_rootKey_relativePath_key" ON "LibraryDirectory"("rootKey", "relativePath");
CREATE INDEX "LibraryDirectory_status_idx" ON "LibraryDirectory"("status");

CREATE UNIQUE INDEX "LibraryTag_tagUid_key" ON "LibraryTag"("tagUid");
CREATE UNIQUE INDEX "LibraryTag_key_key" ON "LibraryTag"("key");
CREATE INDEX "LibraryTag_status_idx" ON "LibraryTag"("status");

CREATE UNIQUE INDEX "LibraryDocumentTag_documentId_tagId_key" ON "LibraryDocumentTag"("documentId", "tagId");
CREATE INDEX "LibraryDocumentTag_tagId_idx" ON "LibraryDocumentTag"("tagId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
