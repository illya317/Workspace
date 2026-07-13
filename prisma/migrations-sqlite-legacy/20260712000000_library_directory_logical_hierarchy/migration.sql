-- Make LibraryDirectory the authoritative logical hierarchy by persisting every ancestor path.
-- Source paths and immutable version storage paths remain independent file facts.

WITH RECURSIVE
directory_sources("rootKey", "path") AS (
    SELECT "rootKey", "relativePath"
    FROM "LibraryDirectory"
    WHERE "status" = 'active' AND "relativePath" <> ''
    UNION
    SELECT "rootKey", "directoryPath"
    FROM "LibraryDocument"
    WHERE "directoryPath" IS NOT NULL AND "directoryPath" <> ''
),
directory_ancestors("rootKey", "relativePath", "name", "remaining") AS (
    SELECT
        "rootKey",
        CASE WHEN instr("path", '/') > 0 THEN substr("path", 1, instr("path", '/') - 1) ELSE "path" END,
        CASE WHEN instr("path", '/') > 0 THEN substr("path", 1, instr("path", '/') - 1) ELSE "path" END,
        CASE WHEN instr("path", '/') > 0 THEN substr("path", instr("path", '/') + 1) ELSE '' END
    FROM directory_sources
    UNION ALL
    SELECT
        "rootKey",
        "relativePath" || '/' || CASE WHEN instr("remaining", '/') > 0 THEN substr("remaining", 1, instr("remaining", '/') - 1) ELSE "remaining" END,
        CASE WHEN instr("remaining", '/') > 0 THEN substr("remaining", 1, instr("remaining", '/') - 1) ELSE "remaining" END,
        CASE WHEN instr("remaining", '/') > 0 THEN substr("remaining", instr("remaining", '/') + 1) ELSE '' END
    FROM directory_ancestors
    WHERE "remaining" <> ''
),
missing_directories AS (
    SELECT DISTINCT a."rootKey", a."relativePath", a."name"
    FROM directory_ancestors a
    LEFT JOIN "LibraryDirectory" d
      ON d."rootKey" = a."rootKey" AND d."relativePath" = a."relativePath"
    WHERE d."id" IS NULL
)
INSERT INTO "LibraryDirectory" (
    "directoryUid", "rootKey", "relativePath", "name", "status"
)
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
    "rootKey",
    "relativePath",
    "name",
    'active'
FROM missing_directories;
