-- workspace:migration-mode=maintenance

CREATE TABLE "EmployeeSocialInsurancePeriodRevision" (
    "id" SERIAL NOT NULL,
    "revisionUid" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "changeKind" TEXT NOT NULL,
    "beforeJson" TEXT NOT NULL,
    "afterJson" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedBy" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeSocialInsurancePeriodRevision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmployeeSocialInsurancePeriodRevision_change_kind_check"
        CHECK ("changeKind" IN ('supplement', 'correction')),
    CONSTRAINT "EmployeeSocialInsurancePeriodRevision_reason_check"
        CHECK (NULLIF(BTRIM("reason"), '') IS NOT NULL),
    CONSTRAINT "EmployeeSocialInsurancePeriodRevision_before_json_check"
        CHECK (jsonb_typeof("beforeJson"::jsonb) = 'object'),
    CONSTRAINT "EmployeeSocialInsurancePeriodRevision_after_json_check"
        CHECK (jsonb_typeof("afterJson"::jsonb) = 'object')
);

CREATE UNIQUE INDEX "EmployeeSocialInsurancePeriodRevision_revisionUid_key"
    ON "EmployeeSocialInsurancePeriodRevision"("revisionUid");
CREATE UNIQUE INDEX "EmployeeSocialInsurancePeriodRevision_periodId_revisionNo_key"
    ON "EmployeeSocialInsurancePeriodRevision"("periodId", "revisionNo");
CREATE INDEX "EmployeeSocialInsurancePeriodRevision_periodId_recordedAt_idx"
    ON "EmployeeSocialInsurancePeriodRevision"("periodId", "recordedAt");
CREATE INDEX "EmployeeSocialInsurancePeriodRevision_recordedBy_idx"
    ON "EmployeeSocialInsurancePeriodRevision"("recordedBy");

ALTER TABLE "EmployeeSocialInsurancePeriodRevision"
    ADD CONSTRAINT "EmployeeSocialInsurancePeriodRevision_periodId_fkey"
        FOREIGN KEY ("periodId") REFERENCES "EmployeeSocialInsurancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "EmployeeSocialInsurancePeriodRevision_recordedBy_fkey"
        FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
