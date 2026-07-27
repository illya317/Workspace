ALTER TABLE "EmploymentAgreement"
ADD COLUMN IF NOT EXISTS "dataQualityJson" TEXT NOT NULL DEFAULT '{"missingFields":[]}';

ALTER TABLE "EmploymentAgreementTerm"
  DROP CONSTRAINT "EmploymentAgreementTerm_period_check",
  ADD CONSTRAINT "EmploymentAgreementTerm_period_check"
    CHECK (
      ("effectiveFrom" IS NULL OR (
        "effectiveFrom" ~ '^\d{4}-\d{2}-\d{2}$'
        AND "workspace_parse_iso_date_immutable"("effectiveFrom") IS NOT NULL
      ))
      AND ("effectiveThrough" IS NULL OR (
        "effectiveThrough" ~ '^\d{4}-\d{2}-\d{2}$'
        AND "workspace_parse_iso_date_immutable"("effectiveThrough") IS NOT NULL
      ))
      AND ("effectiveFrom" IS NULL OR "effectiveThrough" IS NULL OR "effectiveFrom" <= "effectiveThrough")
    );

WITH baseline_quality AS (
  SELECT
    agreement.id,
    jsonb_build_object(
      'missingFields',
      COALESCE(
        jsonb_agg(missing.path ORDER BY missing.path)
          FILTER (WHERE missing.path IS NOT NULL),
        '[]'::jsonb
      )
    )::text AS "dataQualityJson"
  FROM "EmploymentAgreement" agreement
  LEFT JOIN "EmploymentAgreementRevision" revision
    ON revision.id = agreement."currentPublishedRevisionId"
  LEFT JOIN LATERAL (
    SELECT 'content.company' AS path
    WHERE NULLIF(revision."contentJson"::jsonb ->> 'company', '') IS NULL
    UNION ALL
    SELECT 'content.insuranceStatus'
    WHERE NULLIF(revision."contentJson"::jsonb ->> 'insuranceStatus', '') IS NULL
    UNION ALL
    SELECT 'content.legalRelation'
    WHERE NULLIF(revision."contentJson"::jsonb ->> 'legalRelation', '') IS NULL
    UNION ALL
    SELECT 'content.contractType'
    WHERE NULLIF(revision."contentJson"::jsonb ->> 'contractType', '') IS NULL
    UNION ALL
    SELECT 'content.employmentForm'
    WHERE NULLIF(revision."contentJson"::jsonb ->> 'employmentForm', '') IS NULL
    UNION ALL
    SELECT format('terms.%s.effectiveFrom', term.sequence)
    FROM "EmploymentAgreementTerm" term
    WHERE term."agreementId" = agreement.id
      AND term."effectiveFrom" IS NULL
    UNION ALL
    SELECT format('terms.%s.effectiveThrough', term.sequence)
    FROM "EmploymentAgreementTerm" term
    WHERE term."agreementId" = agreement.id
      AND term."effectiveThrough" IS NULL
      AND term."termKind" <> 'permanent'
  ) missing ON true
  WHERE agreement."sourceKind" = 'legacy-baseline'
  GROUP BY agreement.id
)
UPDATE "EmploymentAgreement" agreement
SET "dataQualityJson" = baseline_quality."dataQualityJson"
FROM baseline_quality
WHERE agreement.id = baseline_quality.id;

UPDATE "EmploymentAgreementTerm"
SET "recordState" = 'confirmed'
WHERE "sourceKind" = 'legacy-baseline'
  AND "recordState" = 'unknown';
