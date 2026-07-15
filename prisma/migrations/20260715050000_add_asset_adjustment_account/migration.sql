ALTER TABLE "FinanceAssetAdjustment"
ADD COLUMN "accountCode" TEXT NOT NULL DEFAULT '1602';

ALTER TABLE "FinanceAssetAdjustment"
ALTER COLUMN "accountCode" DROP DEFAULT;
