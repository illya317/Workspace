UPDATE "WorkItem"
SET "sourceType" = 'other'
WHERE "sourceType" IN ('manual', 'import');
