-- Backfill responsibility node indexes for historical position descriptions.
-- New edits already sync these rows from application code; this migration only fills
-- descriptions that currently have no active responsibility nodes.

INSERT INTO "PositionResponsibilityNode" (
  "positionDescriptionId",
  "parentId",
  "nodeKey",
  "nodeType",
  "title",
  "content",
  "pathLabel",
  "sourcePath",
  "sourceHash",
  "descriptionVersion",
  "descriptionUpdatedAt",
  "sortOrder",
  "isActive",
  "createdAt",
  "updatedAt"
)
WITH duty_groups AS (
  SELECT
    pd."id" AS positionDescriptionId,
    CAST(duty."key" AS INTEGER) + 1 AS groupIndex,
    trim(COALESCE(json_extract(duty."value", '$.title'), '')) AS title,
    'details.duties[' || duty."key" || ']' AS sourcePath,
    pd."version" AS descriptionVersion,
    pd."updatedAt" AS descriptionUpdatedAt
  FROM "PositionDescription" pd,
       json_each(CASE WHEN json_valid(pd."details") THEN pd."details" ELSE '{}' END, '$.duties') duty
  WHERE json_valid(pd."details")
    AND json_type(CASE WHEN json_valid(pd."details") THEN pd."details" ELSE '{}' END, '$.duties') = 'array'
    AND json_type(duty."value", '$.items') = 'array'
    AND json_array_length(duty."value", '$.items') > 0
    AND trim(COALESCE(json_extract(duty."value", '$.title'), '')) <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM "PositionResponsibilityNode" existing
      WHERE existing."positionDescriptionId" = pd."id"
        AND existing."isActive" = 1
    )
)
SELECT
  positionDescriptionId,
  NULL,
  'pd:' || positionDescriptionId || ':duty-group:' || sourcePath,
  'duty_group',
  title,
  '',
  CASE groupIndex
    WHEN 1 THEN '一、'
    WHEN 2 THEN '二、'
    WHEN 3 THEN '三、'
    WHEN 4 THEN '四、'
    WHEN 5 THEN '五、'
    WHEN 6 THEN '六、'
    WHEN 7 THEN '七、'
    WHEN 8 THEN '八、'
    WHEN 9 THEN '九、'
    WHEN 10 THEN '十、'
    ELSE CAST(groupIndex AS TEXT) || '、'
  END,
  sourcePath,
  sourcePath || ':' || title,
  descriptionVersion,
  descriptionUpdatedAt,
  groupIndex,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM duty_groups
WHERE NOT EXISTS (
  SELECT 1
  FROM "PositionResponsibilityNode" existing
  WHERE existing."nodeKey" = 'pd:' || positionDescriptionId || ':duty-group:' || sourcePath
);

INSERT INTO "PositionResponsibilityNode" (
  "positionDescriptionId",
  "parentId",
  "nodeKey",
  "nodeType",
  "title",
  "content",
  "pathLabel",
  "sourcePath",
  "sourceHash",
  "descriptionVersion",
  "descriptionUpdatedAt",
  "sortOrder",
  "isActive",
  "createdAt",
  "updatedAt"
)
WITH duty_items AS (
  SELECT
    pd."id" AS positionDescriptionId,
    CAST(duty."key" AS INTEGER) + 1 AS groupIndex,
    CAST(item."key" AS INTEGER) AS itemIndex,
    trim(CAST(item."value" AS TEXT)) AS content,
    'pd:' || pd."id" || ':duty-group:details.duties[' || duty."key" || ']' AS parentNodeKey,
    'details.duties[' || duty."key" || '].items[' || item."key" || ']' AS sourcePath,
    pd."version" AS descriptionVersion,
    pd."updatedAt" AS descriptionUpdatedAt
  FROM "PositionDescription" pd,
       json_each(CASE WHEN json_valid(pd."details") THEN pd."details" ELSE '{}' END, '$.duties') duty,
       json_each(duty."value", '$.items') item
  WHERE json_valid(pd."details")
    AND json_type(CASE WHEN json_valid(pd."details") THEN pd."details" ELSE '{}' END, '$.duties') = 'array'
    AND json_type(duty."value", '$.items') = 'array'
    AND json_array_length(duty."value", '$.items') > 0
    AND trim(COALESCE(json_extract(duty."value", '$.title'), '')) <> ''
    AND trim(CAST(item."value" AS TEXT)) <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM "PositionResponsibilityNode" existing
      WHERE existing."positionDescriptionId" = pd."id"
        AND existing."isActive" = 1
        AND existing."nodeType" = 'duty_item'
    )
)
SELECT
  positionDescriptionId,
  (
    SELECT parent."id"
    FROM "PositionResponsibilityNode" parent
    WHERE parent."nodeKey" = parentNodeKey
  ),
  'pd:' || positionDescriptionId || ':duty-item:' || sourcePath,
  'duty_item',
  content,
  content,
  CAST(groupIndex AS TEXT) || '.' || CAST(itemIndex + 1 AS TEXT),
  sourcePath,
  sourcePath || ':' || content,
  descriptionVersion,
  descriptionUpdatedAt,
  itemIndex,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM duty_items
