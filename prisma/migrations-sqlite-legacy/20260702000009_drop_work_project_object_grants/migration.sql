DELETE FROM "UserResourceActionGrant"
WHERE "resourceId" IN (SELECT "id" FROM "Resource" WHERE "key" = 'work.projects')
  AND "scopeId" LIKE 'project:%';

DELETE FROM "PositionResourceActionGrant"
WHERE "resourceId" IN (SELECT "id" FROM "Resource" WHERE "key" = 'work.projects')
  AND "scopeId" LIKE 'project:%';

DELETE FROM "DepartmentResourceActionGrant"
WHERE "resourceId" IN (SELECT "id" FROM "Resource" WHERE "key" = 'work.projects')
  AND "scopeId" LIKE 'project:%';
