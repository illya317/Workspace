-- workspace:migration-mode=maintenance
-- Normalize Employment.contracts into stable agreement identities, effective terms and immutable revisions.
-- Legacy JSON is deliberately not migrated here: ambiguous records must be resolved by the HR preflight/import path.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "EmploymentAgreement" (
    "id" SERIAL NOT NULL,
    "agreementUid" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "employmentId" INTEGER NOT NULL,
    "recordState" TEXT NOT NULL DEFAULT 'confirmed',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sourceKind" TEXT NOT NULL DEFAULT 'workspace',
    "sourceRef" TEXT,
    "reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "currentPublishedRevisionId" INTEGER,
    "createdBy" INTEGER,
    "updatedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmploymentAgreement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmploymentAgreementTerm" (
    "id" SERIAL NOT NULL,
    "termUid" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "agreementId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "termKind" TEXT NOT NULL DEFAULT 'initial',
    "effectiveFrom" TEXT NOT NULL,
    "effectiveThrough" TEXT,
    "recordState" TEXT NOT NULL DEFAULT 'confirmed',
    "changeKind" TEXT NOT NULL DEFAULT 'schedule',
    "supersedesId" INTEGER,
    "sourceKind" TEXT NOT NULL DEFAULT 'workspace',
    "sourceRef" TEXT,
    "reason" TEXT,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmploymentAgreementTerm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmploymentAgreementRevision" (
    "id" SERIAL NOT NULL,
    "revisionUid" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "agreementId" INTEGER NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "recordState" TEXT NOT NULL DEFAULT 'draft',
    "contentJson" TEXT NOT NULL,
    "supersedesRevisionId" INTEGER,
    "sourceKind" TEXT NOT NULL DEFAULT 'workspace',
    "sourceRef" TEXT,
    "reason" TEXT,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmploymentAgreementRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmploymentAgreement_agreementUid_key" ON "EmploymentAgreement"("agreementUid");
CREATE UNIQUE INDEX "EmploymentAgreement_currentPublishedRevisionId_key" ON "EmploymentAgreement"("currentPublishedRevisionId");
CREATE INDEX "EmploymentAgreement_employmentId_recordState_idx" ON "EmploymentAgreement"("employmentId", "recordState");
CREATE INDEX "EmploymentAgreement_employmentId_isPrimary_recordState_idx" ON "EmploymentAgreement"("employmentId", "isPrimary", "recordState");

CREATE UNIQUE INDEX "EmploymentAgreementTerm_termUid_key" ON "EmploymentAgreementTerm"("termUid");
CREATE UNIQUE INDEX "EmploymentAgreementTerm_agreementId_sequence_key" ON "EmploymentAgreementTerm"("agreementId", "sequence");
CREATE INDEX "EmploymentAgreementTerm_live_period_idx"
    ON "EmploymentAgreementTerm"("agreementId", "recordState", "effectiveFrom", "effectiveThrough");
CREATE INDEX "EmploymentAgreementTerm_supersedesId_idx" ON "EmploymentAgreementTerm"("supersedesId");

CREATE UNIQUE INDEX "EmploymentAgreementRevision_revisionUid_key" ON "EmploymentAgreementRevision"("revisionUid");
CREATE UNIQUE INDEX "EmploymentAgreementRevision_agreementId_revisionNo_key" ON "EmploymentAgreementRevision"("agreementId", "revisionNo");
CREATE INDEX "EmploymentAgreementRevision_state_created_idx"
    ON "EmploymentAgreementRevision"("agreementId", "recordState", "createdAt");
CREATE INDEX "EmploymentAgreementRevision_supersedesRevisionId_idx" ON "EmploymentAgreementRevision"("supersedesRevisionId");

ALTER TABLE "EmploymentAgreement"
    ADD CONSTRAINT "EmploymentAgreement_employmentId_fkey"
        FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "EmploymentAgreement_recordState_check"
        CHECK ("recordState" IN ('confirmed', 'cancelled', 'voided'));

ALTER TABLE "EmploymentAgreementTerm"
    ADD CONSTRAINT "EmploymentAgreementTerm_agreementId_fkey"
        FOREIGN KEY ("agreementId") REFERENCES "EmploymentAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "EmploymentAgreementTerm_supersedesId_fkey"
        FOREIGN KEY ("supersedesId") REFERENCES "EmploymentAgreementTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "EmploymentAgreementTerm_recordState_check"
        CHECK ("recordState" IN ('confirmed', 'cancelled', 'superseded', 'voided')),
    ADD CONSTRAINT "EmploymentAgreementTerm_termKind_check"
        CHECK ("termKind" IN ('initial', 'renewal', 'permanent')),
    ADD CONSTRAINT "EmploymentAgreementTerm_changeKind_check"
        CHECK ("changeKind" IN ('schedule', 'renew', 'correct', 'end-date')),
    ADD CONSTRAINT "EmploymentAgreementTerm_period_check"
        CHECK (
            "effectiveFrom" ~ '^\d{4}-\d{2}-\d{2}$'
            AND "workspace_parse_iso_date_immutable"("effectiveFrom") IS NOT NULL
            AND ("effectiveThrough" IS NULL OR (
                "effectiveThrough" ~ '^\d{4}-\d{2}-\d{2}$'
                AND "workspace_parse_iso_date_immutable"("effectiveThrough") IS NOT NULL
            ))
            AND ("effectiveThrough" IS NULL OR "effectiveFrom" <= "effectiveThrough")
        );

ALTER TABLE "EmploymentAgreementRevision"
    ADD CONSTRAINT "EmploymentAgreementRevision_agreementId_fkey"
        FOREIGN KEY ("agreementId") REFERENCES "EmploymentAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "EmploymentAgreementRevision_supersedesRevisionId_fkey"
        FOREIGN KEY ("supersedesRevisionId") REFERENCES "EmploymentAgreementRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "EmploymentAgreementRevision_recordState_check"
        CHECK ("recordState" IN ('draft', 'published', 'cancelled'));

ALTER TABLE "EmploymentAgreement"
    ADD CONSTRAINT "EmploymentAgreement_currentPublishedRevisionId_fkey"
        FOREIGN KEY ("currentPublishedRevisionId") REFERENCES "EmploymentAgreementRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmploymentAgreementTerm"
    ADD CONSTRAINT "EmploymentAgreementTerm_confirmed_period_excl"
        EXCLUDE USING gist (
            "agreementId" WITH =,
            daterange(
                "workspace_parse_iso_date_immutable"("effectiveFrom"),
                COALESCE("workspace_parse_iso_date_immutable"("effectiveThrough") + 1, 'infinity'::date),
                '[)'
            ) WITH &&
        ) WHERE ("recordState" = 'confirmed');
