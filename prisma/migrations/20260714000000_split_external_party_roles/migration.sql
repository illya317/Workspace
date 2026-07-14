BEGIN;

-- CreateTable
CREATE TABLE "ExternalPartyRole" (
    "id" SERIAL NOT NULL,
    "partyId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "classification" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "address" TEXT,
    "invoiceTitle" TEXT,
    "invoiceAddressPhone" TEXT,
    "settlementTerms" TEXT,
    "creditLimit" DOUBLE PRECISION,
    "creditDays" INTEGER,
    "taxRate" DOUBLE PRECISION,
    "remark" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalPartyRole_pkey" PRIMARY KEY ("id")
);

-- Copy every legacy customer/supplier row into its role record before removing
-- role-specific columns from the legal subject table.
INSERT INTO "ExternalPartyRole" (
    "partyId", "category", "code", "classification", "contactPerson", "phone",
    "email", "bankName", "bankAccount", "address", "invoiceTitle",
    "invoiceAddressPhone", "settlementTerms", "creditLimit", "creditDays",
    "taxRate", "remark", "isActive", "createdAt", "updatedAt"
)
SELECT
    "id", "category", "code", "classification", "contactPerson", "phone",
    "email", "bankName", "bankAccount", "address", "invoiceTitle",
    "invoiceAddressPhone", "settlementTerms", "creditLimit", "creditDays",
    "taxRate", "remark", "isActive", "createdAt", "updatedAt"
FROM "ExternalParty";

DO $$
BEGIN
  IF (SELECT count(*) FROM "ExternalPartyRole") <> (SELECT count(*) FROM "ExternalParty") THEN
    RAISE EXCEPTION 'ExternalParty role backfill count mismatch';
  END IF;
END $$;

-- Normalize stable identity keys, but never merge subjects automatically:
-- common names, relationship attributes and edit history can differ and need
-- explicit business review before one legacy row is discarded.
UPDATE "ExternalParty"
SET "identityNumber" = CASE
  WHEN nullif(trim("identityNumber"), '') IS NULL THEN NULL
  ELSE upper(trim("identityNumber"))
END
WHERE "identityNumber" IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ExternalParty"
    WHERE "identityNumber" IS NOT NULL
    GROUP BY "subjectType", "identityNumber"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'ExternalParty contains duplicate normalized identities; review and merge them before this migration';
  END IF;
END $$;

-- Drop legacy role constraints and indexes before removing their columns.
DROP INDEX "ExternalParty_category_code_key";
DROP INDEX "ExternalParty_category_name_idx";
DROP INDEX "ExternalParty_category_isActive_idx";
DROP INDEX "ExternalParty_category_subjectType_idx";
DROP INDEX "ExternalParty_category_classification_idx";
DROP INDEX "ExternalParty_category_relatedPartyType_idx";

ALTER TABLE "ExternalParty" DROP CONSTRAINT "ExternalParty_category_check";
ALTER TABLE "ExternalParty" DROP CONSTRAINT "ExternalParty_creditDays_check";
ALTER TABLE "ExternalParty" DROP CONSTRAINT "ExternalParty_taxRate_check";

-- AlterTable
ALTER TABLE "ExternalParty"
DROP COLUMN "category",
DROP COLUMN "code",
DROP COLUMN "classification",
DROP COLUMN "contactPerson",
DROP COLUMN "phone",
DROP COLUMN "email",
DROP COLUMN "bankName",
DROP COLUMN "bankAccount",
DROP COLUMN "address",
DROP COLUMN "invoiceTitle",
DROP COLUMN "invoiceAddressPhone",
DROP COLUMN "settlementTerms",
DROP COLUMN "creditLimit",
DROP COLUMN "creditDays",
DROP COLUMN "taxRate",
DROP COLUMN "remark",
DROP COLUMN "isActive";

-- CheckConstraint
ALTER TABLE "ExternalPartyRole"
ADD CONSTRAINT "ExternalPartyRole_category_check"
CHECK ("category" IN ('customer', 'supplier'));

ALTER TABLE "ExternalPartyRole"
ADD CONSTRAINT "ExternalPartyRole_creditDays_check"
CHECK ("creditDays" IS NULL OR "creditDays" BETWEEN 0 AND 3650);

ALTER TABLE "ExternalPartyRole"
ADD CONSTRAINT "ExternalPartyRole_creditLimit_check"
CHECK ("creditLimit" IS NULL OR "creditLimit" >= 0);

ALTER TABLE "ExternalPartyRole"
ADD CONSTRAINT "ExternalPartyRole_taxRate_check"
CHECK ("taxRate" IS NULL OR "taxRate" BETWEEN 0 AND 100);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalPartyRole_partyId_category_key"
ON "ExternalPartyRole"("partyId", "category");

CREATE UNIQUE INDEX "ExternalPartyRole_category_code_key"
ON "ExternalPartyRole"("category", "code");

CREATE INDEX "ExternalPartyRole_category_isActive_idx"
ON "ExternalPartyRole"("category", "isActive");

CREATE INDEX "ExternalPartyRole_category_classification_idx"
ON "ExternalPartyRole"("category", "classification");

CREATE INDEX "ExternalParty_name_idx" ON "ExternalParty"("name");
CREATE INDEX "ExternalParty_subjectType_identityNumber_idx"
ON "ExternalParty"("subjectType", "identityNumber");
CREATE INDEX "ExternalParty_relatedPartyType_idx"
ON "ExternalParty"("relatedPartyType");

-- AddForeignKey
ALTER TABLE "ExternalPartyRole"
ADD CONSTRAINT "ExternalPartyRole_partyId_fkey"
FOREIGN KEY ("partyId") REFERENCES "ExternalParty"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
