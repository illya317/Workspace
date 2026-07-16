-- workspace:migration-mode=maintenance
BEGIN;

ALTER TABLE "FinanceStatementExchangeRate"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

DROP INDEX "FinanceStatementExchangeRate_currency_kind_date_key";

CREATE UNIQUE INDEX "FinanceStatementExchangeRate_currency_kind_date_version_key"
ON "FinanceStatementExchangeRate"("baseCurrency", "quoteCurrency", "rateKind", "rateDate", "version");

COMMIT;
