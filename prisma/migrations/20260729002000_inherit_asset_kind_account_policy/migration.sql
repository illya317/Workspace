-- workspace:migration-mode=maintenance
-- When a company has one unambiguous account pair for an asset kind, use it as
-- the initial policy for every confirmed category of that kind.

WITH "KindPolicy" AS (
    SELECT
        card."companyCode",
        card."assetKind",
        min(card."assetAccountCode") AS "assetAccountCode",
        NULLIF(min(COALESCE(card."accumulatedAccountCode", '')), '') AS "accumulatedAccountCode"
    FROM "FinanceAssetCard" card
    GROUP BY card."companyCode", card."assetKind"
    HAVING count(DISTINCT card."assetAccountCode") = 1
       AND count(DISTINCT COALESCE(card."accumulatedAccountCode", '')) = 1
)
INSERT INTO "FinanceAssetCategoryPolicy" (
    "categoryId", "companyCode", "assetAccountCode", "accumulatedAccountCode"
)
SELECT
    category."id",
    policy."companyCode",
    policy."assetAccountCode",
    policy."accumulatedAccountCode"
FROM "KindPolicy" policy
JOIN "FinanceAssetCategory" category
  ON category."assetKind" = policy."assetKind"
WHERE category."reviewStatus" = 'confirmed'
  AND category."isActive" = true
ON CONFLICT ("companyCode", "categoryId") DO NOTHING;
