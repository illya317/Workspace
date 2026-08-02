-- workspace:migration-mode=maintenance
-- Add an explicit, forward-only asset opening carry-forward contract.

ALTER TABLE "FinanceAssetCard"
ADD COLUMN "initializationMode" TEXT NOT NULL DEFAULT 'standard',
ADD COLUMN "openingImpairmentAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
ADD COLUMN "openingNetBookValue" DECIMAL(20,2),
ADD COLUMN "cutoverDate" TEXT,
ADD COLUMN "remainingUsefulLifeMonthsAtCutover" INTEGER,
ADD COLUMN "cutoverResidualValue" DECIMAL(20,2),
ADD COLUMN "cutoverAllocationStatus" TEXT,
ADD COLUMN "cutoverReconciliationFingerprint" TEXT,
ADD COLUMN "cutoverPeriodId" INTEGER,
ADD COLUMN "cutoverAssetBalanceId" INTEGER,
ADD COLUMN "cutoverAccumulatedBalanceId" INTEGER,
ADD COLUMN "cutoverImpairmentBalanceId" INTEGER;

ALTER TABLE "FinanceAssetCard"
ADD CONSTRAINT "FinanceAssetCard_initialization_mode_check" CHECK (
  "initializationMode" IN ('standard', 'legacy_cutover')
),
ADD CONSTRAINT "FinanceAssetCard_opening_carry_forward_check" CHECK (
  "openingAccumulatedAmount" >= 0
  AND "openingImpairmentAmount" >= 0
  AND (
    (
      "initializationMode" = 'standard'
      AND "openingImpairmentAmount" = 0
      AND "openingNetBookValue" IS NULL
      AND "cutoverDate" IS NULL
      AND "remainingUsefulLifeMonthsAtCutover" IS NULL
      AND "cutoverResidualValue" IS NULL
      AND "cutoverAllocationStatus" IS NULL
      AND "cutoverReconciliationFingerprint" IS NULL
      AND "cutoverPeriodId" IS NULL
      AND "cutoverAssetBalanceId" IS NULL
      AND "cutoverAccumulatedBalanceId" IS NULL
      AND "cutoverImpairmentBalanceId" IS NULL
    )
    OR
    (
      "initializationMode" = 'legacy_cutover'
      AND "openingNetBookValue" IS NOT NULL
      AND "cutoverDate" ~ '^\\d{4}-\\d{2}-\\d{2}$'
      AND "openingAsOfDate" = "cutoverDate"
      AND "remainingUsefulLifeMonthsAtCutover" IS NOT NULL
      AND "remainingUsefulLifeMonthsAtCutover" >= 0
      AND "cutoverResidualValue" IS NOT NULL
      AND "cutoverAllocationStatus" IN ('allocated', 'pending')
      AND "cutoverResidualValue" >= 0
      AND "cutoverResidualValue" <= "openingNetBookValue"
      AND "originalCost" - "openingAccumulatedAmount" - "openingImpairmentAmount" = "openingNetBookValue"
      AND "cutoverReconciliationFingerprint" ~ '^[a-f0-9]{64}$'
      AND "cutoverPeriodId" IS NOT NULL
      AND "cutoverAssetBalanceId" IS NOT NULL
      AND (("accumulatedAccountId" IS NULL AND "cutoverAccumulatedBalanceId" IS NULL) OR ("accumulatedAccountId" IS NOT NULL AND "cutoverAccumulatedBalanceId" IS NOT NULL))
    )
  )
);

CREATE INDEX "FinanceAssetCard_cutoverPeriodId_idx" ON "FinanceAssetCard"("cutoverPeriodId");
CREATE INDEX "FinanceAssetCard_cutoverAssetBalanceId_idx" ON "FinanceAssetCard"("cutoverAssetBalanceId");
CREATE INDEX "FinanceAssetCard_cutoverAccumulatedBalanceId_idx" ON "FinanceAssetCard"("cutoverAccumulatedBalanceId");
CREATE INDEX "FinanceAssetCard_cutoverImpairmentBalanceId_idx" ON "FinanceAssetCard"("cutoverImpairmentBalanceId");

ALTER TABLE "FinanceAssetCard" ADD CONSTRAINT "FinanceAssetCard_cutoverPeriodId_fkey"
FOREIGN KEY ("cutoverPeriodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAssetCard" ADD CONSTRAINT "FinanceAssetCard_cutoverAssetBalanceId_fkey"
FOREIGN KEY ("cutoverAssetBalanceId") REFERENCES "FinanceAccountBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAssetCard" ADD CONSTRAINT "FinanceAssetCard_cutoverAccumulatedBalanceId_fkey"
FOREIGN KEY ("cutoverAccumulatedBalanceId") REFERENCES "FinanceAccountBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAssetCard" ADD CONSTRAINT "FinanceAssetCard_cutoverImpairmentBalanceId_fkey"
FOREIGN KEY ("cutoverImpairmentBalanceId") REFERENCES "FinanceAccountBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceAssetImportBatch"
ADD COLUMN "cutoverDate" TEXT,
ADD COLUMN "cutoverPeriodId" INTEGER,
ADD COLUMN "ledgerReconciliationFingerprint" TEXT,
ADD COLUMN "ledgerNetBookValue" DECIMAL(20,2),
ADD COLUMN "importedNetBookValue" DECIMAL(20,2),
ADD COLUMN "unallocatedNetBookValue" DECIMAL(20,2),
ADD COLUMN "reconciliationStatus" TEXT;

ALTER TABLE "FinanceAssetImportBatch"
ADD CONSTRAINT "FinanceAssetImportBatch_cutover_reconciliation_check" CHECK (
  (
    "reconciliationStatus" IS NULL
    AND "cutoverDate" IS NULL
    AND "cutoverPeriodId" IS NULL
    AND "ledgerReconciliationFingerprint" IS NULL
    AND "ledgerNetBookValue" IS NULL
    AND "importedNetBookValue" IS NULL
    AND "unallocatedNetBookValue" IS NULL
  )
  OR
  (
    "reconciliationStatus" IN ('matched', 'rounding_allocated', 'ledger_control_adjusted', 'pending_allocation')
    AND "cutoverDate" ~ '^\\d{4}-\\d{2}-\\d{2}$'
    AND "cutoverPeriodId" IS NOT NULL
    AND "ledgerReconciliationFingerprint" ~ '^[a-f0-9]{64}$'
    AND "ledgerNetBookValue" IS NOT NULL
    AND "importedNetBookValue" IS NOT NULL
    AND "unallocatedNetBookValue" IS NOT NULL
  )
);

CREATE INDEX "FinanceAssetImportBatch_cutoverPeriodId_idx" ON "FinanceAssetImportBatch"("cutoverPeriodId");
ALTER TABLE "FinanceAssetImportBatch" ADD CONSTRAINT "FinanceAssetImportBatch_cutoverPeriodId_fkey"
FOREIGN KEY ("cutoverPeriodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
