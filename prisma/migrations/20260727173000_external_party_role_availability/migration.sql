-- workspace:migration-mode=maintenance
-- Replace ExternalPartyRole.isActive as authority with append-only availability period revisions.
-- Existing rows only establish the currently known baseline; no pre-migration history is inferred.

ALTER TABLE "ExternalPartyRole"
    ADD COLUMN "availabilityVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "ExternalPartyRolePeriod" (
    "id" SERIAL NOT NULL,
    "roleId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "validFrom" TEXT,
    "validThrough" TEXT,
    "recordState" TEXT NOT NULL DEFAULT 'confirmed',
    "commandKind" TEXT NOT NULL,
    "supersedesId" INTEGER,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "reason" TEXT,
    "recordedBy" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalPartyRolePeriod_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ExternalPartyRolePeriod_recordState_check"
        CHECK ("recordState" IN ('confirmed', 'cancelled', 'unknown')),
    CONSTRAINT "ExternalPartyRolePeriod_commandKind_check"
        CHECK ("commandKind" IN ('baseline', 'establish', 'schedule', 'end-date', 'cancel-future', 'correct')),
    CONSTRAINT "ExternalPartyRolePeriod_period_check"
        CHECK (
            ("validFrom" IS NULL OR "validFrom" ~ '^\d{4}-\d{2}-\d{2}$')
            AND ("validThrough" IS NULL OR "validThrough" ~ '^\d{4}-\d{2}-\d{2}$')
            AND ("validFrom" IS NULL OR "validThrough" IS NULL OR "validFrom" <= "validThrough")
        )
);

CREATE UNIQUE INDEX "ExternalPartyRolePeriod_idempotencyKey_key"
    ON "ExternalPartyRolePeriod"("idempotencyKey");
CREATE UNIQUE INDEX "ExternalPartyRolePeriod_roleId_sequence_key"
    ON "ExternalPartyRolePeriod"("roleId", "sequence");
CREATE INDEX "ExternalPartyRolePeriod_role_state_period_idx"
    ON "ExternalPartyRolePeriod"("roleId", "recordState", "validFrom", "validThrough");
CREATE UNIQUE INDEX "ExternalPartyRolePeriod_supersedesId_key"
    ON "ExternalPartyRolePeriod"("supersedesId");

ALTER TABLE "ExternalPartyRolePeriod"
    ADD CONSTRAINT "ExternalPartyRolePeriod_roleId_fkey"
        FOREIGN KEY ("roleId") REFERENCES "ExternalPartyRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ExternalPartyRolePeriod_supersedesId_fkey"
        FOREIGN KEY ("supersedesId") REFERENCES "ExternalPartyRolePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "ExternalPartyRolePeriod" (
    "roleId", "sequence", "validFrom", "validThrough", "recordState",
    "commandKind", "idempotencyKey", "requestFingerprint", "reason", "recordedAt"
)
SELECT
    role."id",
    1,
    CASE WHEN role."isActive" THEN to_char(CURRENT_DATE, 'YYYY-MM-DD') ELSE NULL END,
    NULL,
    CASE WHEN role."isActive" THEN 'confirmed' ELSE 'unknown' END,
    'baseline',
    'migration:external-party-role:' || role."id"::text,
    md5('migration:external-party-role:' || role."id"::text),
    CASE
      WHEN role."isActive" THEN '迁移时仅确认角色从迁移观察日起当前可用，更早历史未知'
      ELSE '迁移时仅确认角色当前不可用，历史期间和结束日期未知'
    END,
    CURRENT_TIMESTAMP
FROM "ExternalPartyRole" role;

CREATE OR REPLACE FUNCTION workspace_reject_external_party_role_period_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ExternalPartyRolePeriod is append-only; append a lifecycle command instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ExternalPartyRolePeriod_reject_update"
BEFORE UPDATE ON "ExternalPartyRolePeriod"
FOR EACH ROW EXECUTE FUNCTION workspace_reject_external_party_role_period_mutation();

CREATE TRIGGER "ExternalPartyRolePeriod_reject_delete"
BEFORE DELETE ON "ExternalPartyRolePeriod"
FOR EACH ROW EXECUTE FUNCTION workspace_reject_external_party_role_period_mutation();
