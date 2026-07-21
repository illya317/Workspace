-- workspace:migration-mode=maintenance

ALTER TABLE "FinanceStatementExchangeRate"
  ALTER COLUMN "sourceName" SET DEFAULT '中国外汇交易中心',
  ALTER COLUMN "sourceField" SET DEFAULT '人民币汇率中间价';

CREATE UNIQUE INDEX "FinanceStatementExchangeRate_central_parity_currency_date_key"
  ON "FinanceStatementExchangeRate"("baseCurrency", "quoteCurrency", "rateDate")
  WHERE "rateKind" = 'centralParity';
