-- workspace:migration-mode=maintenance
-- AlterTable
ALTER TABLE "Employment" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "Employment_companyId_idx" ON "Employment"("companyId");

-- AddForeignKey
ALTER TABLE "Employment" ADD CONSTRAINT "Employment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceAccountBalance" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceAccountBalance_companyId_idx" ON "FinanceAccountBalance"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceAccountBalance" ADD CONSTRAINT "FinanceAccountBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceAssetAdjustment" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceAssetAdjustment_companyId_idx" ON "FinanceAssetAdjustment"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceAssetAdjustment" ADD CONSTRAINT "FinanceAssetAdjustment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceAssetCard" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceAssetCard_companyId_idx" ON "FinanceAssetCard"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceAssetCard" ADD CONSTRAINT "FinanceAssetCard_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceAssetCategoryPolicy" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceAssetCategoryPolicy_companyId_idx" ON "FinanceAssetCategoryPolicy"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceAssetCategoryPolicy" ADD CONSTRAINT "FinanceAssetCategoryPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceAssetDisposal" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceAssetDisposal_companyId_idx" ON "FinanceAssetDisposal"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceAssetDisposal" ADD CONSTRAINT "FinanceAssetDisposal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceAssetImpairmentAssessment" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceAssetImpairmentAssessment_companyId_idx" ON "FinanceAssetImpairmentAssessment"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceAssetImpairmentAssessment" ADD CONSTRAINT "FinanceAssetImpairmentAssessment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceAssetImportBatch" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceAssetImportBatch_companyId_idx" ON "FinanceAssetImportBatch"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceAssetImportBatch" ADD CONSTRAINT "FinanceAssetImportBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceAuxiliaryBalance" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceAuxiliaryBalance_companyId_idx" ON "FinanceAuxiliaryBalance"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceAuxiliaryBalance" ADD CONSTRAINT "FinanceAuxiliaryBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceBalanceReclassAdjustment" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceBalanceReclassAdjustment_companyId_idx" ON "FinanceBalanceReclassAdjustment"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceBalanceReclassAdjustment" ADD CONSTRAINT "FinanceBalanceReclassAdjustment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceBalanceReclassAdjustmentHistory" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceBalanceReclassAdjustmentHistory_companyId_idx" ON "FinanceBalanceReclassAdjustmentHistory"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceBalanceReclassAdjustmentHistory" ADD CONSTRAINT "FinanceBalanceReclassAdjustmentHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceBalanceSnapshot" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceBalanceSnapshot_companyId_idx" ON "FinanceBalanceSnapshot"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceBalanceSnapshot" ADD CONSTRAINT "FinanceBalanceSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceCashFlowAllocation" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceCashFlowAllocation_companyId_idx" ON "FinanceCashFlowAllocation"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceCashFlowAllocation" ADD CONSTRAINT "FinanceCashFlowAllocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceCashFlowAllocationAdjustment" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceCashFlowAllocationAdjustment_companyId_idx" ON "FinanceCashFlowAllocationAdjustment"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceCashFlowAllocationAdjustment" ADD CONSTRAINT "FinanceCashFlowAllocationAdjustment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceCashFlowItem" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceCashFlowItem_companyId_idx" ON "FinanceCashFlowItem"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceCashFlowItem" ADD CONSTRAINT "FinanceCashFlowItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceCurrency" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceCurrency_companyId_idx" ON "FinanceCurrency"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceCurrency" ADD CONSTRAINT "FinanceCurrency_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceGroupAccount" ADD COLUMN "originCompanyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceGroupAccount_originCompanyId_idx" ON "FinanceGroupAccount"("originCompanyId");

