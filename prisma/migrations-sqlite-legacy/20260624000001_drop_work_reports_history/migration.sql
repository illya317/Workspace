-- Deprecated Work reports/history feature cleanup.
DELETE FROM "DepartmentWorkAssignee"
WHERE "kind" = 'report';

DELETE FROM "ProjectWorkAssignee"
WHERE "kind" = 'report';

DELETE FROM "WorkScopePermission"
WHERE "kind" = 'report';

DELETE FROM "WorkScopePermission"
WHERE "kind" = 'all'
  AND EXISTS (
    SELECT 1
    FROM "WorkScopePermission" AS taskPermission
    WHERE taskPermission."targetType" = "WorkScopePermission"."targetType"
      AND taskPermission."targetId" = "WorkScopePermission"."targetId"
      AND taskPermission."userId" = "WorkScopePermission"."userId"
      AND taskPermission."kind" = 'task'
  );

UPDATE "WorkScopePermission"
SET "kind" = 'task'
WHERE "kind" = 'all';

DELETE FROM "Resource"
WHERE "key" IN ('work.reports', 'work.history', 'report', 'report_group');

DROP TABLE IF EXISTS "ReportHistory";
DROP TABLE IF EXISTS "ReportItem";
DROP TABLE IF EXISTS "Report";
