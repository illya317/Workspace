CREATE TABLE "FinanceCurrencyCatalog" (
  "id" SERIAL NOT NULL,
  "code" VARCHAR(3) NOT NULL,
  "name" TEXT NOT NULL,
  "symbol" TEXT,
  "decimalDigits" INTEGER NOT NULL DEFAULT 2,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceCurrencyCatalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceCurrencyCatalog_code_key" ON "FinanceCurrencyCatalog" ("code");

INSERT INTO "FinanceCurrencyCatalog" ("code", "name", "symbol", "decimalDigits") VALUES
  ('CNY', '人民币', '¥', 2),
  ('USD', '美元', '$', 2),
  ('CAD', '加元', 'C$', 2),
  ('HKD', '港币', 'HK$', 2),
  ('EUR', '欧元', '€', 2),
  ('JPY', '日元', '¥', 0),
  ('AUD', '澳元', 'A$', 2),
  ('CHF', '瑞士法郎', 'CHF', 2);

ALTER TABLE "Company"
ADD COLUMN "isConsolidationParent" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Company"
SET "isConsolidationParent" = true
WHERE "id" = (
  SELECT "parentCompanyId"
  FROM "FinanceConsolidationBatch"
  ORDER BY "updatedAt" DESC, "id" DESC
  LIMIT 1
);

CREATE UNIQUE INDEX "Company_single_consolidation_parent_key"
ON "Company" ("isConsolidationParent")
WHERE "isConsolidationParent" = true;

ALTER TABLE "FinanceCompanyCurrencyPolicy" ADD COLUMN "currencyId" INTEGER;

INSERT INTO "FinanceCurrencyCatalog" ("code", "name", "decimalDigits")
SELECT DISTINCT UPPER("functionalCurrency"), UPPER("functionalCurrency"), 2
FROM "FinanceCompanyCurrencyPolicy"
WHERE UPPER("functionalCurrency") ~ '^[A-Z]{3}$'
ON CONFLICT ("code") DO NOTHING;

UPDATE "FinanceCompanyCurrencyPolicy" AS policy
SET "currencyId" = currency."id"
FROM "FinanceCurrencyCatalog" AS currency
WHERE currency."code" = UPPER(policy."functionalCurrency");

ALTER TABLE "FinanceCompanyCurrencyPolicy" ALTER COLUMN "currencyId" SET NOT NULL;
ALTER TABLE "FinanceCompanyCurrencyPolicy" DROP COLUMN "functionalCurrency";
CREATE INDEX "FinanceCompanyCurrencyPolicy_currencyId_idx" ON "FinanceCompanyCurrencyPolicy" ("currencyId");
ALTER TABLE "FinanceCompanyCurrencyPolicy"
ADD CONSTRAINT "FinanceCompanyCurrencyPolicy_currencyId_fkey"
FOREIGN KEY ("currencyId") REFERENCES "FinanceCurrencyCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "FinanceCompanyCurrencyPolicy" (
  "companyId", "currencyId", "source", "evidence", "createdAt", "updatedAt"
)
SELECT company."id", currency."id", 'companyGovernanceMigration', '既有内部公司默认人民币本位币，后续由公司信息维护', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Company" AS company
CROSS JOIN "FinanceCurrencyCatalog" AS currency
WHERE currency."code" = 'CNY'
  AND NOT EXISTS (
    SELECT 1 FROM "FinanceCompanyCurrencyPolicy" AS policy WHERE policy."companyId" = company."id"
  );

ALTER TABLE "FinanceGroupAccount" ADD COLUMN "currencyId" INTEGER;
ALTER TABLE "FinanceGroupAccountRevision" ADD COLUMN "currencyId" INTEGER;

UPDATE "FinanceGroupAccount" AS account
SET "currencyId" = currency."id"
FROM "FinanceCurrencyCatalog" AS currency
WHERE currency."code" = CASE account."currency"
  WHEN '人民币' THEN 'CNY' WHEN 'CNY' THEN 'CNY'
  WHEN '美元' THEN 'USD' WHEN 'USD' THEN 'USD'
  WHEN '加元' THEN 'CAD' WHEN 'CAD' THEN 'CAD'
  WHEN '港币' THEN 'HKD' WHEN 'HKD' THEN 'HKD'
  WHEN '欧元' THEN 'EUR' WHEN 'EUR' THEN 'EUR'
  WHEN '日元' THEN 'JPY' WHEN 'JPY' THEN 'JPY'
  WHEN '澳元' THEN 'AUD' WHEN 'AUD' THEN 'AUD'
  WHEN '瑞士法郎' THEN 'CHF' WHEN 'CHF' THEN 'CHF'
  ELSE NULL END;

UPDATE "FinanceGroupAccount"
SET "currencyId" = (SELECT "id" FROM "FinanceCurrencyCatalog" WHERE "code" = 'CNY')
WHERE "currencyId" IS NULL AND "currency" IS NULL;

UPDATE "FinanceGroupAccountRevision" AS revision
SET "currencyId" = currency."id"
FROM "FinanceCurrencyCatalog" AS currency
WHERE currency."code" = CASE revision."currency"
  WHEN '人民币' THEN 'CNY' WHEN 'CNY' THEN 'CNY'
  WHEN '美元' THEN 'USD' WHEN 'USD' THEN 'USD'
  WHEN '加元' THEN 'CAD' WHEN 'CAD' THEN 'CAD'
  WHEN '港币' THEN 'HKD' WHEN 'HKD' THEN 'HKD'
  WHEN '欧元' THEN 'EUR' WHEN 'EUR' THEN 'EUR'
  WHEN '日元' THEN 'JPY' WHEN 'JPY' THEN 'JPY'
  WHEN '澳元' THEN 'AUD' WHEN 'AUD' THEN 'AUD'
  WHEN '瑞士法郎' THEN 'CHF' WHEN 'CHF' THEN 'CHF'
  ELSE NULL END;

UPDATE "FinanceGroupAccountRevision"
SET "currencyId" = (SELECT "id" FROM "FinanceCurrencyCatalog" WHERE "code" = 'CNY')
WHERE "currencyId" IS NULL AND "currency" IS NULL;

ALTER TABLE "FinanceGroupAccount" ALTER COLUMN "currencyId" SET NOT NULL;
ALTER TABLE "FinanceGroupAccountRevision" ALTER COLUMN "currencyId" SET NOT NULL;
ALTER TABLE "FinanceGroupAccount" DROP COLUMN "currency";
ALTER TABLE "FinanceGroupAccountRevision" DROP COLUMN "currency";
CREATE INDEX "FinanceGroupAccount_currencyId_idx" ON "FinanceGroupAccount" ("currencyId");
CREATE INDEX "FinanceGroupAccountRevision_currency_idx" ON "FinanceGroupAccountRevision" ("currencyId");
ALTER TABLE "FinanceGroupAccount"
ADD CONSTRAINT "FinanceGroupAccount_currencyId_fkey"
FOREIGN KEY ("currencyId") REFERENCES "FinanceCurrencyCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceGroupAccountRevision"
ADD CONSTRAINT "FinanceGroupAccountRevision_currencyId_fkey"
FOREIGN KEY ("currencyId") REFERENCES "FinanceCurrencyCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
