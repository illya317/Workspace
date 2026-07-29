-- workspace:migration-mode=maintenance
-- Department reference carried with the submitted name snapshot.
ALTER TABLE "ErpDueDiligenceSubmission" ADD COLUMN "departmentId" INTEGER;
CREATE INDEX "ErpDueDiligenceSubmission_departmentId_idx" ON "ErpDueDiligenceSubmission"("departmentId");
ALTER TABLE "ErpDueDiligenceSubmission" ADD CONSTRAINT "ErpDueDiligenceSubmission_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Asset account references carried with source account-code snapshots.
ALTER TABLE "FinanceAssetCard" ADD COLUMN "assetAccountId" INTEGER;
ALTER TABLE "FinanceAssetCard" ADD COLUMN "accumulatedAccountId" INTEGER;
CREATE INDEX "FinanceAssetCard_assetAccountId_idx" ON "FinanceAssetCard"("assetAccountId");
CREATE INDEX "FinanceAssetCard_accumulatedAccountId_idx" ON "FinanceAssetCard"("accumulatedAccountId");
ALTER TABLE "FinanceAssetCard" ADD CONSTRAINT "FinanceAssetCard_assetAccountId_fkey" FOREIGN KEY ("assetAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAssetCard" ADD CONSTRAINT "FinanceAssetCard_accumulatedAccountId_fkey" FOREIGN KEY ("accumulatedAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceAssetExpenseAllocation" ADD COLUMN "expenseAccountId" INTEGER;
CREATE INDEX "FinanceAssetExpenseAllocation_expenseAccountId_idx" ON "FinanceAssetExpenseAllocation"("expenseAccountId");
ALTER TABLE "FinanceAssetExpenseAllocation" ADD CONSTRAINT "FinanceAssetExpenseAllocation_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceAssetAdjustment" ADD COLUMN "accountId" INTEGER;
CREATE INDEX "FinanceAssetAdjustment_accountId_idx" ON "FinanceAssetAdjustment"("accountId");
ALTER TABLE "FinanceAssetAdjustment" ADD CONSTRAINT "FinanceAssetAdjustment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Local-account references use the mapping row's latest source year.
ALTER TABLE "FinanceGroupAccountMapping" ADD COLUMN "localAccountId" INTEGER;
CREATE INDEX "FinanceGroupAccountMapping_localAccountId_idx" ON "FinanceGroupAccountMapping"("localAccountId");
ALTER TABLE "FinanceGroupAccountMapping" ADD CONSTRAINT "FinanceGroupAccountMapping_localAccountId_fkey" FOREIGN KEY ("localAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceReclassItemRule" ADD COLUMN "sourceAccountId" INTEGER;
ALTER TABLE "FinanceReclassItemRule" ADD COLUMN "targetAccountId" INTEGER;
CREATE INDEX "FinanceReclassItemRule_sourceAccountId_idx" ON "FinanceReclassItemRule"("sourceAccountId");
CREATE INDEX "FinanceReclassItemRule_targetAccountId_idx" ON "FinanceReclassItemRule"("targetAccountId");
ALTER TABLE "FinanceReclassItemRule" ADD CONSTRAINT "FinanceReclassItemRule_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReclassItemRule" ADD CONSTRAINT "FinanceReclassItemRule_targetAccountId_fkey" FOREIGN KEY ("targetAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceBalanceReclassAdjustmentHistory" ADD COLUMN "sourceAccountId" INTEGER;
ALTER TABLE "FinanceBalanceReclassAdjustmentHistory" ADD COLUMN "targetAccountId" INTEGER;
CREATE INDEX "FinanceBalanceReclassAdjustmentHistory_sourceAccountId_idx" ON "FinanceBalanceReclassAdjustmentHistory"("sourceAccountId");
CREATE INDEX "FinanceBalanceReclassAdjustmentHistory_targetAccountId_idx" ON "FinanceBalanceReclassAdjustmentHistory"("targetAccountId");
ALTER TABLE "FinanceBalanceReclassAdjustmentHistory" ADD CONSTRAINT "FinanceBalanceReclassAdjustmentHistory_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceBalanceReclassAdjustmentHistory" ADD CONSTRAINT "FinanceBalanceReclassAdjustmentHistory_targetAccountId_fkey" FOREIGN KEY ("targetAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Workshop reports are product-grain facts, so they reference Product rather than a SKU.
ALTER TABLE "FinanceWorkshopReport" ADD COLUMN "productId" INTEGER;
CREATE INDEX "FinanceWorkshopReport_productId_idx" ON "FinanceWorkshopReport"("productId");
ALTER TABLE "FinanceWorkshopReport" ADD CONSTRAINT "FinanceWorkshopReport_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Future inventory counterparties use the shared legal-subject identity.
ALTER TABLE "InventoryDocument" ADD COLUMN "counterpartyPartyId" INTEGER;
CREATE INDEX "InventoryDocument_counterpartyPartyId_idx" ON "InventoryDocument"("counterpartyPartyId");
ALTER TABLE "InventoryDocument" ADD CONSTRAINT "InventoryDocument_counterpartyPartyId_fkey" FOREIGN KEY ("counterpartyPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- QC keeps employee-number/name snapshots and also stores the stable Employee reference.
ALTER TABLE "ProductionQcSignature" ADD COLUMN "signerEmployeeRefId" INTEGER;
CREATE INDEX "ProductionQcSignature_signerEmployeeRefId_idx" ON "ProductionQcSignature"("signerEmployeeRefId");
ALTER TABLE "ProductionQcSignature" ADD CONSTRAINT "ProductionQcSignature_signerEmployeeRefId_fkey" FOREIGN KEY ("signerEmployeeRefId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionQcAuditEvent" ADD COLUMN "actorEmployeeRefId" INTEGER;
CREATE INDEX "ProductionQcAuditEvent_actorEmployeeRefId_idx" ON "ProductionQcAuditEvent"("actorEmployeeRefId");
ALTER TABLE "ProductionQcAuditEvent" ADD CONSTRAINT "ProductionQcAuditEvent_actorEmployeeRefId_fkey" FOREIGN KEY ("actorEmployeeRefId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
