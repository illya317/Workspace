-- workspace:migration-mode=maintenance

ALTER TABLE "EmploymentAgreement"
ADD COLUMN "actualEndDate" TEXT;

UPDATE "EmploymentAgreement" agreement
SET "actualEndDate" = COALESCE(
  NULLIF(revision."contentJson"::jsonb -> 'legacyBaseline' ->> 'endDate', ''),
  (
    SELECT MAX(term."effectiveThrough")
    FROM "EmploymentAgreementTerm" term
    WHERE term."agreementId" = agreement.id
      AND term."recordState" = 'confirmed'
      AND term."changeKind" = 'end-date'
  )
)
FROM "EmploymentAgreementRevision" revision
WHERE revision.id = agreement."currentPublishedRevisionId";

ALTER TABLE "EmploymentAgreement"
ADD CONSTRAINT "EmploymentAgreement_actual_end_date_check"
CHECK (
  "actualEndDate" IS NULL OR (
    "actualEndDate" ~ '^\d{4}-\d{2}-\d{2}$'
    AND "workspace_parse_iso_date_immutable"("actualEndDate") IS NOT NULL
  )
);
