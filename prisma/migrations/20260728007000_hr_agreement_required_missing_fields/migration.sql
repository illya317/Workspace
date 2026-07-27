-- workspace:migration-mode=expand

UPDATE "EmploymentAgreement"
SET "missingFieldsJson" = COALESCE((
  SELECT jsonb_agg(field ORDER BY field)
  FROM jsonb_array_elements_text("missingFieldsJson"::jsonb) AS missing(field)
  WHERE field ~ '^terms\.[0-9]+\.effectiveFrom$'
), '[]'::jsonb)::text
WHERE "sourceKind" = 'legacy-baseline';
