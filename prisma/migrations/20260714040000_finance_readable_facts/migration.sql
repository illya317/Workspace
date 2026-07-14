-- AlterTable
ALTER TABLE "FinanceAccount" ADD COLUMN     "sourceDatabase" TEXT,
ADD COLUMN     "sourceKey" TEXT,
ADD COLUMN     "sourceLedger" TEXT,
ADD COLUMN     "sourceSystem" TEXT;

-- AlterTable
ALTER TABLE "FinanceLedgerImport" ADD COLUMN     "batchKey" TEXT,
ADD COLUMN     "controlJson" JSONB,
ADD COLUMN     "cutoffDate" TEXT,
ADD COLUMN     "snapshotDate" TEXT,
ADD COLUMN     "sourceDatabase" TEXT,
ADD COLUMN     "sourceLedger" TEXT,
ADD COLUMN     "sourceSystem" TEXT;

-- AlterTable
ALTER TABLE "FinancePeriod" ADD COLUMN     "sourceClosed" BOOLEAN,
ADD COLUMN     "sourceDatabase" TEXT,
ADD COLUMN     "sourceKey" TEXT,
ADD COLUMN     "sourceSystem" TEXT;

-- AlterTable
ALTER TABLE "FinanceVoucher" ADD COLUMN     "importId" INTEGER,
ADD COLUMN     "sourceDatabase" TEXT,
ADD COLUMN     "sourceKey" TEXT,
ADD COLUMN     "sourceSystem" TEXT;

-- AlterTable
ALTER TABLE "FinanceVoucherItem" ADD COLUMN     "currencyCode" TEXT,
ADD COLUMN     "exchangeRate" DECIMAL(20,8),
ADD COLUMN     "originalCredit" DECIMAL(20,2),
ADD COLUMN     "originalDebit" DECIMAL(20,2),
ADD COLUMN     "sourceDatabase" TEXT,
ADD COLUMN     "sourceKey" TEXT,
ADD COLUMN     "sourceSystem" TEXT;

