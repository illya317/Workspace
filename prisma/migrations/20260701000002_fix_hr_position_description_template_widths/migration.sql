UPDATE "DocumentTemplate"
SET
  "documentJson" = json_set(
    "documentJson",
    '$.blocks[0].columnWidths',
    json_array('16%', '7%', '27%', '16%', '14%', '20%')
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE
  "sourceKind" = 'hr.position-description.official'
  AND "sourceProductKey" = 'hr.position-description.default'
  AND "deletedAt" IS NULL
  AND json_valid("documentJson")
  AND json_extract("documentJson", '$.blocks[0].type') = 'table';
