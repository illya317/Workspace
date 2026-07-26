-- workspace:migration-mode=maintenance
-- Establish the append-only legal-fact authority for Party/Company.

CREATE TABLE "PartyLegalFactRevision" (
    "id" SERIAL NOT NULL,
    "partyId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "commandKind" TEXT NOT NULL,
    "effectiveOn" DATE NOT NULL,
    "recordState" TEXT NOT NULL DEFAULT 'confirmed',
    "supersedesId" INTEGER,
    "subjectType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT,
    "identityNumber" TEXT NOT NULL,
    "legalRepresentative" TEXT,
    "registeredCapital" TEXT,
    "registeredAddress" TEXT,
    "registeredDate" TEXT,
    "sourceRegistryChangeId" INTEGER,
    "sourceType" TEXT,
    "sourceLabel" TEXT,
    "sourceReference" TEXT,
    "reason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "recordedBy" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyLegalFactRevision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PartyLegalFactRevision_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "PartyLegalFactRevision_command_check" CHECK ("commandKind" IN ('establish', 'change', 'correction', 'cancel-future')),
    CONSTRAINT "PartyLegalFactRevision_state_check" CHECK ("recordState" IN ('confirmed', 'cancelled')),
    CONSTRAINT "PartyLegalFactRevision_required_text_check" CHECK (length(trim("name")) > 0 AND length(trim("identityNumber")) > 0 AND length(trim("idempotencyKey")) > 0),
    CONSTRAINT "PartyLegalFactRevision_supersession_shape_check" CHECK (
      ("commandKind" IN ('establish', 'change') AND "supersedesId" IS NULL AND "recordState" = 'confirmed')
      OR ("commandKind" = 'correction' AND "supersedesId" IS NOT NULL AND "recordState" = 'confirmed' AND length(trim(COALESCE("reason", ''))) > 0)
      OR ("commandKind" = 'cancel-future' AND "supersedesId" IS NOT NULL AND "recordState" = 'cancelled' AND length(trim(COALESCE("reason", ''))) > 0)
    )
);

CREATE UNIQUE INDEX "PartyLegalFactRevision_idempotencyKey_key" ON "PartyLegalFactRevision"("idempotencyKey");
CREATE UNIQUE INDEX "PartyLegalFactRevision_supersedesId_key" ON "PartyLegalFactRevision"("supersedesId");
CREATE UNIQUE INDEX "PartyLegalFactRevision_party_revision_key" ON "PartyLegalFactRevision"("partyId", "revision");
CREATE INDEX "PartyLegalFactRevision_party_effective_revision_idx" ON "PartyLegalFactRevision"("partyId", "effectiveOn", "revision");
CREATE INDEX "PartyLegalFactRevision_supersedes_idx" ON "PartyLegalFactRevision"("supersedesId");
CREATE INDEX "PartyLegalFactRevision_registry_change_idx" ON "PartyLegalFactRevision"("sourceRegistryChangeId");

ALTER TABLE "PartyLegalFactRevision"
  ADD CONSTRAINT "PartyLegalFactRevision_partyId_fkey"
  FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PartyLegalFactRevision"
  ADD CONSTRAINT "PartyLegalFactRevision_supersedesId_fkey"
  FOREIGN KEY ("supersedesId") REFERENCES "PartyLegalFactRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "PartyLegalFactRevision" (
  "partyId", "revision", "commandKind", "effectiveOn", "recordState",
  "subjectType", "name", "fullName", "identityNumber", "legalRepresentative",
  "registeredCapital", "registeredAddress", "registeredDate",
  "sourceType", "sourceLabel", "reason", "idempotencyKey", "requestFingerprint", "recordedBy", "recordedAt"
)
SELECT
  p."id",
  1,
  'establish',
  p."createdAt"::date,
  'confirmed',
  p."subjectType",
  p."name",
  p."fullName",
  p."identityNumber",
  p."legalRepresentative",
  c."registeredCapital",
  c."registeredAddress",
  c."registeredDate",
  'migration-baseline',
  '20260727170000_external_party_legal_fact_lifecycle',
  '现状基线；迁移前历史未知，不据此伪造更早期间',
  'external-legal-fact-baseline:' || p."id"::text,
  md5('external-legal-fact-baseline:' || p."id"::text),
  p."editedBy",
  COALESCE(p."editedAt", p."updatedAt", p."createdAt", CURRENT_TIMESTAMP)
FROM "Party" p
LEFT JOIN "Company" c ON c."partyId" = p."id";

CREATE FUNCTION "enforce_party_legal_fact_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PartyLegalFactRevision is append-only; append a correction or cancellation instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PartyLegalFactRevision_append_only"
BEFORE UPDATE OR DELETE ON "PartyLegalFactRevision"
FOR EACH ROW EXECUTE FUNCTION "enforce_party_legal_fact_append_only"();

CREATE FUNCTION "validate_party_legal_fact_supersession"() RETURNS trigger AS $$
DECLARE
  target_party_id INTEGER;
  target_revision INTEGER;
BEGIN
  IF NEW."supersedesId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "partyId", "revision" INTO target_party_id, target_revision
  FROM "PartyLegalFactRevision"
  WHERE "id" = NEW."supersedesId";

  IF target_party_id IS NULL OR target_party_id <> NEW."partyId" OR target_revision >= NEW."revision" THEN
    RAISE EXCEPTION 'legal-fact supersession must target an earlier revision of the same Party';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PartyLegalFactRevision_validate_supersession"
BEFORE INSERT ON "PartyLegalFactRevision"
FOR EACH ROW EXECUTE FUNCTION "validate_party_legal_fact_supersession"();
