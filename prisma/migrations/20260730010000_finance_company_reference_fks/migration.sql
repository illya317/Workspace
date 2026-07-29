-- workspace:migration-mode=maintenance
-- AddForeignKey
ALTER TABLE "FinanceStatementSourcePackage" ADD CONSTRAINT "FinanceStatementSourcePackage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationBatch" ADD CONSTRAINT "FinanceConsolidationBatch_parentCompanyId_fkey" FOREIGN KEY ("parentCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "FinanceConsolidationEntitySnapshot_companyId_idx" ON "FinanceConsolidationEntitySnapshot"("companyId");

-- CreateIndex
CREATE INDEX "FinanceConsolidationEntitySnapshot_directParentCompanyId_idx" ON "FinanceConsolidationEntitySnapshot"("directParentCompanyId");

-- AddForeignKey
ALTER TABLE "FinanceConsolidationEntitySnapshot" ADD CONSTRAINT "FinanceConsolidationEntitySnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationEntitySnapshot" ADD CONSTRAINT "FinanceConsolidationEntitySnapshot_directParentCompanyId_fkey" FOREIGN KEY ("directParentCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "FinanceConsolidationEntryLine_companyId_idx" ON "FinanceConsolidationEntryLine"("companyId");

-- CreateIndex
CREATE INDEX "FinanceConsolidationEntryLine_counterpartyCompanyId_idx" ON "FinanceConsolidationEntryLine"("counterpartyCompanyId");

-- AddForeignKey
ALTER TABLE "FinanceConsolidationEntryLine" ADD CONSTRAINT "FinanceConsolidationEntryLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationEntryLine" ADD CONSTRAINT "FinanceConsolidationEntryLine_counterpartyCompanyId_fkey" FOREIGN KEY ("counterpartyCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "FinanceConsolidationScopeSelection_companyId_idx" ON "FinanceConsolidationScopeSelection"("companyId");

-- AddForeignKey
ALTER TABLE "FinanceConsolidationScopeSelection" ADD CONSTRAINT "FinanceConsolidationScopeSelection_parentCompanyId_fkey" FOREIGN KEY ("parentCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConsolidationScopeSelection" ADD CONSTRAINT "FinanceConsolidationScopeSelection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
