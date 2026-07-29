-- workspace:migration-mode=maintenance
-- Add the governed company-period asset impairment assessment and its audit references.

-- CreateTable
CREATE TABLE "FinanceAssetImpairmentAssessment" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    "conclusion" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "evidenceRef" TEXT NOT NULL,
    "impairmentAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "voucherId" INTEGER,
    "assetScopeFingerprint" TEXT NOT NULL,
    "calculationBasisFingerprint" TEXT NOT NULL,
    "assetCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "assessedBy" INTEGER NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAssetImpairmentAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAssetImpairmentAssessment_companyCode_periodId_key"
ON "FinanceAssetImpairmentAssessment"("companyCode", "periodId");

-- CreateIndex
CREATE INDEX "FinanceAssetImpairmentAssessment_periodId_status_idx"
ON "FinanceAssetImpairmentAssessment"("periodId", "status");

-- CreateIndex
CREATE INDEX "FinanceAssetImpairmentAssessment_voucherId_idx"
ON "FinanceAssetImpairmentAssessment"("voucherId");

-- AddForeignKey
ALTER TABLE "FinanceAssetImpairmentAssessment"
ADD CONSTRAINT "FinanceAssetImpairmentAssessment_periodId_fkey"
FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssetImpairmentAssessment"
ADD CONSTRAINT "FinanceAssetImpairmentAssessment_voucherId_fkey"
FOREIGN KEY ("voucherId") REFERENCES "FinanceVoucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssetImpairmentAssessment"
ADD CONSTRAINT "FinanceAssetImpairmentAssessment_assessedBy_fkey"
FOREIGN KEY ("assessedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
