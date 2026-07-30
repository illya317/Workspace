ALTER TABLE "FinanceTaxRegistration"
  ADD COLUMN "authorityName" TEXT;

UPDATE "FinanceTaxRegistration" AS registration
SET "authorityName" = party."name"
FROM "Party" AS party
WHERE registration."authorityPartyId" = party."id";

ALTER TABLE "FinanceTaxRegistration"
  DROP CONSTRAINT "FinanceTaxRegistration_authorityPartyId_fkey";

DROP INDEX "FinanceTaxRegistration_authorityPartyId_idx";

ALTER TABLE "FinanceTaxRegistration"
  DROP COLUMN "authorityPartyId";
