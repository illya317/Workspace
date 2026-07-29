-- workspace:migration-mode=maintenance
-- Add impairment allocation detail and governed asset disposal facts.

-- CreateTable
CREATE TABLE "FinanceAssetImpairmentAllocation" (
    "id" SERIAL NOT NULL,
    "assessmentId" INTEGER NOT NULL,
    "assetId" INTEGER NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAssetImpairmentAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceAssetImpairmentAllocation_assessmentId_assetId_key"
ON "FinanceAssetImpairmentAllocation"("assessmentId", "assetId");
CREATE INDEX "FinanceAssetImpairmentAllocation_assetId_idx"
ON "FinanceAssetImpairmentAllocation"("assetId");

ALTER TABLE "FinanceAssetImpairmentAllocation" ADD CONSTRAINT "FinanceAssetImpairmentAllocation_assessmentId_fkey"
FOREIGN KEY ("assessmentId") REFERENCES "FinanceAssetImpairmentAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceAssetImpairmentAllocation" ADD CONSTRAINT "FinanceAssetImpairmentAllocation_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "FinanceAssetCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "FinanceAssetDisposal" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    "assetId" INTEGER NOT NULL,
    "disposalDate" TEXT NOT NULL,
    "disposalType" TEXT NOT NULL,
    "proceedsAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "evidenceRef" TEXT NOT NULL,
    "voucherId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "confirmedBy" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAssetDisposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceAssetDisposal_assetId_key" ON "FinanceAssetDisposal"("assetId");
CREATE UNIQUE INDEX "FinanceAssetDisposal_companyCode_periodId_assetId_key" ON "FinanceAssetDisposal"("companyCode", "periodId", "assetId");
CREATE INDEX "FinanceAssetDisposal_periodId_status_idx" ON "FinanceAssetDisposal"("periodId", "status");
CREATE INDEX "FinanceAssetDisposal_voucherId_idx" ON "FinanceAssetDisposal"("voucherId");
CREATE INDEX "FinanceAssetDisposal_confirmedBy_idx" ON "FinanceAssetDisposal"("confirmedBy");

ALTER TABLE "FinanceAssetDisposal" ADD CONSTRAINT "FinanceAssetDisposal_periodId_fkey"
FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAssetDisposal" ADD CONSTRAINT "FinanceAssetDisposal_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "FinanceAssetCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAssetDisposal" ADD CONSTRAINT "FinanceAssetDisposal_voucherId_fkey"
FOREIGN KEY ("voucherId") REFERENCES "FinanceVoucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAssetDisposal" ADD CONSTRAINT "FinanceAssetDisposal_confirmedBy_fkey"
FOREIGN KEY ("confirmedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