-- AddForeignKey
ALTER TABLE "FinanceGroupAccount" ADD CONSTRAINT "FinanceGroupAccount_originCompanyId_fkey" FOREIGN KEY ("originCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceGroupAccountMapping" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceGroupAccountMapping_companyId_idx" ON "FinanceGroupAccountMapping"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceGroupAccountMapping" ADD CONSTRAINT "FinanceGroupAccountMapping_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceLedgerImport" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceLedgerImport_companyId_idx" ON "FinanceLedgerImport"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceLedgerImport" ADD CONSTRAINT "FinanceLedgerImport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceOpenItem" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceOpenItem_companyId_idx" ON "FinanceOpenItem"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceOpenItem" ADD CONSTRAINT "FinanceOpenItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinancePeriod" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinancePeriod_companyId_idx" ON "FinancePeriod"("companyId");

-- AddForeignKey
ALTER TABLE "FinancePeriod" ADD CONSTRAINT "FinancePeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceReclassItemRule" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceReclassItemRule_companyId_idx" ON "FinanceReclassItemRule"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceReclassItemRule" ADD CONSTRAINT "FinanceReclassItemRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceSourceAccountBalance" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceSourceAccountBalance_companyId_idx" ON "FinanceSourceAccountBalance"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceSourceAccountBalance" ADD CONSTRAINT "FinanceSourceAccountBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceSourceLedgerMapping" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceSourceLedgerMapping_companyId_idx" ON "FinanceSourceLedgerMapping"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceSourceLedgerMapping" ADD CONSTRAINT "FinanceSourceLedgerMapping_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceStatementVoucherExclusion" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceStatementVoucherExclusion_companyId_idx" ON "FinanceStatementVoucherExclusion"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceStatementVoucherExclusion" ADD CONSTRAINT "FinanceStatementVoucherExclusion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceStatementWorkpaper" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceStatementWorkpaper_companyId_idx" ON "FinanceStatementWorkpaper"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceStatementWorkpaper" ADD CONSTRAINT "FinanceStatementWorkpaper_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "FinanceVoucher" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceVoucher_companyId_idx" ON "FinanceVoucher"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceVoucher" ADD CONSTRAINT "FinanceVoucher_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "InventoryDocument" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "InventoryDocument_companyId_idx" ON "InventoryDocument"("companyId");

-- AddForeignKey
ALTER TABLE "InventoryDocument" ADD CONSTRAINT "InventoryDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "InventoryImportBatch" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "InventoryImportBatch_companyId_idx" ON "InventoryImportBatch"("companyId");

-- AddForeignKey
ALTER TABLE "InventoryImportBatch" ADD CONSTRAINT "InventoryImportBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "InventoryLedgerEntry" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "InventoryLedgerEntry_companyId_idx" ON "InventoryLedgerEntry"("companyId");

-- AddForeignKey
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "InventoryPeriodClose" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "InventoryPeriodClose_companyId_idx" ON "InventoryPeriodClose"("companyId");

-- AddForeignKey
ALTER TABLE "InventoryPeriodClose" ADD CONSTRAINT "InventoryPeriodClose_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "InventoryStocktake" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "InventoryStocktake_companyId_idx" ON "InventoryStocktake"("companyId");

-- AddForeignKey
ALTER TABLE "InventoryStocktake" ADD CONSTRAINT "InventoryStocktake_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "StockFinishedGoods" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "StockFinishedGoods_companyId_idx" ON "StockFinishedGoods"("companyId");

-- AddForeignKey
ALTER TABLE "StockFinishedGoods" ADD CONSTRAINT "StockFinishedGoods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "StockPackaging" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "StockPackaging_companyId_idx" ON "StockPackaging"("companyId");

-- AddForeignKey
ALTER TABLE "StockPackaging" ADD CONSTRAINT "StockPackaging_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "StockRawMaterial" ADD COLUMN "companyId" INTEGER;

-- CreateIndex
CREATE INDEX "StockRawMaterial_companyId_idx" ON "StockRawMaterial"("companyId");

-- AddForeignKey
ALTER TABLE "StockRawMaterial" ADD CONSTRAINT "StockRawMaterial_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
