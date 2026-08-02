-- workspace:migration-mode=maintenance
-- Make asset category policies explicit by company and fiscal year, bind every
-- configured account to a real FinanceAccount FK, and persist editable policy rules.

ALTER TABLE "FinanceAssetCategoryPolicy"
    ADD COLUMN "year" INTEGER,
    ADD COLUMN "assetAccountId" INTEGER,
    ADD COLUMN "accumulatedAccountId" INTEGER,
    ADD COLUMN "expenseAccountId" INTEGER,
    ADD COLUMN "defaultUsefulLifeMonths" INTEGER,
    ADD COLUMN "defaultResidualRate" DECIMAL(10,6),
    ADD COLUMN "defaultMethod" TEXT,
    ADD COLUMN "usefulLifeMode" TEXT,
    ADD COLUMN "minimumUsefulLifeMonths" INTEGER,
    ADD COLUMN "maximumUsefulLifeMonths" INTEGER,
    ADD COLUMN "reviewRequired" BOOLEAN,
    ADD COLUMN "classificationRule" TEXT;

DROP INDEX "FinanceAssetCategoryPolicy_companyCode_categoryId_key";

UPDATE "FinanceAssetCategoryPolicy" policy
SET "year" = (
    SELECT max(account."year")
    FROM "FinanceAccount" account
    WHERE account."companyCode" = policy."companyCode"
      AND account."code" = policy."assetAccountCode"
      AND account."year" IS NOT NULL
);

UPDATE "FinanceAssetCategoryPolicy" policy
SET
    "assetAccountId" = (
        SELECT account."id"
        FROM "FinanceAccount" account
        WHERE account."companyCode" = policy."companyCode"
          AND account."year" = policy."year"
          AND account."code" = policy."assetAccountCode"
        LIMIT 1
    ),
    "accumulatedAccountId" = CASE
        WHEN policy."accumulatedAccountCode" IS NULL THEN NULL
        ELSE (
            SELECT account."id"
            FROM "FinanceAccount" account
            WHERE account."companyCode" = policy."companyCode"
              AND account."year" = policy."year"
              AND account."code" = policy."accumulatedAccountCode"
            LIMIT 1
        )
    END,
    "expenseAccountId" = CASE
        WHEN policy."expenseAccountCode" IS NULL THEN NULL
        ELSE (
            SELECT account."id"
            FROM "FinanceAccount" account
            WHERE account."companyCode" = policy."companyCode"
              AND account."year" = policy."year"
              AND account."code" = policy."expenseAccountCode"
            LIMIT 1
        )
    END;

UPDATE "FinanceAssetCategoryPolicy" policy
SET
    "defaultUsefulLifeMonths" = category."defaultUsefulLifeMonths",
    "defaultResidualRate" = COALESCE(category."defaultResidualRate", 0),
    "defaultMethod" = category."defaultMethod",
    "usefulLifeMode" = CASE
        WHEN category."assetKind" = 'intangible' THEN 'required_or_indefinite_basis'
        ELSE 'required'
    END,
    "minimumUsefulLifeMonths" = CASE
        WHEN category."assetKind" = 'long_term_deferred' THEN 13
        ELSE 1
    END,
    "maximumUsefulLifeMonths" = CASE
        WHEN category."assetKind" = 'prepaid' THEN 12
        ELSE NULL
    END,
    "reviewRequired" = category."code" IN (
        'FA-BUILDING', 'FA-OTHER', 'IA-LAND-USE', 'IA-LICENSE', 'IA-OTHER',
        'PA-RENT', 'PA-PARKING', 'PA-OTHER', 'LT-RENOVATION', 'LT-LEASEHOLD', 'LT-OTHER'
    ),
    "classificationRule" = CASE category."assetKind"
        WHEN 'fixed_asset' THEN '用于生产经营、预计使用超过一个会计年度且成本能够可靠计量的有形资产。'
        WHEN 'intangible' THEN '可辨认、无实物形态、由企业控制且预期带来经济利益的资产。'
        WHEN 'prepaid' THEN '已支付并对应未来商品或服务、预计在十二个月内结转的款项。'
        ELSE '已经发生、受益期超过十二个月且不应计入其他资产成本的支出。'
    END
FROM "FinanceAssetCategory" category
WHERE category."id" = policy."categoryId";

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "FinanceAssetCategoryPolicy"
        WHERE "year" IS NULL
           OR "assetAccountId" IS NULL
           OR "defaultResidualRate" IS NULL
           OR "defaultMethod" IS NULL
           OR "usefulLifeMode" IS NULL
           OR "reviewRequired" IS NULL
           OR "classificationRule" IS NULL
    ) THEN
        RAISE EXCEPTION 'Cannot migrate FinanceAssetCategoryPolicy: an existing policy cannot be resolved to an annual FinanceAccount FK';
    END IF;
END $$;

ALTER TABLE "FinanceAssetCategoryPolicy"
    ALTER COLUMN "year" SET NOT NULL,
    ALTER COLUMN "assetAccountId" SET NOT NULL,
    ALTER COLUMN "defaultResidualRate" SET NOT NULL,
    ALTER COLUMN "defaultMethod" SET NOT NULL,
    ALTER COLUMN "defaultMethod" SET DEFAULT 'straight_line',
    ALTER COLUMN "usefulLifeMode" SET NOT NULL,
    ALTER COLUMN "usefulLifeMode" SET DEFAULT 'required',
    ALTER COLUMN "reviewRequired" SET NOT NULL,
    ALTER COLUMN "reviewRequired" SET DEFAULT false,
    ALTER COLUMN "classificationRule" SET NOT NULL;

ALTER TABLE "FinanceAssetCategoryPolicy"
    ADD CONSTRAINT "FinanceAssetCategoryPolicy_assetAccountId_fkey"
    FOREIGN KEY ("assetAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "FinanceAssetCategoryPolicy_accumulatedAccountId_fkey"
    FOREIGN KEY ("accumulatedAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "FinanceAssetCategoryPolicy_expenseAccountId_fkey"
    FOREIGN KEY ("expenseAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceAssetCategoryPolicy"
    DROP COLUMN "assetAccountCode",
    DROP COLUMN "accumulatedAccountCode",
    DROP COLUMN "expenseAccountCode";

CREATE UNIQUE INDEX "FinanceAssetCategoryPolicy_companyCode_year_categoryId_key"
    ON "FinanceAssetCategoryPolicy"("companyCode", "year", "categoryId");
CREATE INDEX "FinanceAssetCategoryPolicy_assetAccountId_idx"
    ON "FinanceAssetCategoryPolicy"("assetAccountId");
CREATE INDEX "FinanceAssetCategoryPolicy_accumulatedAccountId_idx"
    ON "FinanceAssetCategoryPolicy"("accumulatedAccountId");
CREATE INDEX "FinanceAssetCategoryPolicy_expenseAccountId_idx"
    ON "FinanceAssetCategoryPolicy"("expenseAccountId");
