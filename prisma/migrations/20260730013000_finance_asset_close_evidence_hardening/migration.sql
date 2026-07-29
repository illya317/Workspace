-- workspace:migration-mode=maintenance
-- Harden asset close evidence without mutating existing manual policy rows.

ALTER TABLE "FinanceAssetCategoryPolicy"
ADD COLUMN "impairmentLossAccountId" INTEGER,
ADD COLUMN "impairmentAllowanceAccountId" INTEGER,
ADD COLUMN "disposalGainLossAccountId" INTEGER;

CREATE INDEX "FinanceAssetCategoryPolicy_impairmentLossAccountId_idx" ON "FinanceAssetCategoryPolicy"("impairmentLossAccountId");
CREATE INDEX "FinanceAssetCategoryPolicy_impairmentAllowanceAccountId_idx" ON "FinanceAssetCategoryPolicy"("impairmentAllowanceAccountId");
CREATE INDEX "FinanceAssetCategoryPolicy_disposalGainLossAccountId_idx" ON "FinanceAssetCategoryPolicy"("disposalGainLossAccountId");

ALTER TABLE "FinanceAssetCategoryPolicy" ADD CONSTRAINT "FinanceAssetCategoryPolicy_impairmentLossAccountId_fkey"
FOREIGN KEY ("impairmentLossAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAssetCategoryPolicy" ADD CONSTRAINT "FinanceAssetCategoryPolicy_impairmentAllowanceAccountId_fkey"
FOREIGN KEY ("impairmentAllowanceAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAssetCategoryPolicy" ADD CONSTRAINT "FinanceAssetCategoryPolicy_disposalGainLossAccountId_fkey"
FOREIGN KEY ("disposalGainLossAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FinanceAssetAcquisitionEvidence" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "companyId" INTEGER,
    "periodId" INTEGER NOT NULL,
    "assetId" INTEGER NOT NULL,
    "voucherItemId" INTEGER,
    "importBatchId" INTEGER,
    "sourceChecksum" TEXT,
    "amount" DECIMAL(20,2) NOT NULL,
    "evidenceRef" TEXT NOT NULL,
    "confirmedBy" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAssetAcquisitionEvidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FinanceAssetAcquisitionEvidence_source_check" CHECK (
      (("voucherItemId" IS NOT NULL)::integer + ("importBatchId" IS NOT NULL)::integer) = 1
      AND (("importBatchId" IS NULL AND "sourceChecksum" IS NULL) OR ("importBatchId" IS NOT NULL AND "sourceChecksum" IS NOT NULL))
    )
);

CREATE UNIQUE INDEX "FinanceAssetAcquisitionEvidence_assetId_key" ON "FinanceAssetAcquisitionEvidence"("assetId");
CREATE UNIQUE INDEX "FinanceAssetAcquisitionEvidence_companyCode_periodId_assetId_key" ON "FinanceAssetAcquisitionEvidence"("companyCode", "periodId", "assetId");
CREATE UNIQUE INDEX "FinanceAssetAcquisitionEvidence_voucherItemId_key" ON "FinanceAssetAcquisitionEvidence"("voucherItemId");
CREATE INDEX "FinanceAssetAcquisitionEvidence_periodId_idx" ON "FinanceAssetAcquisitionEvidence"("periodId");
CREATE INDEX "FinanceAssetAcquisitionEvidence_importBatchId_idx" ON "FinanceAssetAcquisitionEvidence"("importBatchId");
CREATE INDEX "FinanceAssetAcquisitionEvidence_confirmedBy_idx" ON "FinanceAssetAcquisitionEvidence"("confirmedBy");
CREATE INDEX "FinanceAssetAcquisitionEvidence_companyId_idx" ON "FinanceAssetAcquisitionEvidence"("companyId");

ALTER TABLE "FinanceAssetAcquisitionEvidence" ADD CONSTRAINT "FinanceAssetAcquisitionEvidence_periodId_fkey"
FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAssetAcquisitionEvidence" ADD CONSTRAINT "FinanceAssetAcquisitionEvidence_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "FinanceAssetCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAssetAcquisitionEvidence" ADD CONSTRAINT "FinanceAssetAcquisitionEvidence_voucherItemId_fkey"
FOREIGN KEY ("voucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAssetAcquisitionEvidence" ADD CONSTRAINT "FinanceAssetAcquisitionEvidence_importBatchId_fkey"
FOREIGN KEY ("importBatchId") REFERENCES "FinanceAssetImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAssetAcquisitionEvidence" ADD CONSTRAINT "FinanceAssetAcquisitionEvidence_confirmedBy_fkey"
FOREIGN KEY ("confirmedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAssetAcquisitionEvidence" ADD CONSTRAINT "FinanceAssetAcquisitionEvidence_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceAssetDisposal"
ADD COLUMN "assetVoucherItemId" INTEGER,
ADD COLUMN "accumulatedVoucherItemId" INTEGER,
ADD COLUMN "impairmentAllowanceVoucherItemId" INTEGER,
ADD COLUMN "proceedsVoucherItemId" INTEGER,
ADD COLUMN "gainLossVoucherItemId" INTEGER;

CREATE INDEX "FinanceAssetDisposal_assetVoucherItemId_idx" ON "FinanceAssetDisposal"("assetVoucherItemId");
CREATE INDEX "FinanceAssetDisposal_accumulatedVoucherItemId_idx" ON "FinanceAssetDisposal"("accumulatedVoucherItemId");
CREATE INDEX "FinanceAssetDisposal_impairmentAllowanceVoucherItemId_idx" ON "FinanceAssetDisposal"("impairmentAllowanceVoucherItemId");
CREATE INDEX "FinanceAssetDisposal_proceedsVoucherItemId_idx" ON "FinanceAssetDisposal"("proceedsVoucherItemId");
CREATE INDEX "FinanceAssetDisposal_gainLossVoucherItemId_idx" ON "FinanceAssetDisposal"("gainLossVoucherItemId");

ALTER TABLE "FinanceAssetDisposal" ADD CONSTRAINT "FinanceAssetDisposal_assetVoucherItemId_fkey" FOREIGN KEY ("assetVoucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAssetDisposal" ADD CONSTRAINT "FinanceAssetDisposal_accumulatedVoucherItemId_fkey" FOREIGN KEY ("accumulatedVoucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAssetDisposal" ADD CONSTRAINT "FinanceAssetDisposal_impairmentAllowanceVoucherItemId_fkey" FOREIGN KEY ("impairmentAllowanceVoucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAssetDisposal" ADD CONSTRAINT "FinanceAssetDisposal_proceedsVoucherItemId_fkey" FOREIGN KEY ("proceedsVoucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAssetDisposal" ADD CONSTRAINT "FinanceAssetDisposal_gainLossVoucherItemId_fkey" FOREIGN KEY ("gainLossVoucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
