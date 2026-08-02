-- workspace:migration-mode=maintenance
-- Correct the over-escaped ISO date regexes introduced with legacy asset cutover.

ALTER TABLE "FinanceAssetCard"
DROP CONSTRAINT "FinanceAssetCard_opening_carry_forward_check";

ALTER TABLE "FinanceAssetCard"
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
      AND "cutoverDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
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

ALTER TABLE "FinanceAssetImportBatch"
DROP CONSTRAINT "FinanceAssetImportBatch_cutover_reconciliation_check";

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
    AND "cutoverDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND "cutoverPeriodId" IS NOT NULL
    AND "ledgerReconciliationFingerprint" ~ '^[a-f0-9]{64}$'
    AND "ledgerNetBookValue" IS NOT NULL
    AND "importedNetBookValue" IS NOT NULL
    AND "unallocatedNetBookValue" IS NOT NULL
  )
);
