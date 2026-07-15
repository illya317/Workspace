-- CreateTable
CREATE TABLE "FinanceAssetCard" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetKind" TEXT NOT NULL,
    "category" TEXT,
    "assetAccountCode" TEXT NOT NULL,
    "accumulatedAccountCode" TEXT,
    "acquisitionDate" TEXT,
    "depreciationStartDate" TEXT,
    "originalCost" DECIMAL(20,2) NOT NULL,
    "residualRate" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER,
    "method" TEXT NOT NULL DEFAULT 'straight_line',
    "openingAccumulatedAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "openingAsOfDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "nonAmortizationReason" TEXT,
    "note" TEXT,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "sourceKey" TEXT,
    "editedBy" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAssetCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAssetCostLine" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "lineType" TEXT NOT NULL DEFAULT 'invoice',
    "treatment" TEXT NOT NULL DEFAULT 'included',
    "referenceNo" TEXT,
    "referenceDate" TEXT,
    "amount" DECIMAL(20,2) NOT NULL,
    "reason" TEXT,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "sourceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAssetCostLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAssetExpenseAllocation" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "expenseAccountCode" TEXT NOT NULL,
    "allocationRate" DECIMAL(10,6) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAssetExpenseAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAssetImportBatch" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "cardCount" INTEGER NOT NULL DEFAULT 0,
    "costLineCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "importedBy" INTEGER,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "FinanceAssetImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAssetPeriodEntry" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "normalAmount" DECIMAL(20,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'calculated',
    "calculationVersion" TEXT NOT NULL DEFAULT 'straight-line-v1',
    "voucherId" INTEGER,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAssetPeriodEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAssetAdjustment" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    "assetId" INTEGER,
    "amount" DECIMAL(20,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "reversedById" INTEGER,
    "voucherId" INTEGER,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "sourceKey" TEXT,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAssetAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "itemType" TEXT NOT NULL DEFAULT 'finished_goods',
    "specification" TEXT,
    "baseUnit" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "note" TEXT,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceKey" TEXT,
    "editedBy" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryUnitConversion" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "factor" DECIMAL(20,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryUnitConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryWarehouse" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryWarehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBatch" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "batchNo" TEXT NOT NULL,
    "productionDate" TEXT,
    "expiryDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'normal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryDocument" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "documentNo" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "counterparty" TEXT,
    "referenceNo" TEXT,
    "note" TEXT,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceKey" TEXT,
    "createdBy" INTEGER,
    "postedBy" INTEGER,
    "postedAt" TIMESTAMP(3),
    "reversedById" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryDocumentLine" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "batchId" INTEGER,
    "quantity" DECIMAL(20,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitFactor" DECIMAL(20,6) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(20,6),
    "paymentStatus" TEXT,
    "invoiceStatus" TEXT,
    "sourceRow" INTEGER,
    "sourceKey" TEXT,

    CONSTRAINT "InventoryDocumentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLedgerEntry" (
    "id" SERIAL NOT NULL,
    "documentLineId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "batchId" INTEGER,
    "movementDate" TEXT NOT NULL,
    "signedQuantity" DECIMAL(20,6) NOT NULL,
    "unitCost" DECIMAL(20,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryStocktake" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "stocktakeNo" TEXT NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "stocktakeDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceKey" TEXT,
    "createdBy" INTEGER,
    "approvedBy" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryStocktake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryStocktakeLine" (
    "id" SERIAL NOT NULL,
    "stocktakeId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "batchId" INTEGER,
    "bookQuantity" DECIMAL(20,6) NOT NULL,
    "actualQuantity" DECIMAL(20,6) NOT NULL,
    "note" TEXT,
    "sourceRow" INTEGER,

    CONSTRAINT "InventoryStocktakeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryPeriodClose" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "voucherId" INTEGER,
    "lockedBy" INTEGER,
    "lockedAt" TIMESTAMP(3),
    "unlockedBy" INTEGER,
    "unlockedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryPeriodClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryImportBatch" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "sourceSheet" TEXT,
    "checksum" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "documentCount" INTEGER NOT NULL DEFAULT 0,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "importedBy" INTEGER,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "InventoryImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceAssetCard_companyCode_status_assetKind_idx" ON "FinanceAssetCard"("companyCode", "status", "assetKind");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAssetCard_companyCode_assetCode_key" ON "FinanceAssetCard"("companyCode", "assetCode");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAssetCard_companyCode_sourceKey_key" ON "FinanceAssetCard"("companyCode", "sourceKey");

-- CreateIndex
CREATE INDEX "FinanceAssetCostLine_assetId_treatment_idx" ON "FinanceAssetCostLine"("assetId", "treatment");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAssetCostLine_assetId_sourceKey_key" ON "FinanceAssetCostLine"("assetId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAssetExpenseAllocation_assetId_expenseAccountCode_key" ON "FinanceAssetExpenseAllocation"("assetId", "expenseAccountCode");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAssetImportBatch_companyCode_checksum_key" ON "FinanceAssetImportBatch"("companyCode", "checksum");

-- CreateIndex
CREATE INDEX "FinanceAssetPeriodEntry_periodId_status_idx" ON "FinanceAssetPeriodEntry"("periodId", "status");

-- CreateIndex
CREATE INDEX "FinanceAssetPeriodEntry_voucherId_idx" ON "FinanceAssetPeriodEntry"("voucherId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAssetPeriodEntry_assetId_periodId_key" ON "FinanceAssetPeriodEntry"("assetId", "periodId");

-- CreateIndex
CREATE INDEX "FinanceAssetAdjustment_periodId_status_idx" ON "FinanceAssetAdjustment"("periodId", "status");

-- CreateIndex
CREATE INDEX "FinanceAssetAdjustment_assetId_idx" ON "FinanceAssetAdjustment"("assetId");

-- CreateIndex
CREATE INDEX "FinanceAssetAdjustment_voucherId_idx" ON "FinanceAssetAdjustment"("voucherId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAssetAdjustment_companyCode_sourceKey_key" ON "FinanceAssetAdjustment"("companyCode", "sourceKey");

-- CreateIndex
CREATE INDEX "InventoryItem_companyCode_status_itemType_idx" ON "InventoryItem"("companyCode", "status", "itemType");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_companyCode_code_key" ON "InventoryItem"("companyCode", "code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_companyCode_sourceKey_key" ON "InventoryItem"("companyCode", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryUnitConversion_itemId_unit_key" ON "InventoryUnitConversion"("itemId", "unit");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryWarehouse_companyCode_code_key" ON "InventoryWarehouse"("companyCode", "code");

-- CreateIndex
CREATE INDEX "InventoryBatch_expiryDate_status_idx" ON "InventoryBatch"("expiryDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBatch_itemId_warehouseId_batchNo_key" ON "InventoryBatch"("itemId", "warehouseId", "batchNo");

-- CreateIndex
CREATE INDEX "InventoryDocument_companyCode_documentDate_documentType_sta_idx" ON "InventoryDocument"("companyCode", "documentDate", "documentType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryDocument_companyCode_documentNo_key" ON "InventoryDocument"("companyCode", "documentNo");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryDocument_companyCode_sourceKey_key" ON "InventoryDocument"("companyCode", "sourceKey");

-- CreateIndex
CREATE INDEX "InventoryDocumentLine_itemId_warehouseId_batchId_idx" ON "InventoryDocumentLine"("itemId", "warehouseId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryDocumentLine_documentId_sourceKey_key" ON "InventoryDocumentLine"("documentId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLedgerEntry_documentLineId_key" ON "InventoryLedgerEntry"("documentLineId");

-- CreateIndex
CREATE INDEX "InventoryLedgerEntry_companyCode_movementDate_idx" ON "InventoryLedgerEntry"("companyCode", "movementDate");

-- CreateIndex
CREATE INDEX "InventoryLedgerEntry_itemId_warehouseId_batchId_idx" ON "InventoryLedgerEntry"("itemId", "warehouseId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStocktake_companyCode_stocktakeNo_key" ON "InventoryStocktake"("companyCode", "stocktakeNo");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStocktake_companyCode_sourceKey_key" ON "InventoryStocktake"("companyCode", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryStocktakeLine_stocktakeId_itemId_warehouseId_batch_key" ON "InventoryStocktakeLine"("stocktakeId", "itemId", "warehouseId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryPeriodClose_companyCode_year_month_key" ON "InventoryPeriodClose"("companyCode", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryImportBatch_companyCode_checksum_sourceSheet_key" ON "InventoryImportBatch"("companyCode", "checksum", "sourceSheet");

-- AddForeignKey
ALTER TABLE "FinanceAssetCostLine" ADD CONSTRAINT "FinanceAssetCostLine_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FinanceAssetCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssetExpenseAllocation" ADD CONSTRAINT "FinanceAssetExpenseAllocation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FinanceAssetCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssetPeriodEntry" ADD CONSTRAINT "FinanceAssetPeriodEntry_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FinanceAssetCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssetPeriodEntry" ADD CONSTRAINT "FinanceAssetPeriodEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssetPeriodEntry" ADD CONSTRAINT "FinanceAssetPeriodEntry_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "FinanceVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssetAdjustment" ADD CONSTRAINT "FinanceAssetAdjustment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FinanceAssetCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssetAdjustment" ADD CONSTRAINT "FinanceAssetAdjustment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAssetAdjustment" ADD CONSTRAINT "FinanceAssetAdjustment_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "FinanceVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryUnitConversion" ADD CONSTRAINT "InventoryUnitConversion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "InventoryWarehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocumentLine" ADD CONSTRAINT "InventoryDocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "InventoryDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocumentLine" ADD CONSTRAINT "InventoryDocumentLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocumentLine" ADD CONSTRAINT "InventoryDocumentLine_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "InventoryWarehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDocumentLine" ADD CONSTRAINT "InventoryDocumentLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_documentLineId_fkey" FOREIGN KEY ("documentLineId") REFERENCES "InventoryDocumentLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "InventoryWarehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedgerEntry" ADD CONSTRAINT "InventoryLedgerEntry_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStocktake" ADD CONSTRAINT "InventoryStocktake_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "InventoryWarehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStocktakeLine" ADD CONSTRAINT "InventoryStocktakeLine_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "InventoryStocktake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStocktakeLine" ADD CONSTRAINT "InventoryStocktakeLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStocktakeLine" ADD CONSTRAINT "InventoryStocktakeLine_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "InventoryWarehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryStocktakeLine" ADD CONSTRAINT "InventoryStocktakeLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
