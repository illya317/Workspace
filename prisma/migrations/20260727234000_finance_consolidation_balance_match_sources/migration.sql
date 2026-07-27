-- workspace:migration-mode=maintenance

ALTER TABLE "FinanceConsolidationMatchSource"
ADD COLUMN "sourceKind" TEXT NOT NULL DEFAULT 'voucher',
ADD COLUMN "auxiliaryBalanceId" INTEGER;

ALTER TABLE "FinanceConsolidationMatchSource"
ALTER COLUMN "voucherItemId" DROP NOT NULL;

CREATE UNIQUE INDEX "FinanceConsolidationMatchSource_matchGroupId_auxiliaryBalanceId_key"
ON "FinanceConsolidationMatchSource"("matchGroupId", "auxiliaryBalanceId");

CREATE INDEX "FinanceConsolidationMatchSource_auxiliaryBalanceId_idx"
ON "FinanceConsolidationMatchSource"("auxiliaryBalanceId");

ALTER TABLE "FinanceConsolidationMatchSource"
ADD CONSTRAINT "FinanceConsolidationMatchSource_auxiliaryBalanceId_fkey"
FOREIGN KEY ("auxiliaryBalanceId") REFERENCES "FinanceAuxiliaryBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
