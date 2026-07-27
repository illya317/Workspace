-- workspace:migration-mode=maintenance
-- Preserve incomplete legacy agreement baselines without inventing dates.
-- Contract terms may overlap because a renewal can be signed before the prior term ends.

ALTER TABLE "EmploymentAgreementTerm"
  DROP CONSTRAINT "EmploymentAgreementTerm_confirmed_period_excl";

ALTER TABLE "EmploymentAgreementTerm"
  DROP CONSTRAINT "EmploymentAgreementTerm_period_check",
  DROP CONSTRAINT "EmploymentAgreementTerm_recordState_check",
  DROP CONSTRAINT "EmploymentAgreementTerm_changeKind_check",
  ALTER COLUMN "effectiveFrom" DROP NOT NULL;

ALTER TABLE "EmploymentAgreementTerm"
  ADD CONSTRAINT "EmploymentAgreementTerm_recordState_check"
    CHECK ("recordState" IN ('confirmed', 'cancelled', 'superseded', 'voided', 'unknown')),
  ADD CONSTRAINT "EmploymentAgreementTerm_changeKind_check"
    CHECK ("changeKind" IN ('schedule', 'renew', 'correct', 'end-date', 'legacy')),
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
      AND ("recordState" = 'unknown' OR "effectiveFrom" IS NOT NULL)
    );
