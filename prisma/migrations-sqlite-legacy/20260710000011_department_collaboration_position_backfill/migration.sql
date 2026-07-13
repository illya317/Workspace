INSERT OR IGNORE INTO "DepartmentCollaborationPosition" ("collaborationId", "kind", "positionId")
SELECT
  collaboration."id",
  'responsible',
  COALESCE(
    department."managerPositionId",
    (
      SELECT position."id"
      FROM "Position" AS position
      WHERE position."departmentId" = collaboration."responsibleDepartmentId"
        AND position."isArchived" = false
        AND (position."endDate" IS NULL OR position."endDate" >= CURRENT_TIMESTAMP)
      ORDER BY position."code", position."id"
      LIMIT 1
    )
  )
FROM "DepartmentCollaboration" AS collaboration
JOIN "Department" AS department ON department."id" = collaboration."responsibleDepartmentId"
WHERE NOT EXISTS (
  SELECT 1 FROM "DepartmentCollaborationPosition" AS existing
  WHERE existing."collaborationId" = collaboration."id" AND existing."kind" = 'responsible'
)
AND COALESCE(
  department."managerPositionId",
  (
    SELECT position."id"
    FROM "Position" AS position
    WHERE position."departmentId" = collaboration."responsibleDepartmentId"
      AND position."isArchived" = false
      AND (position."endDate" IS NULL OR position."endDate" >= CURRENT_TIMESTAMP)
    ORDER BY position."code", position."id"
    LIMIT 1
  )
) IS NOT NULL;

INSERT OR IGNORE INTO "DepartmentCollaborationPosition" ("collaborationId", "kind", "positionId")
SELECT
  relation."collaborationId",
  'executor',
  COALESCE(
    department."managerPositionId",
    (
      SELECT position."id"
      FROM "Position" AS position
      WHERE position."departmentId" = relation."departmentId"
        AND position."isArchived" = false
        AND (position."endDate" IS NULL OR position."endDate" >= CURRENT_TIMESTAMP)
      ORDER BY position."code", position."id"
      LIMIT 1
    )
  )
FROM "DepartmentCollaborationDepartment" AS relation
JOIN "Department" AS department ON department."id" = relation."departmentId"
WHERE NOT EXISTS (
  SELECT 1 FROM "DepartmentCollaborationPosition" AS existing
  WHERE existing."collaborationId" = relation."collaborationId" AND existing."kind" = 'executor'
)
AND COALESCE(
  department."managerPositionId",
  (
    SELECT position."id"
    FROM "Position" AS position
    WHERE position."departmentId" = relation."departmentId"
      AND position."isArchived" = false
      AND (position."endDate" IS NULL OR position."endDate" >= CURRENT_TIMESTAMP)
    ORDER BY position."code", position."id"
    LIMIT 1
  )
) IS NOT NULL;