WHERE NOT EXISTS (
  SELECT 1
  FROM "PositionResponsibilityNode" existing
  WHERE existing."nodeKey" = 'pd:' || positionDescriptionId || ':duty-item:' || sourcePath
);

INSERT INTO "PositionResponsibilityNode" (
  "positionDescriptionId",
  "parentId",
  "nodeKey",
  "nodeType",
  "title",
  "content",
  "pathLabel",
  "sourcePath",
  "sourceHash",
  "descriptionVersion",
  "descriptionUpdatedAt",
  "sortOrder",
  "isActive",
  "createdAt",
  "updatedAt"
)
WITH management_groups AS (
  SELECT
    pd."id" AS positionDescriptionId,
    COALESCE(json_array_length(CASE WHEN json_valid(pd."details") THEN pd."details" ELSE '{}' END, '$.duties'), 0) + 1 AS groupIndex,
    pd."version" AS descriptionVersion,
    pd."updatedAt" AS descriptionUpdatedAt
  FROM "PositionDescription" pd
  WHERE json_valid(pd."details")
    AND json_type(CASE WHEN json_valid(pd."details") THEN pd."details" ELSE '{}' END, '$.managementDuties') = 'array'
    AND json_array_length(CASE WHEN json_valid(pd."details") THEN pd."details" ELSE '{}' END, '$.managementDuties') > 0
    AND NOT EXISTS (
      SELECT 1
      FROM "PositionResponsibilityNode" existing
      WHERE existing."positionDescriptionId" = pd."id"
        AND existing."isActive" = 1
    )
)
SELECT
  positionDescriptionId,
  NULL,
  'pd:' || positionDescriptionId || ':duty-group:details.managementDuties',
  'duty_group',
  '管理职责',
  '',
  CASE groupIndex
    WHEN 1 THEN '一、'
    WHEN 2 THEN '二、'
    WHEN 3 THEN '三、'
    WHEN 4 THEN '四、'
    WHEN 5 THEN '五、'
    WHEN 6 THEN '六、'
    WHEN 7 THEN '七、'
    WHEN 8 THEN '八、'
    WHEN 9 THEN '九、'
    WHEN 10 THEN '十、'
    ELSE CAST(groupIndex AS TEXT) || '、'
  END,
  'details.managementDuties',
  'details.managementDuties:管理职责',
  descriptionVersion,
  descriptionUpdatedAt,
  groupIndex,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM management_groups
WHERE NOT EXISTS (
  SELECT 1
  FROM "PositionResponsibilityNode" existing
  WHERE existing."nodeKey" = 'pd:' || positionDescriptionId || ':duty-group:details.managementDuties'
);

INSERT INTO "PositionResponsibilityNode" (
  "positionDescriptionId",
  "parentId",
  "nodeKey",
  "nodeType",
  "title",
  "content",
  "pathLabel",
  "sourcePath",
  "sourceHash",
  "descriptionVersion",
  "descriptionUpdatedAt",
  "sortOrder",
  "isActive",
  "createdAt",
  "updatedAt"
)
WITH management_items AS (
  SELECT
    pd."id" AS positionDescriptionId,
    COALESCE(json_array_length(CASE WHEN json_valid(pd."details") THEN pd."details" ELSE '{}' END, '$.duties'), 0) + 1 AS groupIndex,
    CAST(item."key" AS INTEGER) AS itemIndex,
    trim(CAST(item."value" AS TEXT)) AS content,
    'pd:' || pd."id" || ':duty-group:details.managementDuties' AS parentNodeKey,
    'details.managementDuties[' || item."key" || ']' AS sourcePath,
    pd."version" AS descriptionVersion,
    pd."updatedAt" AS descriptionUpdatedAt
  FROM "PositionDescription" pd,
       json_each(CASE WHEN json_valid(pd."details") THEN pd."details" ELSE '{}' END, '$.managementDuties') item
  WHERE json_valid(pd."details")
    AND json_type(CASE WHEN json_valid(pd."details") THEN pd."details" ELSE '{}' END, '$.managementDuties') = 'array'
    AND json_array_length(CASE WHEN json_valid(pd."details") THEN pd."details" ELSE '{}' END, '$.managementDuties') > 0
    AND trim(CAST(item."value" AS TEXT)) <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM "PositionResponsibilityNode" existing
      WHERE existing."positionDescriptionId" = pd."id"
        AND existing."isActive" = 1
        AND existing."nodeType" = 'duty_item'
    )
)
SELECT
  positionDescriptionId,
  (
    SELECT parent."id"
    FROM "PositionResponsibilityNode" parent
    WHERE parent."nodeKey" = parentNodeKey
  ),
  'pd:' || positionDescriptionId || ':duty-item:' || sourcePath,
  'duty_item',
  content,
  content,
  CAST(groupIndex AS TEXT) || '.' || CAST(itemIndex + 1 AS TEXT),
  sourcePath,
  sourcePath || ':' || content,
  descriptionVersion,
  descriptionUpdatedAt,
  itemIndex,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM management_items
WHERE NOT EXISTS (
  SELECT 1
  FROM "PositionResponsibilityNode" existing
  WHERE existing."nodeKey" = 'pd:' || positionDescriptionId || ':duty-item:' || sourcePath
);
