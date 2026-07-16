-- workspace:migration-mode=expand
BEGIN;

CREATE TABLE "FinanceStatementExchangeRate" (
  "id" SERIAL NOT NULL,
  "baseCurrency" TEXT NOT NULL,
  "quoteCurrency" TEXT NOT NULL,
  "rateKind" TEXT NOT NULL,
  "rateDate" TEXT NOT NULL,
  "rate" DECIMAL(20,8) NOT NULL,
  "sourceName" TEXT NOT NULL DEFAULT '中国银行外汇牌价',
  "sourceField" TEXT NOT NULL DEFAULT '中行折算价',
  "sourceUrl" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "note" TEXT,
  "updatedBy" INTEGER,
  "verifiedBy" INTEGER,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinanceStatementExchangeRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceStatementExchangeRate_currency_kind_date_key"
ON "FinanceStatementExchangeRate"("baseCurrency", "quoteCurrency", "rateKind", "rateDate");

CREATE INDEX "FinanceStatementExchangeRate_currency_date_idx"
ON "FinanceStatementExchangeRate"("baseCurrency", "quoteCurrency", "rateDate");

CREATE INDEX "FinanceStatementExchangeRate_status_idx"
ON "FinanceStatementExchangeRate"("status");

COMMIT;
