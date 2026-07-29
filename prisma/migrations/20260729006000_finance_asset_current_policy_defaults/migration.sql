-- workspace:migration-mode=maintenance
-- Activate governed asset-category defaults for each company's latest account
-- year. Existing policies win; incomplete account-FK combinations stay absent.

WITH "CurrentScopes" AS (
    SELECT account."companyCode", max(account."year") AS "year"
    FROM "FinanceAccount" account
    WHERE account."isActive" = true
      AND account."year" IS NOT NULL
    GROUP BY account."companyCode"
),
"PolicyTargets" AS (
    SELECT
        category."id" AS "categoryId",
        category."code" AS "categoryCode",
        category."assetKind",
        category."defaultUsefulLifeMonths",
        COALESCE(category."defaultResidualRate", 0) AS "defaultResidualRate",
        category."defaultMethod",
        scope."companyCode",
        scope."year",
        CASE
            WHEN category."assetKind" = 'fixed_asset' THEN '1601'
            WHEN category."assetKind" = 'intangible' THEN '1701'
            WHEN category."assetKind" = 'long_term_deferred' THEN '1801'
            WHEN category."code" = 'PA-PARKING' THEN '1123'
            ELSE '1463'
        END AS "assetAccountCode",
        CASE
            WHEN category."assetKind" = 'fixed_asset' THEN '1602'
            WHEN category."assetKind" = 'intangible' THEN '1702'
            ELSE NULL
        END AS "accumulatedAccountCode"
    FROM "FinanceAssetCategory" category
    CROSS JOIN "CurrentScopes" scope
    WHERE category."reviewStatus" = 'confirmed'
      AND category."isActive" = true
)
INSERT INTO "FinanceAssetCategoryPolicy" (
    "categoryId", "companyCode", "year", "assetAccountId",
    "accumulatedAccountId", "expenseAccountId",
    "defaultUsefulLifeMonths", "defaultResidualRate", "defaultMethod",
    "usefulLifeMode", "minimumUsefulLifeMonths", "maximumUsefulLifeMonths",
    "reviewRequired", "classificationRule"
)
SELECT
    target."categoryId",
    target."companyCode",
    target."year",
    asset_account."id",
    accumulated_account."id",
    NULL,
    target."defaultUsefulLifeMonths",
    target."defaultResidualRate",
    target."defaultMethod",
    CASE
        WHEN target."assetKind" = 'intangible' THEN 'required_or_indefinite_basis'
        ELSE 'required'
    END,
    CASE
        WHEN target."assetKind" = 'long_term_deferred' THEN 13
        ELSE 1
    END,
    CASE
        WHEN target."assetKind" = 'prepaid' THEN 12
        ELSE NULL
    END,
    target."categoryCode" IN (
        'FA-BUILDING', 'FA-OTHER', 'IA-LAND-USE', 'IA-LICENSE', 'IA-OTHER',
        'PA-RENT', 'PA-PARKING', 'PA-OTHER', 'LT-RENOVATION', 'LT-LEASEHOLD', 'LT-OTHER'
    ),
    CASE target."categoryCode"
        WHEN 'FA-BUILDING' THEN '用于生产经营、预计使用超过一个会计年度且成本能够可靠计量；出租或持有增值的房产需先复核投资性房地产分类。'
        WHEN 'FA-MACHINERY' THEN '用于生产经营、预计使用超过一个会计年度且成本能够可靠计量的机器及生产设备。'
        WHEN 'FA-TRANSPORT' THEN '企业拥有或控制、预计使用超过一个会计年度的运输工具。'
        WHEN 'FA-ELECTRONIC' THEN '企业拥有或控制、预计使用超过一个会计年度的电子设备。'
        WHEN 'FA-OFFICE' THEN '企业拥有或控制、预计使用超过一个会计年度的办公设备及家具。'
        WHEN 'FA-OTHER' THEN '符合固定资产确认条件、但不属于既有专门分类的其他有形资产。'
        WHEN 'IA-SOFTWARE' THEN '可辨认、由企业控制且预期带来经济利益的软件权利；使用寿命按合同期限和预计受益期确定。'
        WHEN 'IA-LAND-USE' THEN '企业取得并控制的土地使用权；出租或持有增值目的需先复核投资性房地产分类。'
        WHEN 'IA-LICENSE' THEN '可辨认并受合同或法律权利保护的牌照、许可；使用寿命按权利期限和预计受益期确定。'
        WHEN 'IA-OTHER' THEN '符合可辨认、无实物形态、企业控制及预期经济利益条件的其他无形资产。'
        WHEN 'PA-RENT' THEN '仅在不构成使用权资产且受益期不超过十二个月时作为预付；录入前先完成租赁识别。'
        WHEN 'PA-PARKING' THEN '先判断取得的是产权、长期使用权、租赁权还是短期服务；只有受益期不超过十二个月的预付款进入本分类。'
        WHEN 'PA-NETWORK' THEN '已支付、对应未来网络或服务期间且预计在十二个月内结转的款项。'
        WHEN 'PA-OTHER' THEN '已支付、对应未来商品或服务且预计在十二个月内结转的其他预付款。'
        WHEN 'LT-RENOVATION' THEN '已经发生、受益期超过十二个月且不应计入其他资产成本的装修改造支出。'
        WHEN 'LT-LEASEHOLD' THEN '租入资产改良支出单独判断并按受益期与剩余租赁期口径摊销，不直接并入使用权资产成本。'
        WHEN 'LT-OTHER' THEN '已经发生、受益期超过十二个月且不属于其他资产成本的其他长期待摊支出。'
        ELSE CASE target."assetKind"
            WHEN 'fixed_asset' THEN '用于生产经营、预计使用超过一个会计年度且成本能够可靠计量的有形资产。'
            WHEN 'intangible' THEN '可辨认、无实物形态、由企业控制且预期带来经济利益的资产。'
            WHEN 'prepaid' THEN '已支付并对应未来商品或服务、预计在十二个月内结转的款项。'
            ELSE '已经发生、受益期超过十二个月且不应计入其他资产成本的支出。'
        END
    END
FROM "PolicyTargets" target
JOIN "FinanceAccount" asset_account
  ON asset_account."companyCode" = target."companyCode"
 AND asset_account."year" = target."year"
 AND asset_account."code" = target."assetAccountCode"
 AND asset_account."category" = 'asset'
 AND asset_account."isActive" = true
LEFT JOIN "FinanceAccount" accumulated_account
  ON accumulated_account."companyCode" = target."companyCode"
 AND accumulated_account."year" = target."year"
 AND accumulated_account."code" = target."accumulatedAccountCode"
 AND accumulated_account."category" = 'asset'
 AND accumulated_account."isActive" = true
WHERE target."accumulatedAccountCode" IS NULL
   OR accumulated_account."id" IS NOT NULL
ON CONFLICT ("companyCode", "year", "categoryId") DO NOTHING;
