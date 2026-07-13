-- Canonicalize the exact synonym “合同协议” to the shorter doctype “合同”.
-- The migration is idempotent at the data level and preserves all document
-- links and reviewed catalog candidates before removing the alias tag.

INSERT OR IGNORE INTO "LibraryTag" (
  "tagUid", "key", "name", "dimension", "taxonomyVersion", "status", "createdAt", "updatedAt"
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6))),
  '合同', '合同', 'doctype', 'v1', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "LibraryTag"
WHERE "key" = '合同协议'
LIMIT 1;

UPDATE "LibraryTag"
SET "name" = '合同', "dimension" = 'doctype', "taxonomyVersion" = 'v1',
    "status" = 'active', "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = '合同';

INSERT OR IGNORE INTO "LibraryDocumentTag" ("documentId", "tagId", "createdBy", "createdAt")
SELECT link."documentId", canonical."id", link."createdBy", link."createdAt"
FROM "LibraryDocumentTag" link
JOIN "LibraryTag" alias ON alias."id" = link."tagId" AND alias."key" = '合同协议'
JOIN "LibraryTag" canonical ON canonical."key" = '合同';

DELETE FROM "LibraryDocumentTag"
WHERE "tagId" IN (SELECT "id" FROM "LibraryTag" WHERE "key" = '合同协议');

DELETE FROM "LibraryTagCandidate" AS aliasCandidate
WHERE aliasCandidate."proposedKey" = '合同协议'
  AND EXISTS (
    SELECT 1
    FROM "LibraryTagCandidate" canonicalCandidate
    WHERE canonicalCandidate."versionId" = aliasCandidate."versionId"
      AND canonicalCandidate."promptVersion" = aliasCandidate."promptVersion"
      AND canonicalCandidate."proposedKey" = '合同'
  );

UPDATE "LibraryTagCandidate"
SET "tagId" = (SELECT "id" FROM "LibraryTag" WHERE "key" = '合同'),
    "dimension" = 'doctype', "proposedKey" = '合同', "proposedName" = '合同',
    "reviewNote" = CASE
      WHEN "reviewNote" IS NULL OR "reviewNote" = '' THEN '标签同义词已统一：合同协议 -> 合同'
      ELSE "reviewNote" || '；标签同义词已统一：合同协议 -> 合同'
    END
WHERE "proposedKey" = '合同协议'
   OR "tagId" IN (SELECT "id" FROM "LibraryTag" WHERE "key" = '合同协议');

DELETE FROM "LibraryTag" WHERE "key" = '合同协议';
