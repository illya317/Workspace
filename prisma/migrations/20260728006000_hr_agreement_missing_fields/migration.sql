-- workspace:migration-mode=maintenance

ALTER TABLE "EmploymentAgreement"
RENAME COLUMN "dataQualityJson" TO "missingFieldsJson";

ALTER TABLE "EmploymentAgreement"
ALTER COLUMN "missingFieldsJson" DROP DEFAULT;

UPDATE "EmploymentAgreement"
SET "missingFieldsJson" = CASE
  WHEN jsonb_typeof("missingFieldsJson"::jsonb) = 'object'
    THEN COALESCE("missingFieldsJson"::jsonb -> 'missingFields', '[]'::jsonb)::text
  WHEN jsonb_typeof("missingFieldsJson"::jsonb) = 'array'
    THEN "missingFieldsJson"
  ELSE '[]'
END;

ALTER TABLE "EmploymentAgreement"
ALTER COLUMN "missingFieldsJson" SET DEFAULT '[]';
