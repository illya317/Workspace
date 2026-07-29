-- workspace:migration-mode=maintenance
-- Replace free-text asset categories with a governed category master and company account policy.

CREATE TABLE "FinanceAssetCategory" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetKind" TEXT NOT NULL,
    "defaultUsefulLifeMonths" INTEGER,
    "defaultResidualRate" DECIMAL(10,6),
    "defaultMethod" TEXT NOT NULL DEFAULT 'straight_line',
    "depreciable" BOOLEAN NOT NULL DEFAULT true,
    "reviewStatus" TEXT NOT NULL DEFAULT 'confirmed',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceAssetCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceAssetCategoryPolicy" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "assetAccountCode" TEXT NOT NULL,
    "accumulatedAccountCode" TEXT,
    "expenseAccountCode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceAssetCategoryPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceAssetCategory_code_key" ON "FinanceAssetCategory"("code");
CREATE UNIQUE INDEX "FinanceAssetCategory_assetKind_name_key" ON "FinanceAssetCategory"("assetKind", "name");
CREATE INDEX "FinanceAssetCategory_assetKind_isActive_sortOrder_idx" ON "FinanceAssetCategory"("assetKind", "isActive", "sortOrder");
CREATE INDEX "FinanceAssetCategory_reviewStatus_idx" ON "FinanceAssetCategory"("reviewStatus");
CREATE UNIQUE INDEX "FinanceAssetCategoryPolicy_companyCode_categoryId_key" ON "FinanceAssetCategoryPolicy"("companyCode", "categoryId");
CREATE INDEX "FinanceAssetCategoryPolicy_categoryId_idx" ON "FinanceAssetCategoryPolicy"("categoryId");
CREATE INDEX "FinanceAssetCategoryPolicy_companyCode_assetAccountCode_idx" ON "FinanceAssetCategoryPolicy"("companyCode", "assetAccountCode");

ALTER TABLE "FinanceAssetCategoryPolicy"
    ADD CONSTRAINT "FinanceAssetCategoryPolicy_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "FinanceAssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "FinanceAssetCategory" (
    "code", "name", "assetKind", "defaultUsefulLifeMonths", "defaultResidualRate", "depreciable", "sortOrder"
) VALUES
    ('FA-BUILDING', '房屋及建筑物', 'fixed_asset', NULL, 0.030000, true, 10),
    ('FA-MACHINERY', '机器设备', 'fixed_asset', 120, 0.030000, true, 20),
    ('FA-TRANSPORT', '运输设备', 'fixed_asset', 48, 0.030000, true, 30),
    ('FA-ELECTRONIC', '电子设备', 'fixed_asset', 36, 0.030000, true, 40),
    ('FA-OFFICE', '办公及家具设备', 'fixed_asset', 60, 0.030000, true, 50),
    ('FA-OTHER', '其他固定资产', 'fixed_asset', NULL, 0.030000, true, 60),
    ('IA-SOFTWARE', '软件', 'intangible', NULL, 0.000000, true, 110),
    ('IA-LAND-USE', '土地使用权', 'intangible', NULL, 0.000000, true, 120),
    ('IA-LICENSE', '牌照及许可', 'intangible', NULL, 0.000000, true, 130),
    ('IA-OTHER', '其他无形资产', 'intangible', NULL, 0.000000, true, 140),
    ('PA-RENT', '房租', 'prepaid', NULL, 0.000000, true, 210),
    ('PA-PARKING', '车位', 'prepaid', NULL, 0.000000, true, 220),
    ('PA-NETWORK', '网络及服务费', 'prepaid', NULL, 0.000000, true, 230),
    ('PA-OTHER', '其他预付', 'prepaid', NULL, 0.000000, true, 240),
    ('LT-RENOVATION', '装修改造', 'long_term_deferred', NULL, 0.000000, true, 310),
    ('LT-LEASEHOLD', '租入资产改良', 'long_term_deferred', NULL, 0.000000, true, 320),
    ('LT-OTHER', '其他长期待摊', 'long_term_deferred', NULL, 0.000000, true, 330),
    ('PENDING-FIXED', '待分类（固定资产）', 'fixed_asset', NULL, NULL, true, 9010),
    ('PENDING-INTANGIBLE', '待分类（无形资产）', 'intangible', NULL, NULL, true, 9020),
    ('PENDING-PREPAID', '待分类（预付及其他流动资产）', 'prepaid', NULL, NULL, true, 9030),
    ('PENDING-DEFERRED', '待分类（长期待摊费用）', 'long_term_deferred', NULL, NULL, true, 9040);

