DROP INDEX IF EXISTS "FinanceStatementExchangeRate_status_idx";

ALTER TABLE "FinanceStatementExchangeRate"
  DROP COLUMN "status",
  DROP COLUMN "verifiedBy",
  DROP COLUMN "verifiedAt";

ALTER TABLE "FinanceConsolidationRateSnapshot"
  RENAME COLUMN "verifiedBy" TO "recordedBy";

ALTER TABLE "FinanceConsolidationRateSnapshot"
  RENAME COLUMN "verifiedAt" TO "recordedAt";
