-- workspace:migration-mode=maintenance
-- Distinguish initial publication, baseline completion, historical correction and normal amendments.

ALTER TABLE "EmploymentAgreementRevision"
    ADD COLUMN "changeKind" TEXT NOT NULL DEFAULT 'revision';

UPDATE "EmploymentAgreementRevision" revision
SET "changeKind" = CASE
    WHEN agreement."sourceKind" = 'legacy-baseline' THEN 'baseline-import'
    ELSE 'initial'
END
FROM "EmploymentAgreement" agreement
WHERE revision."agreementId" = agreement."id"
  AND revision."revisionNo" = 1;

ALTER TABLE "EmploymentAgreementRevision"
    ALTER COLUMN "changeKind" SET DEFAULT 'initial',
    ADD CONSTRAINT "EmploymentAgreementRevision_changeKind_check"
        CHECK ("changeKind" IN ('initial', 'baseline-import', 'supplement', 'correction', 'amendment', 'revision'));
