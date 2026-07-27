-- Consolidated statements have one posting interface: visible group journal vouchers.
-- Historical bridge, fixed-CNY, and rounding results must be migrated to
-- FinanceConsolidationEntry before they can affect an output.
DROP TABLE "FinanceConsolidationAdjustmentResultLine";
DROP TABLE "FinanceConsolidationAdjustmentResult";
