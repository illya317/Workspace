-- workspace:migration-mode=maintenance
-- Remove target-workpaper statement overrides. Standalone statements must be
-- derived from governed ledger, balance and cash-flow allocation facts.
DROP TABLE "FinanceCashFlowAllocationAdjustment";
DROP TABLE "FinanceStatementVoucherExclusion";
