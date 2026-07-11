INSERT OR IGNORE INTO "UserResourceActionGrant" ("userId", "resourceId", "actionKey", "scopeId")
SELECT
  permission."userId",
  resource."id",
  action."actionKey",
  CASE permission."targetType"
    WHEN 'company' THEN 'company:company'
    WHEN 'committee' THEN 'committee:operating-committee'
    ELSE permission."targetType" || ':' || permission."targetId"
  END AS "scopeId"
FROM "WorkScopePermission" AS permission
JOIN "Resource" AS resource
  ON resource."key" = CASE
    WHEN permission."kind" = 'project' AND permission."targetType" = 'department' THEN 'space.department.projects'
    WHEN permission."kind" = 'project' AND permission."targetType" = 'committee' THEN 'space.committee.projects'
    WHEN permission."kind" = 'project' AND permission."targetType" = 'company' THEN 'space.company.projects'
    WHEN permission."kind" = 'project' THEN 'work.projects'
    WHEN permission."targetType" = 'department' THEN 'space.department.tasks'
    WHEN permission."targetType" = 'committee' THEN 'space.committee.tasks'
    WHEN permission."targetType" = 'company' THEN 'space.company.tasks'
    ELSE 'work.tasks'
  END
JOIN (
  SELECT 'read' AS "actionKey", 0 AS "minLevel", 'any' AS "kind"
  UNION ALL SELECT 'create', 1, 'any'
  UNION ALL SELECT 'update', 1, 'any'
  UNION ALL SELECT 'submit', 1, 'task'
  UNION ALL SELECT 'delete', 2, 'any'
  UNION ALL SELECT 'archive', 2, 'any'
  UNION ALL SELECT 'revise', 3, 'any'
  UNION ALL SELECT 'reverse', 3, 'any'
  UNION ALL SELECT 'approve', 3, 'any'
  UNION ALL SELECT 'reject', 3, 'any'
) AS action
WHERE (
    CASE permission."role"
      WHEN 'viewer' THEN 0
      WHEN 'editor' THEN 1
      WHEN 'delete' THEN 2
      WHEN 'manager' THEN 3
      ELSE 0
    END
  ) >= action."minLevel"
  AND (action."kind" = 'any' OR action."kind" = permission."kind");

INSERT OR IGNORE INTO "UserResourceActionGrant" ("userId", "resourceId", "actionKey", "scopeId")
SELECT
  permission."userId",
  resource."id",
  action."actionKey",
  CASE permission."targetType"
    WHEN 'company' THEN 'company:company'
    WHEN 'committee' THEN 'committee:operating-committee'
    ELSE permission."targetType" || ':' || permission."targetId"
  END AS "scopeId"
FROM "DocumentTemplateSpacePermission" AS permission
JOIN "Resource" AS resource
  ON resource."key" = CASE
    WHEN permission."targetType" = 'department' THEN 'space.department.templates'
    WHEN permission."targetType" = 'committee' THEN 'space.committee.templates'
    WHEN permission."targetType" = 'company' THEN 'space.company.templates'
    ELSE 'docs.editor'
  END
JOIN (
  SELECT 'read' AS "actionKey", 0 AS "minLevel"
  UNION ALL SELECT 'export', 0
  UNION ALL SELECT 'create', 1
  UNION ALL SELECT 'update', 1
  UNION ALL SELECT 'delete', 2
  UNION ALL SELECT 'archive', 2
  UNION ALL SELECT 'revise', 3
  UNION ALL SELECT 'reverse', 3
  UNION ALL SELECT 'submit', 3
  UNION ALL SELECT 'approve', 3
  UNION ALL SELECT 'reject', 3
) AS action
WHERE (
    CASE permission."role"
      WHEN 'viewer' THEN 0
      WHEN 'editor' THEN 1
      WHEN 'delete' THEN 2
      WHEN 'manager' THEN 3
      ELSE 0
    END
  ) >= action."minLevel";

DROP TABLE "WorkScopePermission";
DROP TABLE "DocumentTemplateSpacePermission";
