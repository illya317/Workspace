-- workspace:migration-mode=maintenance

ALTER TABLE "EmployeeSocialInsurancePeriod"
    ADD COLUMN "insuranceStatus" TEXT NOT NULL DEFAULT 'insured',
    ADD COLUMN "companyNameSnapshot" TEXT,
    ADD COLUMN "missingFieldsJson" TEXT NOT NULL DEFAULT '[]',
    ALTER COLUMN "companyId" DROP NOT NULL,
    ALTER COLUMN "startMonth" DROP NOT NULL;

UPDATE "EmployeeSocialInsurancePeriod" period
SET "companyNameSnapshot" = party.name
FROM "Company" company
JOIN "Party" party ON party.id = company."partyId"
WHERE period."companyId" = company.id;

DROP INDEX "EmployeeSocialInsurancePeriod_one_open_idx";

CREATE UNIQUE INDEX "EmployeeSocialInsurancePeriod_one_open_idx"
    ON "EmployeeSocialInsurancePeriod"("employeeId")
    WHERE "recordState" = 'confirmed' AND "insuranceStatus" = 'insured';

ALTER TABLE "EmployeeSocialInsurancePeriod"
    DROP CONSTRAINT "EmployeeSocialInsurancePeriod_month_start_check",
    DROP CONSTRAINT "EmployeeSocialInsurancePeriod_period_check",
    DROP CONSTRAINT "EmployeeSocialInsurancePeriod_stop_reason_check",
    DROP CONSTRAINT "EmployeeSocialInsurancePeriod_no_overlap_excl",
    ADD CONSTRAINT "EmployeeSocialInsurancePeriod_status_check"
        CHECK ("insuranceStatus" IN ('insured', 'stopped', 'uninsured', 'retired')),
    ADD CONSTRAINT "EmployeeSocialInsurancePeriod_month_start_check"
        CHECK ("startMonth" IS NULL OR EXTRACT(DAY FROM "startMonth") = 1),
    ADD CONSTRAINT "EmployeeSocialInsurancePeriod_period_check"
        CHECK ("startMonth" IS NULL OR "endMonth" IS NULL OR "startMonth" <= "endMonth"),
    ADD CONSTRAINT "EmployeeSocialInsurancePeriod_stop_reason_check"
        CHECK (
            "insuranceStatus" <> 'stopped'
            OR "sourceKind" = 'legacy-baseline'
            OR NULLIF(BTRIM("stopReason"), '') IS NOT NULL
        ),
    ADD CONSTRAINT "EmployeeSocialInsurancePeriod_missing_fields_json_check"
        CHECK (jsonb_typeof("missingFieldsJson"::jsonb) = 'array'),
    ADD CONSTRAINT "EmployeeSocialInsurancePeriod_no_overlap_excl"
        EXCLUDE USING gist (
            "employeeId" WITH =,
            daterange("startMonth", COALESCE(("endMonth" + INTERVAL '1 month')::date, 'infinity'::date), '[)') WITH &&
        ) WHERE (
            "recordState" = 'confirmed'
            AND "startMonth" IS NOT NULL
            AND ("insuranceStatus" = 'insured' OR ("insuranceStatus" = 'stopped' AND "endMonth" IS NOT NULL))
        ) DEFERRABLE INITIALLY DEFERRED;