UPDATE "FinanceAssetCategory"
SET "reviewStatus" = 'pending_review', "isActive" = false
WHERE "code" LIKE 'PENDING-%';

ALTER TABLE "FinanceAssetCard"
    RENAME COLUMN "category" TO "sourceCategory";

ALTER TABLE "FinanceAssetCard"
    ADD COLUMN "categoryId" INTEGER;

UPDATE "FinanceAssetCard" card
SET "categoryId" = category."id"
FROM "FinanceAssetCategory" category
WHERE category."code" = CASE
    WHEN card."assetKind" = 'fixed_asset' AND trim(COALESCE(card."sourceCategory", '')) = '机器设备' THEN 'FA-MACHINERY'
    WHEN card."assetKind" = 'fixed_asset' AND trim(COALESCE(card."sourceCategory", '')) = '运输设备' THEN 'FA-TRANSPORT'
    WHEN card."assetKind" = 'fixed_asset' AND trim(COALESCE(card."sourceCategory", '')) = '电子设备' THEN 'FA-ELECTRONIC'
    WHEN card."assetKind" = 'fixed_asset' AND trim(COALESCE(card."sourceCategory", '')) IN ('办公设备', '办公及其他设备') THEN 'FA-OFFICE'
    WHEN card."assetKind" = 'fixed_asset' AND trim(COALESCE(card."sourceCategory", '')) = '其他' THEN 'PENDING-FIXED'
    WHEN card."assetKind" = 'intangible' AND card."name" LIKE '%软件%' THEN 'IA-SOFTWARE'
    WHEN card."assetKind" = 'intangible' AND card."name" LIKE '%土地%' THEN 'IA-LAND-USE'
    WHEN card."assetKind" = 'intangible' AND (card."name" LIKE '%牌照%' OR card."name" LIKE '%许可%') THEN 'IA-LICENSE'
    WHEN card."assetKind" = 'prepaid' AND card."name" LIKE '%车位%' THEN 'PA-PARKING'
    WHEN card."assetKind" = 'prepaid' AND card."name" LIKE '%房租%' THEN 'PA-RENT'
    WHEN card."assetKind" = 'prepaid' AND card."name" LIKE '%网络%' THEN 'PA-NETWORK'
    WHEN card."assetKind" = 'long_term_deferred' AND (card."name" LIKE '%装修%' OR card."name" LIKE '%改造%') THEN 'LT-RENOVATION'
    ELSE CASE card."assetKind"
        WHEN 'fixed_asset' THEN 'PENDING-FIXED'
        WHEN 'intangible' THEN 'PENDING-INTANGIBLE'
        WHEN 'prepaid' THEN 'PENDING-PREPAID'
        ELSE 'PENDING-DEFERRED'
    END
END;

ALTER TABLE "FinanceAssetCard"
    ALTER COLUMN "categoryId" SET NOT NULL;

CREATE INDEX "FinanceAssetCard_categoryId_idx" ON "FinanceAssetCard"("categoryId");

ALTER TABLE "FinanceAssetCard"
    ADD CONSTRAINT "FinanceAssetCard_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "FinanceAssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "FinanceAssetCategoryPolicy" (
    "categoryId", "companyCode", "assetAccountCode", "accumulatedAccountCode"
)
SELECT
    card."categoryId",
    card."companyCode",
    min(card."assetAccountCode"),
    NULLIF(min(COALESCE(card."accumulatedAccountCode", '')), '')
FROM "FinanceAssetCard" card
GROUP BY card."categoryId", card."companyCode"
HAVING count(DISTINCT card."assetAccountCode") = 1
   AND count(DISTINCT COALESCE(card."accumulatedAccountCode", '')) = 1;
