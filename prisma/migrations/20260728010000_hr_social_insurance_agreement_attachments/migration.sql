CREATE EXTENSION IF NOT EXISTS btree_gist;

UPDATE "EmploymentAgreement"
SET "missingFieldsJson" = ("missingFieldsJson"::jsonb - 'content.insuranceStatus')::text
WHERE "missingFieldsJson"::jsonb ? 'content.insuranceStatus';

CREATE TABLE "EmployeeSocialInsurancePeriod" (
    "id" SERIAL NOT NULL,
    "periodUid" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "employeeId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "startMonth" DATE NOT NULL,
    "endMonth" DATE,
    "stopReason" TEXT,
    "note" TEXT,
    "recordState" TEXT NOT NULL DEFAULT 'confirmed',
    "sourceKind" TEXT NOT NULL DEFAULT 'workspace',
    "sourceRef" TEXT,
    "createdBy" INTEGER,
    "updatedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "EmployeeSocialInsurancePeriod_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmployeeSocialInsurancePeriod_month_start_check" CHECK (EXTRACT(DAY FROM "startMonth") = 1),
    CONSTRAINT "EmployeeSocialInsurancePeriod_month_end_check" CHECK ("endMonth" IS NULL OR EXTRACT(DAY FROM "endMonth") = 1),
    CONSTRAINT "EmployeeSocialInsurancePeriod_period_check" CHECK ("endMonth" IS NULL OR "startMonth" <= "endMonth"),
    CONSTRAINT "EmployeeSocialInsurancePeriod_stop_reason_check" CHECK ("endMonth" IS NULL OR NULLIF(BTRIM("stopReason"), '') IS NOT NULL),
    CONSTRAINT "EmployeeSocialInsurancePeriod_state_check" CHECK ("recordState" IN ('confirmed', 'cancelled'))
);

CREATE UNIQUE INDEX "EmployeeSocialInsurancePeriod_periodUid_key" ON "EmployeeSocialInsurancePeriod"("periodUid");
CREATE INDEX "EmployeeSocialInsurancePeriod_employeeId_startMonth_endMonth_idx" ON "EmployeeSocialInsurancePeriod"("employeeId", "startMonth", "endMonth");
CREATE INDEX "EmployeeSocialInsurancePeriod_companyId_startMonth_endMonth_idx" ON "EmployeeSocialInsurancePeriod"("companyId", "startMonth", "endMonth");
CREATE INDEX "EmployeeSocialInsurancePeriod_employeeId_recordState_idx" ON "EmployeeSocialInsurancePeriod"("employeeId", "recordState");
CREATE UNIQUE INDEX "EmployeeSocialInsurancePeriod_one_open_idx" ON "EmployeeSocialInsurancePeriod"("employeeId") WHERE "recordState" = 'confirmed' AND "endMonth" IS NULL;

ALTER TABLE "EmployeeSocialInsurancePeriod"
    ADD CONSTRAINT "EmployeeSocialInsurancePeriod_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "EmployeeSocialInsurancePeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "EmployeeSocialInsurancePeriod_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "EmployeeSocialInsurancePeriod_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "EmployeeSocialInsurancePeriod_no_overlap_excl"
        EXCLUDE USING gist (
            "employeeId" WITH =,
            daterange("startMonth", COALESCE(("endMonth" + INTERVAL '1 month')::date, 'infinity'::date), '[)') WITH &&
        ) WHERE ("recordState" = 'confirmed') DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE "EmploymentAgreementAttachment" (
    "id" SERIAL NOT NULL,
    "attachmentUid" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "agreementId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "originalStoragePath" TEXT NOT NULL,
    "originalSizeBytes" INTEGER NOT NULL,
    "originalChecksumSha256" TEXT NOT NULL,
    "optimizedStoragePath" TEXT,
    "optimizedSizeBytes" INTEGER,
    "optimizedChecksumSha256" TEXT,
    "optimizationStatus" TEXT NOT NULL DEFAULT 'not_applicable',
    "optimizationError" TEXT,
    "compressionSavingsRatio" DECIMAL(8,6),
    "pageCount" INTEGER,
    "note" TEXT,
    "uploadedBy" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedBy" INTEGER,
    "removedAt" TIMESTAMP(3),
    "removalReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "EmploymentAgreementAttachment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmploymentAgreementAttachment_optimization_status_check" CHECK ("optimizationStatus" IN ('not_applicable', 'optimized', 'retained_original', 'failed'))
);

CREATE UNIQUE INDEX "EmploymentAgreementAttachment_attachmentUid_key" ON "EmploymentAgreementAttachment"("attachmentUid");
CREATE INDEX "EmploymentAgreementAttachment_agreementId_removedAt_uploadedAt_idx" ON "EmploymentAgreementAttachment"("agreementId", "removedAt", "uploadedAt");
CREATE INDEX "EmploymentAgreementAttachment_optimizationStatus_idx" ON "EmploymentAgreementAttachment"("optimizationStatus");

ALTER TABLE "EmploymentAgreementAttachment"
    ADD CONSTRAINT "EmploymentAgreementAttachment_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "EmploymentAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "EmploymentAgreementAttachment_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "EmploymentAgreementAttachment_removedBy_fkey" FOREIGN KEY ("removedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
