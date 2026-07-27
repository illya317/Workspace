WITH baseline_quality AS (
  SELECT
    agreement.id,
    COALESCE(
      jsonb_agg(missing.path ORDER BY missing.path)
        FILTER (WHERE missing.path IS NOT NULL),
      '[]'::jsonb
    )::text AS "missingFieldsJson"
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
      AND term."recordState" = 'confirmed'
      AND term."effectiveFrom" IS NULL
    UNION ALL
    SELECT format('terms.%s.effectiveThrough', term.sequence)
    FROM "EmploymentAgreementTerm" term
    WHERE term."agreementId" = agreement.id
      AND term."recordState" = 'confirmed'
      AND term."effectiveThrough" IS NULL
      AND term."termKind" <> 'permanent'
  ) missing ON true
  WHERE agreement."sourceKind" = 'legacy-baseline'
  GROUP BY agreement.id
)
UPDATE "EmploymentAgreement" agreement
SET "missingFieldsJson" = baseline_quality."missingFieldsJson"
FROM baseline_quality
WHERE agreement.id = baseline_quality.id;
