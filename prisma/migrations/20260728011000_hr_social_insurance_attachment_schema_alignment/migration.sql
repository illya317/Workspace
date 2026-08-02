-- workspace:migration-mode=maintenance
-- Align client-generated UUID defaults and Prisma's deterministic PostgreSQL index names.

ALTER TABLE "EmployeeSocialInsurancePeriod"
    ALTER COLUMN "periodUid" DROP DEFAULT;

ALTER TABLE "EmploymentAgreementAttachment"
    ALTER COLUMN "attachmentUid" DROP DEFAULT;

ALTER INDEX "EmployeeSocialInsurancePeriod_employeeId_startMonth_endMonth_id"
    RENAME TO "EmployeeSocialInsurancePeriod_employeeId_startMonth_endMont_idx";

ALTER INDEX "EmploymentAgreementAttachment_agreementId_removedAt_uploadedAt_"
    RENAME TO "EmploymentAgreementAttachment_agreementId_removedAt_uploade_idx";
