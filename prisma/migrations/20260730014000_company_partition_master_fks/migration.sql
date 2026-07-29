-- AlterTable
ALTER TABLE "FinanceAccount" ADD COLUMN "companyId" INTEGER;

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN "companyId" INTEGER;

-- AlterTable
ALTER TABLE "InventoryWarehouse" ADD COLUMN "companyId" INTEGER;

-- AlterTable
ALTER TABLE "FinanceAuxiliaryMember" ADD COLUMN "companyId" INTEGER;

-- AlterTable
ALTER TABLE "FinanceVoucherCompanyMappingRule" ADD COLUMN "sourceCompanyId" INTEGER;

-- CreateIndex
CREATE INDEX "FinanceAccount_companyId_idx" ON "FinanceAccount"("companyId");

-- CreateIndex
CREATE INDEX "InventoryItem_companyId_idx" ON "InventoryItem"("companyId");

-- CreateIndex
CREATE INDEX "InventoryWarehouse_companyId_idx" ON "InventoryWarehouse"("companyId");

-- CreateIndex
CREATE INDEX "FinanceAuxiliaryMember_companyId_idx" ON "FinanceAuxiliaryMember"("companyId");

-- CreateIndex
CREATE INDEX "FinanceVoucherCompanyMappingRule_sourceCompanyId_idx" ON "FinanceVoucherCompanyMappingRule"("sourceCompanyId");

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryWarehouse" ADD CONSTRAINT "InventoryWarehouse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAuxiliaryMember" ADD CONSTRAINT "FinanceAuxiliaryMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceVoucherCompanyMappingRule" ADD CONSTRAINT "FinanceVoucherCompanyMappingRule_sourceCompanyId_fkey" FOREIGN KEY ("sourceCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
