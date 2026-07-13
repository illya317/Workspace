UPDATE "Department"
SET "parentId" = (SELECT "id" FROM "Department" WHERE "code" = 'OPS' AND "hierarchyKind" = 'G' LIMIT 1)
WHERE "hierarchyKind" = 'M'
  AND "level" = 1
  AND "isArchived" = 0
  AND EXISTS (
    SELECT 1 FROM "Department" WHERE "code" = 'OPS' AND "hierarchyKind" = 'G'
  );
