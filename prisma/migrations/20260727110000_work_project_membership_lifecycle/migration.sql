-- workspace:migration-mode=maintenance
-- Convert EmployeeProject from a mutable join row into an effective-version record
-- with an immutable command ledger. Existing rows become confirmed baseline versions.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- PostgreSQL's text-to-date cast is STABLE because it observes DateStyle, so it
-- cannot be used directly by a GiST exclusion expression. Lifecycle dates are
-- canonical ISO strings; parse their numeric components with an IMMUTABLE helper.
CREATE FUNCTION "workspace_parse_iso_date_immutable"(value TEXT) RETURNS DATE AS $$
    SELECT CASE
        WHEN value IS NULL OR value = '' THEN NULL
        ELSE make_date(
            substring(value FROM 1 FOR 4)::INTEGER,
            substring(value FROM 6 FOR 2)::INTEGER,
            substring(value FROM 9 FOR 2)::INTEGER
        )
    END
$$ LANGUAGE SQL IMMUTABLE PARALLEL SAFE;

CREATE TABLE "ProjectMembershipChange" (
    "id" SERIAL NOT NULL,
    "changeUid" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "idempotencyKey" TEXT,
    "requestFingerprint" TEXT NOT NULL,
    "membershipUid" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "commandKind" TEXT NOT NULL,
    "effectiveOn" TEXT,
    "reason" TEXT,
    "effectsJson" TEXT NOT NULL,
    "recordedBy" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectMembershipChange_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EmployeeProject"
    ADD COLUMN "membershipUid" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "recordState" TEXT NOT NULL DEFAULT 'confirmed',
    ADD COLUMN "changeKind" TEXT NOT NULL DEFAULT 'initial',
    ADD COLUMN "supersedesId" INTEGER,
    ADD COLUMN "createdByChangeId" INTEGER,
    ADD COLUMN "terminalChangeId" INTEGER,
    ADD COLUMN "reason" TEXT;

DROP INDEX "EmployeeProject_employeeId_projectId_key";

ALTER TABLE "EmployeeProject"
    DROP CONSTRAINT "EmployeeProject_employeeId_fkey",
    DROP CONSTRAINT "EmployeeProject_projectId_fkey";

CREATE UNIQUE INDEX "EmployeeProject_membershipUid_sequence_key"
    ON "EmployeeProject"("membershipUid", "sequence");
CREATE INDEX "EmployeeProject_live_period_idx"
    ON "EmployeeProject"("employeeId", "projectId", "recordState", "startDate", "endDate");
CREATE INDEX "EmployeeProject_supersedesId_idx" ON "EmployeeProject"("supersedesId");
CREATE INDEX "EmployeeProject_createdByChangeId_idx" ON "EmployeeProject"("createdByChangeId");
CREATE INDEX "EmployeeProject_terminalChangeId_idx" ON "EmployeeProject"("terminalChangeId");

CREATE UNIQUE INDEX "ProjectMembershipChange_changeUid_key" ON "ProjectMembershipChange"("changeUid");
CREATE UNIQUE INDEX "ProjectMembershipChange_idempotencyKey_key" ON "ProjectMembershipChange"("idempotencyKey");
CREATE INDEX "ProjectMembershipChange_membershipUid_recordedAt_idx"
    ON "ProjectMembershipChange"("membershipUid", "recordedAt");
CREATE INDEX "ProjectMembershipChange_employeeId_projectId_recordedAt_idx"
    ON "ProjectMembershipChange"("employeeId", "projectId", "recordedAt");

ALTER TABLE "EmployeeProject"
    ADD CONSTRAINT "EmployeeProject_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT "EmployeeProject_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT "EmployeeProject_supersedesId_fkey"
        FOREIGN KEY ("supersedesId") REFERENCES "EmployeeProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "EmployeeProject_createdByChangeId_fkey"
        FOREIGN KEY ("createdByChangeId") REFERENCES "ProjectMembershipChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "EmployeeProject_terminalChangeId_fkey"
        FOREIGN KEY ("terminalChangeId") REFERENCES "ProjectMembershipChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "EmployeeProject_recordState_check"
        CHECK ("recordState" IN ('confirmed', 'cancelled', 'superseded', 'voided')),
    ADD CONSTRAINT "EmployeeProject_changeKind_check"
        CHECK ("changeKind" IN ('initial', 'scheduled', 'role_change', 'correction', 'rejoin')),
    ADD CONSTRAINT "EmployeeProject_period_check"
        CHECK (
            ("startDate" IS NULL OR "startDate" = '' OR ("startDate" ~ '^\d{4}-\d{2}-\d{2}$' AND "workspace_parse_iso_date_immutable"("startDate") IS NOT NULL))
            AND ("endDate" IS NULL OR "endDate" = '' OR ("endDate" ~ '^\d{4}-\d{2}-\d{2}$' AND "workspace_parse_iso_date_immutable"("endDate") IS NOT NULL))
            AND (NULLIF("startDate", '') IS NULL OR NULLIF("endDate", '') IS NULL OR "startDate" <= "endDate")
        ),
    ADD CONSTRAINT "EmployeeProject_confirmed_period_excl"
        EXCLUDE USING gist (
            "employeeId" WITH =,
            "projectId" WITH =,
            daterange(
                COALESCE("workspace_parse_iso_date_immutable"("startDate"), '-infinity'::date),
                COALESCE("workspace_parse_iso_date_immutable"("endDate") + 1, 'infinity'::date),
                '[)'
            ) WITH &&
        ) WHERE ("recordState" = 'confirmed');

ALTER TABLE "ProjectMembershipChange"
    ADD CONSTRAINT "ProjectMembershipChange_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProjectMembershipChange_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ProjectMembershipChange_commandKind_check"
        CHECK ("commandKind" IN ('schedule', 'change-role', 'correct', 'end-date', 'cancel-future', 'reject')),
    ADD CONSTRAINT "ProjectMembershipChange_effectiveOn_check"
        CHECK ("effectiveOn" IS NULL OR "effectiveOn" ~ '^\d{4}-\d{2}-\d{2}$');
