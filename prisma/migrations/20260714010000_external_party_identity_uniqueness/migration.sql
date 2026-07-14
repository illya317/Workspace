-- Replace the lookup index with the legal-subject identity invariant. PostgreSQL
-- permits multiple NULL values, so subjects without a known identity remain valid.
BEGIN;

DROP INDEX "ExternalParty_subjectType_identityNumber_idx";

CREATE UNIQUE INDEX "ExternalParty_subjectType_identityNumber_key"
ON "ExternalParty"("subjectType", "identityNumber");

COMMIT;