-- CreateTable
CREATE TABLE "FinanceCashFlowItem" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceLedger" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "parentId" INTEGER,
    "direction" TEXT,
    "firstYear" INTEGER,
    "lastYear" INTEGER,
    "latestImportId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCashFlowItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCashFlowAllocation" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "periodId" INTEGER NOT NULL,
    "voucherId" INTEGER NOT NULL,
    "cashFlowItemId" INTEGER NOT NULL,
    "ownerVoucherItemId" INTEGER,
    "counterpartItemId" INTEGER,
    "sourceSystem" TEXT NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCashFlowAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAuxiliaryMember" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceLedger" TEXT NOT NULL,
    "dimensionType" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "shortName" TEXT,
    "identityNumber" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "firstYear" INTEGER,
    "lastYear" INTEGER,
    "latestImportId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAuxiliaryMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceVoucherItemAuxiliary" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "sourceRole" TEXT NOT NULL,

    CONSTRAINT "FinanceVoucherItemAuxiliary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAuxiliaryBalance" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "openingDebit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "openingCredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currentDebit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currentCredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "closingDebit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "closingCredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAuxiliaryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAuxiliaryBalanceMember" (
    "id" SERIAL NOT NULL,
    "balanceId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "sourceRole" TEXT NOT NULL,

    CONSTRAINT "FinanceAuxiliaryBalanceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceOpenItem" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "periodId" INTEGER,
    "accountId" INTEGER,
    "voucherItemId" INTEGER,
    "sourceSystem" TEXT NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "documentNo" TEXT,
    "documentDate" TEXT,
    "dueDate" TEXT,
    "memo" TEXT,
    "currencyCode" TEXT,
    "originalDebit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "originalCredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "outstandingDebit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "outstandingCredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceOpenItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceOpenItemAuxiliary" (
    "id" SERIAL NOT NULL,
    "openItemId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "sourceRole" TEXT NOT NULL,

    CONSTRAINT "FinanceOpenItemAuxiliary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSourceAccountBalance" (
    "id" SERIAL NOT NULL,
    "importId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceDatabase" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "openingDebit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "openingCredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currentDebit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currentCredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "closingDebit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "closingCredit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceSourceAccountBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceCurrency" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceLedger" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "symbol" TEXT,
    "decimalDigits" INTEGER,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "latestImportId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceCurrency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceBankAccount" (
    "id" SERIAL NOT NULL,
    "companyCode" TEXT NOT NULL,
    "accountId" INTEGER,
    "sourceSystem" TEXT NOT NULL,
    "sourceLedger" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceCode" TEXT,
    "sourceName" TEXT NOT NULL,
    "accountNo" TEXT,
    "bankName" TEXT,
    "currencyCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "latestImportId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceCashFlowItem_parentId_idx" ON "FinanceCashFlowItem"("parentId");

-- CreateIndex
CREATE INDEX "FinanceCashFlowItem_latestImportId_idx" ON "FinanceCashFlowItem"("latestImportId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCashFlowItem_companyCode_sourceSystem_sourceLedger_s_key" ON "FinanceCashFlowItem"("companyCode", "sourceSystem", "sourceLedger", "sourceCode");

-- CreateIndex
CREATE INDEX "FinanceCashFlowAllocation_importId_idx" ON "FinanceCashFlowAllocation"("importId");

-- CreateIndex
CREATE INDEX "FinanceCashFlowAllocation_companyCode_periodId_cashFlowItem_idx" ON "FinanceCashFlowAllocation"("companyCode", "periodId", "cashFlowItemId");

-- CreateIndex
CREATE INDEX "FinanceCashFlowAllocation_voucherId_idx" ON "FinanceCashFlowAllocation"("voucherId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCashFlowAllocation_sourceSystem_sourceDatabase_sourc_key" ON "FinanceCashFlowAllocation"("sourceSystem", "sourceDatabase", "sourceKey");

-- CreateIndex
CREATE INDEX "FinanceAuxiliaryMember_companyCode_dimensionType_sourceName_idx" ON "FinanceAuxiliaryMember"("companyCode", "dimensionType", "sourceName");

-- CreateIndex
CREATE INDEX "FinanceAuxiliaryMember_latestImportId_idx" ON "FinanceAuxiliaryMember"("latestImportId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAuxiliaryMember_companyCode_sourceSystem_sourceLedge_key" ON "FinanceAuxiliaryMember"("companyCode", "sourceSystem", "sourceLedger", "dimensionType", "sourceCode");

-- CreateIndex
CREATE INDEX "FinanceVoucherItemAuxiliary_memberId_sourceRole_idx" ON "FinanceVoucherItemAuxiliary"("memberId", "sourceRole");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceVoucherItemAuxiliary_itemId_memberId_sourceRole_key" ON "FinanceVoucherItemAuxiliary"("itemId", "memberId", "sourceRole");

-- CreateIndex
CREATE INDEX "FinanceAuxiliaryBalance_importId_idx" ON "FinanceAuxiliaryBalance"("importId");

-- CreateIndex
CREATE INDEX "FinanceAuxiliaryBalance_companyCode_periodId_accountId_idx" ON "FinanceAuxiliaryBalance"("companyCode", "periodId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAuxiliaryBalance_sourceSystem_sourceDatabase_sourceK_key" ON "FinanceAuxiliaryBalance"("sourceSystem", "sourceDatabase", "sourceKey");

-- CreateIndex
CREATE INDEX "FinanceAuxiliaryBalanceMember_memberId_sourceRole_idx" ON "FinanceAuxiliaryBalanceMember"("memberId", "sourceRole");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAuxiliaryBalanceMember_balanceId_memberId_sourceRole_key" ON "FinanceAuxiliaryBalanceMember"("balanceId", "memberId", "sourceRole");

-- CreateIndex
CREATE INDEX "FinanceOpenItem_importId_idx" ON "FinanceOpenItem"("importId");

-- CreateIndex
CREATE INDEX "FinanceOpenItem_companyCode_status_documentDate_idx" ON "FinanceOpenItem"("companyCode", "status", "documentDate");

-- CreateIndex
CREATE INDEX "FinanceOpenItem_accountId_status_idx" ON "FinanceOpenItem"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceOpenItem_sourceSystem_sourceDatabase_sourceKey_key" ON "FinanceOpenItem"("sourceSystem", "sourceDatabase", "sourceKey");

-- CreateIndex
CREATE INDEX "FinanceOpenItemAuxiliary_memberId_sourceRole_idx" ON "FinanceOpenItemAuxiliary"("memberId", "sourceRole");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceOpenItemAuxiliary_openItemId_memberId_sourceRole_key" ON "FinanceOpenItemAuxiliary"("openItemId", "memberId", "sourceRole");

-- CreateIndex
CREATE INDEX "FinanceSourceAccountBalance_importId_idx" ON "FinanceSourceAccountBalance"("importId");

-- CreateIndex
CREATE INDEX "FinanceSourceAccountBalance_companyCode_periodId_accountId_idx" ON "FinanceSourceAccountBalance"("companyCode", "periodId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSourceAccountBalance_sourceSystem_sourceDatabase_sou_key" ON "FinanceSourceAccountBalance"("sourceSystem", "sourceDatabase", "sourceKey");

-- CreateIndex
CREATE INDEX "FinanceCurrency_latestImportId_idx" ON "FinanceCurrency"("latestImportId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCurrency_companyCode_sourceSystem_sourceLedger_sourc_key" ON "FinanceCurrency"("companyCode", "sourceSystem", "sourceLedger", "sourceCode");

-- CreateIndex
CREATE INDEX "FinanceBankAccount_accountId_idx" ON "FinanceBankAccount"("accountId");

-- CreateIndex
CREATE INDEX "FinanceBankAccount_latestImportId_idx" ON "FinanceBankAccount"("latestImportId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBankAccount_companyCode_sourceSystem_sourceLedger_so_key" ON "FinanceBankAccount"("companyCode", "sourceSystem", "sourceLedger", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccount_sourceSystem_sourceDatabase_sourceKey_key" ON "FinanceAccount"("sourceSystem", "sourceDatabase", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceLedgerImport_batchKey_key" ON "FinanceLedgerImport"("batchKey");

-- CreateIndex
CREATE INDEX "FinanceLedgerImport_sourceSystem_sourceLedger_year_idx" ON "FinanceLedgerImport"("sourceSystem", "sourceLedger", "year");

-- CreateIndex
CREATE INDEX "FinanceVoucher_importId_idx" ON "FinanceVoucher"("importId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceVoucher_sourceSystem_sourceDatabase_sourceKey_key" ON "FinanceVoucher"("sourceSystem", "sourceDatabase", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceVoucherItem_sourceSystem_sourceDatabase_sourceKey_key" ON "FinanceVoucherItem"("sourceSystem", "sourceDatabase", "sourceKey");

-- AddForeignKey
ALTER TABLE "FinanceCashFlowItem" ADD CONSTRAINT "FinanceCashFlowItem_latestImportId_fkey" FOREIGN KEY ("latestImportId") REFERENCES "FinanceLedgerImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashFlowItem" ADD CONSTRAINT "FinanceCashFlowItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FinanceCashFlowItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashFlowAllocation" ADD CONSTRAINT "FinanceCashFlowAllocation_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashFlowAllocation" ADD CONSTRAINT "FinanceCashFlowAllocation_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashFlowAllocation" ADD CONSTRAINT "FinanceCashFlowAllocation_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "FinanceVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashFlowAllocation" ADD CONSTRAINT "FinanceCashFlowAllocation_cashFlowItemId_fkey" FOREIGN KEY ("cashFlowItemId") REFERENCES "FinanceCashFlowItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashFlowAllocation" ADD CONSTRAINT "FinanceCashFlowAllocation_ownerVoucherItemId_fkey" FOREIGN KEY ("ownerVoucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCashFlowAllocation" ADD CONSTRAINT "FinanceCashFlowAllocation_counterpartItemId_fkey" FOREIGN KEY ("counterpartItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAuxiliaryMember" ADD CONSTRAINT "FinanceAuxiliaryMember_latestImportId_fkey" FOREIGN KEY ("latestImportId") REFERENCES "FinanceLedgerImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceVoucherItemAuxiliary" ADD CONSTRAINT "FinanceVoucherItemAuxiliary_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceVoucherItemAuxiliary" ADD CONSTRAINT "FinanceVoucherItemAuxiliary_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "FinanceAuxiliaryMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAuxiliaryBalance" ADD CONSTRAINT "FinanceAuxiliaryBalance_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAuxiliaryBalance" ADD CONSTRAINT "FinanceAuxiliaryBalance_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAuxiliaryBalance" ADD CONSTRAINT "FinanceAuxiliaryBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAuxiliaryBalanceMember" ADD CONSTRAINT "FinanceAuxiliaryBalanceMember_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "FinanceAuxiliaryBalance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAuxiliaryBalanceMember" ADD CONSTRAINT "FinanceAuxiliaryBalanceMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "FinanceAuxiliaryMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOpenItem" ADD CONSTRAINT "FinanceOpenItem_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOpenItem" ADD CONSTRAINT "FinanceOpenItem_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOpenItem" ADD CONSTRAINT "FinanceOpenItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOpenItem" ADD CONSTRAINT "FinanceOpenItem_voucherItemId_fkey" FOREIGN KEY ("voucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOpenItemAuxiliary" ADD CONSTRAINT "FinanceOpenItemAuxiliary_openItemId_fkey" FOREIGN KEY ("openItemId") REFERENCES "FinanceOpenItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOpenItemAuxiliary" ADD CONSTRAINT "FinanceOpenItemAuxiliary_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "FinanceAuxiliaryMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSourceAccountBalance" ADD CONSTRAINT "FinanceSourceAccountBalance_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSourceAccountBalance" ADD CONSTRAINT "FinanceSourceAccountBalance_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSourceAccountBalance" ADD CONSTRAINT "FinanceSourceAccountBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceVoucher" ADD CONSTRAINT "FinanceVoucher_importId_fkey" FOREIGN KEY ("importId") REFERENCES "FinanceLedgerImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceCurrency" ADD CONSTRAINT "FinanceCurrency_latestImportId_fkey" FOREIGN KEY ("latestImportId") REFERENCES "FinanceLedgerImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankAccount" ADD CONSTRAINT "FinanceBankAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceBankAccount" ADD CONSTRAINT "FinanceBankAccount_latestImportId_fkey" FOREIGN KEY ("latestImportId") REFERENCES "FinanceLedgerImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
