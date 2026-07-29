-- workspace:migration-mode=maintenance
-- Forward-only repair for schema changes that were mistakenly edited into already-applied migrations.

ALTER TABLE "FinanceAssetImpairmentAssessment"
ADD COLUMN "calculationBasisFingerprint" TEXT NOT NULL;

DROP INDEX IF EXISTS "FinanceAssetDisposal_assetVoucherItemId_idx";
DROP INDEX IF EXISTS "FinanceAssetDisposal_accumulatedVoucherItemId_idx";
DROP INDEX IF EXISTS "FinanceAssetDisposal_impairmentAllowanceVoucherItemId_idx";
DROP INDEX IF EXISTS "FinanceAssetDisposal_proceedsVoucherItemId_idx";
DROP INDEX IF EXISTS "FinanceAssetDisposal_gainLossVoucherItemId_idx";

CREATE UNIQUE INDEX "FinanceAssetDisposal_assetVoucherItemId_key"
ON "FinanceAssetDisposal"("assetVoucherItemId");
CREATE UNIQUE INDEX "FinanceAssetDisposal_accumulatedVoucherItemId_key"
ON "FinanceAssetDisposal"("accumulatedVoucherItemId");
CREATE UNIQUE INDEX "FinanceAssetDisposal_impairmentAllowanceVoucherItemId_key"
ON "FinanceAssetDisposal"("impairmentAllowanceVoucherItemId");
CREATE UNIQUE INDEX "FinanceAssetDisposal_proceedsVoucherItemId_key"
ON "FinanceAssetDisposal"("proceedsVoucherItemId");
CREATE UNIQUE INDEX "FinanceAssetDisposal_gainLossVoucherItemId_key"
ON "FinanceAssetDisposal"("gainLossVoucherItemId");

DROP INDEX IF EXISTS "idx_active_budget_version";
CREATE UNIQUE INDEX "idx_active_budget_version"
ON "FinanceBudgetVersion"("year", COALESCE("companyCode", ''))
WHERE "status" = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS "FinanceBudgetVersion_active_companyId_key"
ON "FinanceBudgetVersion"("year", "companyId")
WHERE "status" = 'active' AND "companyId" IS NOT NULL;
