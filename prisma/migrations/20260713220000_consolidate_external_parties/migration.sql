-- AlterTable
ALTER TABLE "ExternalParty"
ADD COLUMN "subjectType" TEXT NOT NULL DEFAULT 'organization',
ADD COLUMN "classification" TEXT,
ADD COLUMN "invoiceTitle" TEXT,
ADD COLUMN "invoiceAddressPhone" TEXT,
ADD COLUMN "settlementTerms" TEXT,
ADD COLUMN "creditLimit" DOUBLE PRECISION,
ADD COLUMN "creditDays" INTEGER,
ADD COLUMN "taxRate" DOUBLE PRECISION;

-- Standalone personal counterparties cannot be assigned safely to a customer or
-- supplier role automatically. Stop instead of silently moving business data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ExternalParty" WHERE "category" NOT IN ('customer', 'supplier')) THEN
    RAISE EXCEPTION 'ExternalParty contains a standalone category; classify it as customer or supplier before applying this migration';
  END IF;
END $$;

-- CheckConstraint
ALTER TABLE "ExternalParty"
ADD CONSTRAINT "ExternalParty_category_check"
CHECK ("category" IN ('customer', 'supplier'));

ALTER TABLE "ExternalParty"
ADD CONSTRAINT "ExternalParty_subjectType_check"
CHECK ("subjectType" IN ('organization', 'individual'));

ALTER TABLE "ExternalParty"
ADD CONSTRAINT "ExternalParty_creditDays_check"
CHECK ("creditDays" IS NULL OR "creditDays" BETWEEN 0 AND 3650);

ALTER TABLE "ExternalParty"
ADD CONSTRAINT "ExternalParty_taxRate_check"
CHECK ("taxRate" IS NULL OR "taxRate" BETWEEN 0 AND 100);

-- CreateIndex
CREATE INDEX "ExternalParty_category_subjectType_idx" ON "ExternalParty"("category", "subjectType");

-- CreateIndex
CREATE INDEX "ExternalParty_category_classification_idx" ON "ExternalParty"("category", "classification");
