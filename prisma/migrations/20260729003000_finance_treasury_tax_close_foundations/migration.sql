-- workspace:migration-mode=maintenance
-- Finance Treasury, Tax and Close schema foundations. This migration contains no tenant data.

ALTER TABLE "FinanceBankAccount"
  ADD COLUMN "companyId" INTEGER,
  ADD COLUMN "identityKey" TEXT,
  ADD COLUMN "openedOn" DATE,
  ADD COLUMN "closedOn" DATE,
  ADD COLUMN "sourceKind" TEXT,
  ADD COLUMN "sourceReleaseId" TEXT,
  ADD COLUMN "sourceSha256" TEXT,
  ADD COLUMN "sourceFile" TEXT,
  ADD COLUMN "sourceSheet" TEXT,
  ADD COLUMN "sourceRow" INTEGER,
  ADD COLUMN "sourceRange" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "FinanceLoan" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "lenderPartyId" INTEGER NOT NULL,
  "identityKey" TEXT NOT NULL,
  "loanNo" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "currencyCode" VARCHAR(3) NOT NULL,
  "contractPrincipalAmount" DECIMAL(20,2) NOT NULL,
  "startOn" DATE NOT NULL,
  "endOn" DATE,
  "status" TEXT NOT NULL DEFAULT 'active',
  "note" TEXT,
  "sourceKind" TEXT,
  "sourceReleaseId" TEXT,
  "sourceSha256" TEXT,
  "sourceFile" TEXT,
  "sourceSheet" TEXT,
  "sourceRow" INTEGER,
  "sourceRange" TEXT,
  "sourceKey" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceLoan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceLoanRateTerm" (
  "id" SERIAL NOT NULL,
  "loanId" INTEGER NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveThrough" DATE,
  "annualRate" DECIMAL(18,10) NOT NULL,
  "spreadRate" DECIMAL(18,10),
  "rateKind" TEXT NOT NULL DEFAULT 'fixed',
  "benchmark" TEXT,
  "dayCountConvention" TEXT NOT NULL DEFAULT 'actual_365',
  "sourceKind" TEXT,
  "sourceReleaseId" TEXT,
  "sourceSha256" TEXT,
  "sourceFile" TEXT,
  "sourceSheet" TEXT,
  "sourceRow" INTEGER,
  "sourceRange" TEXT,
  "sourceKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceLoanRateTerm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceLoanPrincipalEvent" (
  "id" SERIAL NOT NULL,
  "loanId" INTEGER NOT NULL,
  "voucherItemId" INTEGER,
  "eventKind" TEXT NOT NULL,
  "occurredOn" DATE NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "referenceNo" TEXT,
  "note" TEXT,
  "reversesEventId" INTEGER,
  "idempotencyKey" TEXT NOT NULL,
  "sourceKind" TEXT,
  "sourceReleaseId" TEXT,
  "sourceSha256" TEXT,
  "sourceFile" TEXT,
  "sourceSheet" TEXT,
  "sourceRow" INTEGER,
  "sourceRange" TEXT,
  "sourceKey" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceLoanPrincipalEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceBankReconciliation" (
  "id" SERIAL NOT NULL,
  "bankAccountId" INTEGER NOT NULL,
  "periodId" INTEGER NOT NULL,
  "statementDate" DATE NOT NULL,
  "statementEndingBalance" DECIMAL(20,2) NOT NULL,
  "ledgerEndingBalance" DECIMAL(20,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "conclusion" TEXT,
  "evidenceRef" TEXT,
  "sourceKind" TEXT,
  "sourceReleaseId" TEXT,
  "sourceSha256" TEXT,
  "sourceFile" TEXT,
  "sourceSheet" TEXT,
  "sourceRow" INTEGER,
  "sourceRange" TEXT,
  "sourceKey" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceBankReconciliation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceBankReconciliationItem" (
  "id" SERIAL NOT NULL,
  "reconciliationId" INTEGER NOT NULL,
  "voucherItemId" INTEGER,
  "itemKind" TEXT NOT NULL,
  "occurredOn" DATE,
  "referenceNo" TEXT,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "clearedOn" DATE,
  "status" TEXT NOT NULL DEFAULT 'open',
  "sourceKind" TEXT,
  "sourceReleaseId" TEXT,
  "sourceSha256" TEXT,
  "sourceFile" TEXT,
  "sourceSheet" TEXT,
  "sourceRow" INTEGER,
  "sourceRange" TEXT,
  "sourceKey" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceBankReconciliationItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceInterestWorkpaper" (
  "id" SERIAL NOT NULL,
  "loanId" INTEGER NOT NULL,
  "periodId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "calculationVersion" TEXT NOT NULL,
  "inputFingerprint" TEXT NOT NULL,
  "note" TEXT,
  "sourceKind" TEXT,
  "sourceReleaseId" TEXT,
  "sourceSha256" TEXT,
  "sourceFile" TEXT,
  "sourceSheet" TEXT,
  "sourceRow" INTEGER,
  "sourceRange" TEXT,
  "sourceKey" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceInterestWorkpaper_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceInterestWorkpaperLine" (
  "id" SERIAL NOT NULL,
  "workpaperId" INTEGER NOT NULL,
  "lineNo" INTEGER NOT NULL,
  "accrualFrom" DATE NOT NULL,
  "accrualThrough" DATE NOT NULL,
  "principalBasis" DECIMAL(20,2) NOT NULL,
  "annualRate" DECIMAL(18,10) NOT NULL,
  "dayCount" INTEGER NOT NULL,
  "sourceReportedInterestAmount" DECIMAL(20,2),
  "note" TEXT,
  "sourceKind" TEXT,
  "sourceReleaseId" TEXT,
  "sourceSha256" TEXT,
  "sourceFile" TEXT,
  "sourceSheet" TEXT,
  "sourceRow" INTEGER,
  "sourceRange" TEXT,
  "sourceKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceInterestWorkpaperLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceInterestVoucherLink" (
  "id" SERIAL NOT NULL,
  "workpaperId" INTEGER NOT NULL,
  "voucherItemId" INTEGER NOT NULL,
  "linkKind" TEXT NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "note" TEXT,
  "sourceKind" TEXT,
  "sourceReleaseId" TEXT,
  "sourceSha256" TEXT,
  "sourceFile" TEXT,
  "sourceSheet" TEXT,
  "sourceRow" INTEGER,
  "sourceRange" TEXT,
  "sourceKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceInterestVoucherLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceTaxType" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "jurisdiction" TEXT NOT NULL,
  "calculationMethod" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sourceKind" TEXT,
  "sourceReleaseId" TEXT,
  "sourceSha256" TEXT,
  "sourceFile" TEXT,
  "sourceSheet" TEXT,
  "sourceRow" INTEGER,
  "sourceRange" TEXT,
  "sourceKey" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceTaxType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceTaxRegistration" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "taxTypeId" INTEGER NOT NULL,
  "authorityPartyId" INTEGER,
  "registrationNo" TEXT NOT NULL,
  "jurisdiction" TEXT NOT NULL,
  "filingFrequency" TEXT NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveThrough" DATE,
  "status" TEXT NOT NULL DEFAULT 'active',
  "sourceKind" TEXT,
  "sourceReleaseId" TEXT,
  "sourceSha256" TEXT,
  "sourceFile" TEXT,
  "sourceSheet" TEXT,
  "sourceRow" INTEGER,
  "sourceRange" TEXT,
  "sourceKey" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceTaxRegistration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceTaxWorkpaper" (
  "id" SERIAL NOT NULL,
  "registrationId" INTEGER NOT NULL,
  "periodId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "calculationVersion" TEXT NOT NULL,
  "inputFingerprint" TEXT NOT NULL,
  "note" TEXT,
  "sourceKind" TEXT,
  "sourceReleaseId" TEXT,
  "sourceSha256" TEXT,
  "sourceFile" TEXT,
  "sourceSheet" TEXT,
  "sourceRow" INTEGER,
  "sourceRange" TEXT,
  "sourceKey" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceTaxWorkpaper_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceTaxAccrualLine" (
  "id" SERIAL NOT NULL,
  "workpaperId" INTEGER NOT NULL,
  "voucherItemId" INTEGER,
  "lineNo" INTEGER NOT NULL,
  "recognitionOn" DATE,
  "description" TEXT NOT NULL,
  "taxBaseAmount" DECIMAL(20,2),
  "taxRate" DECIMAL(18,10),
  "quantity" DECIMAL(20,6),
  "unitRate" DECIMAL(20,6),
  "divisor" DECIMAL(20,6),
  "sourceReportedTaxAmount" DECIMAL(20,2),
  "sourceKind" TEXT,
  "sourceReleaseId" TEXT,
  "sourceSha256" TEXT,
  "sourceFile" TEXT,
  "sourceSheet" TEXT,
  "sourceRow" INTEGER,
  "sourceRange" TEXT,
  "sourceKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceTaxAccrualLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceTaxFiling" (
  "id" SERIAL NOT NULL,
  "registrationId" INTEGER NOT NULL,
  "periodId" INTEGER NOT NULL,
  "filingReference" TEXT,
  "filedOn" DATE,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "currencyCode" VARCHAR(3) NOT NULL,
  "sourceReportedDeclaredAmount" DECIMAL(20,2),
  "sourceReportedPayableAmount" DECIMAL(20,2),
  "note" TEXT,
  "sourceKind" TEXT,
  "sourceReleaseId" TEXT,
  "sourceSha256" TEXT,
  "sourceFile" TEXT,
  "sourceSheet" TEXT,
  "sourceRow" INTEGER,
  "sourceRange" TEXT,
  "sourceKey" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceTaxFiling_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceTaxPayment" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "paymentKind" TEXT NOT NULL DEFAULT 'payment',
  "paidOn" DATE NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "currencyCode" VARCHAR(3) NOT NULL,
  "paymentReference" TEXT,
  "note" TEXT,
  "reversesPaymentId" INTEGER,
  "idempotencyKey" TEXT NOT NULL,
  "sourceKind" TEXT,
  "sourceReleaseId" TEXT,
  "sourceSha256" TEXT,
  "sourceFile" TEXT,
  "sourceSheet" TEXT,
  "sourceRow" INTEGER,
  "sourceRange" TEXT,
  "sourceKey" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceTaxPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceTaxPaymentAllocation" (
  "id" SERIAL NOT NULL,
  "paymentId" INTEGER NOT NULL,
  "filingId" INTEGER NOT NULL,
  "voucherItemId" INTEGER,
  "allocatedAmount" DECIMAL(20,2) NOT NULL,
  "sourceKind" TEXT,
  "sourceReleaseId" TEXT,
  "sourceSha256" TEXT,
  "sourceFile" TEXT,
  "sourceSheet" TEXT,
  "sourceRow" INTEGER,
  "sourceRange" TEXT,
  "sourceKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceTaxPaymentAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceTaxReconciliationSnapshot" (
  "id" SERIAL NOT NULL,
  "registrationId" INTEGER NOT NULL,
  "periodId" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "inputFingerprint" TEXT NOT NULL,
  "payloadSha256" TEXT NOT NULL,
  "contributorVersion" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceTaxReconciliationSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceCloseRun" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "periodId" INTEGER NOT NULL,
  "startedByUserId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceCloseRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceCloseTask" (
  "id" SERIAL NOT NULL,
  "runId" INTEGER NOT NULL,
  "taskKey" TEXT NOT NULL,
  "contributorKey" TEXT NOT NULL,
  "assigneeEmployeeId" INTEGER,
  "ownerResourceKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "contributorVersion" TEXT,
  "inputFingerprint" TEXT,
  "deepLink" TEXT NOT NULL,
  "inspectedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceCloseTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceCloseEvidenceSnapshot" (
  "id" SERIAL NOT NULL,
  "taskId" INTEGER NOT NULL,
  "inputFingerprint" TEXT NOT NULL,
  "payloadSha256" TEXT NOT NULL,
  "contributorVersion" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceCloseEvidenceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceCloseEvent" (
  "id" SERIAL NOT NULL,
  "runId" INTEGER NOT NULL,
  "taskId" INTEGER,
  "evidenceSnapshotId" INTEGER,
  "actorUserId" INTEGER NOT NULL,
  "eventKind" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "reason" TEXT,
  "reversesEventId" INTEGER,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceCloseEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceBankAccount_identityKey_key" ON "FinanceBankAccount"("identityKey");
CREATE INDEX "FinanceBankAccount_companyId_isActive_idx" ON "FinanceBankAccount"("companyId", "isActive");

CREATE UNIQUE INDEX "FinanceLoan_identityKey_key" ON "FinanceLoan"("identityKey");
CREATE UNIQUE INDEX "FinanceLoan_companyId_loanNo_key" ON "FinanceLoan"("companyId", "loanNo");
CREATE UNIQUE INDEX "FinanceLoan_sourceReleaseId_sourceKey_key" ON "FinanceLoan"("sourceReleaseId", "sourceKey");
CREATE INDEX "FinanceLoan_companyId_status_endOn_idx" ON "FinanceLoan"("companyId", "status", "endOn");
CREATE INDEX "FinanceLoan_lenderPartyId_idx" ON "FinanceLoan"("lenderPartyId");

CREATE UNIQUE INDEX "FinanceLoanRateTerm_loanId_effectiveFrom_key" ON "FinanceLoanRateTerm"("loanId", "effectiveFrom");
CREATE UNIQUE INDEX "FinanceLoanRateTerm_sourceReleaseId_sourceKey_key" ON "FinanceLoanRateTerm"("sourceReleaseId", "sourceKey");
CREATE INDEX "FinanceLoanRateTerm_loanId_effectiveThrough_idx" ON "FinanceLoanRateTerm"("loanId", "effectiveThrough");

CREATE UNIQUE INDEX "FinanceLoanPrincipalEvent_reversesEventId_key" ON "FinanceLoanPrincipalEvent"("reversesEventId");
CREATE UNIQUE INDEX "FinanceLoanPrincipalEvent_idempotencyKey_key" ON "FinanceLoanPrincipalEvent"("idempotencyKey");
CREATE UNIQUE INDEX "FinanceLoanPrincipalEvent_sourceReleaseId_sourceKey_key" ON "FinanceLoanPrincipalEvent"("sourceReleaseId", "sourceKey");
CREATE INDEX "FinanceLoanPrincipalEvent_loanId_occurredOn_recordedAt_idx" ON "FinanceLoanPrincipalEvent"("loanId", "occurredOn", "recordedAt");
CREATE INDEX "FinanceLoanPrincipalEvent_voucherItemId_idx" ON "FinanceLoanPrincipalEvent"("voucherItemId");

CREATE UNIQUE INDEX "FinanceBankReconciliation_bankAccountId_periodId_key" ON "FinanceBankReconciliation"("bankAccountId", "periodId");
CREATE UNIQUE INDEX "FinanceBankReconciliation_sourceReleaseId_sourceKey_key" ON "FinanceBankReconciliation"("sourceReleaseId", "sourceKey");
CREATE INDEX "FinanceBankReconciliation_periodId_status_idx" ON "FinanceBankReconciliation"("periodId", "status");

CREATE UNIQUE INDEX "FinanceBankReconciliationItem_sourceReleaseId_sourceKey_key" ON "FinanceBankReconciliationItem"("sourceReleaseId", "sourceKey");
CREATE INDEX "FinanceBankReconciliationItem_reconciliationId_status_idx" ON "FinanceBankReconciliationItem"("reconciliationId", "status");
CREATE INDEX "FinanceBankReconciliationItem_voucherItemId_idx" ON "FinanceBankReconciliationItem"("voucherItemId");

CREATE UNIQUE INDEX "FinanceInterestWorkpaper_loanId_periodId_key" ON "FinanceInterestWorkpaper"("loanId", "periodId");
CREATE UNIQUE INDEX "FinanceInterestWorkpaper_sourceReleaseId_sourceKey_key" ON "FinanceInterestWorkpaper"("sourceReleaseId", "sourceKey");
CREATE INDEX "FinanceInterestWorkpaper_periodId_status_idx" ON "FinanceInterestWorkpaper"("periodId", "status");

CREATE UNIQUE INDEX "FinanceInterestWorkpaperLine_workpaperId_lineNo_key" ON "FinanceInterestWorkpaperLine"("workpaperId", "lineNo");
CREATE UNIQUE INDEX "FinanceInterestWorkpaperLine_sourceReleaseId_sourceKey_key" ON "FinanceInterestWorkpaperLine"("sourceReleaseId", "sourceKey");
CREATE INDEX "FinanceInterestLine_workpaper_period_idx" ON "FinanceInterestWorkpaperLine"("workpaperId", "accrualFrom", "accrualThrough");

CREATE UNIQUE INDEX "FinanceInterestVoucher_workpaper_item_kind_key" ON "FinanceInterestVoucherLink"("workpaperId", "voucherItemId", "linkKind");
CREATE UNIQUE INDEX "FinanceInterestVoucherLink_sourceReleaseId_sourceKey_key" ON "FinanceInterestVoucherLink"("sourceReleaseId", "sourceKey");
CREATE INDEX "FinanceInterestVoucherLink_voucherItemId_idx" ON "FinanceInterestVoucherLink"("voucherItemId");

CREATE UNIQUE INDEX "FinanceTaxType_code_key" ON "FinanceTaxType"("code");
CREATE UNIQUE INDEX "FinanceTaxType_sourceReleaseId_sourceKey_key" ON "FinanceTaxType"("sourceReleaseId", "sourceKey");
CREATE INDEX "FinanceTaxType_jurisdiction_isActive_idx" ON "FinanceTaxType"("jurisdiction", "isActive");

CREATE UNIQUE INDEX "FinanceTaxRegistration_companyId_taxTypeId_registrationNo_key" ON "FinanceTaxRegistration"("companyId", "taxTypeId", "registrationNo");
CREATE UNIQUE INDEX "FinanceTaxRegistration_sourceReleaseId_sourceKey_key" ON "FinanceTaxRegistration"("sourceReleaseId", "sourceKey");
CREATE INDEX "FinanceTaxRegistration_companyId_status_effectiveThrough_idx" ON "FinanceTaxRegistration"("companyId", "status", "effectiveThrough");
CREATE INDEX "FinanceTaxRegistration_taxTypeId_idx" ON "FinanceTaxRegistration"("taxTypeId");
CREATE INDEX "FinanceTaxRegistration_authorityPartyId_idx" ON "FinanceTaxRegistration"("authorityPartyId");

CREATE UNIQUE INDEX "FinanceTaxWorkpaper_registrationId_periodId_key" ON "FinanceTaxWorkpaper"("registrationId", "periodId");
CREATE UNIQUE INDEX "FinanceTaxWorkpaper_sourceReleaseId_sourceKey_key" ON "FinanceTaxWorkpaper"("sourceReleaseId", "sourceKey");
CREATE INDEX "FinanceTaxWorkpaper_periodId_status_idx" ON "FinanceTaxWorkpaper"("periodId", "status");

CREATE UNIQUE INDEX "FinanceTaxAccrualLine_workpaperId_lineNo_key" ON "FinanceTaxAccrualLine"("workpaperId", "lineNo");
CREATE UNIQUE INDEX "FinanceTaxAccrualLine_sourceReleaseId_sourceKey_key" ON "FinanceTaxAccrualLine"("sourceReleaseId", "sourceKey");
CREATE INDEX "FinanceTaxAccrualLine_voucherItemId_idx" ON "FinanceTaxAccrualLine"("voucherItemId");

CREATE UNIQUE INDEX "FinanceTaxFiling_registrationId_periodId_key" ON "FinanceTaxFiling"("registrationId", "periodId");
CREATE UNIQUE INDEX "FinanceTaxFiling_sourceReleaseId_sourceKey_key" ON "FinanceTaxFiling"("sourceReleaseId", "sourceKey");
CREATE INDEX "FinanceTaxFiling_periodId_status_idx" ON "FinanceTaxFiling"("periodId", "status");

CREATE UNIQUE INDEX "FinanceTaxPayment_reversesPaymentId_key" ON "FinanceTaxPayment"("reversesPaymentId");
CREATE UNIQUE INDEX "FinanceTaxPayment_idempotencyKey_key" ON "FinanceTaxPayment"("idempotencyKey");
CREATE UNIQUE INDEX "FinanceTaxPayment_sourceReleaseId_sourceKey_key" ON "FinanceTaxPayment"("sourceReleaseId", "sourceKey");
CREATE INDEX "FinanceTaxPayment_companyId_paidOn_idx" ON "FinanceTaxPayment"("companyId", "paidOn");

CREATE UNIQUE INDEX "FinanceTaxPaymentAllocation_paymentId_filingId_key" ON "FinanceTaxPaymentAllocation"("paymentId", "filingId");
CREATE UNIQUE INDEX "FinanceTaxPaymentAllocation_sourceReleaseId_sourceKey_key" ON "FinanceTaxPaymentAllocation"("sourceReleaseId", "sourceKey");
CREATE INDEX "FinanceTaxPaymentAllocation_filingId_idx" ON "FinanceTaxPaymentAllocation"("filingId");
CREATE INDEX "FinanceTaxPaymentAllocation_voucherItemId_idx" ON "FinanceTaxPaymentAllocation"("voucherItemId");

CREATE UNIQUE INDEX "FinanceTaxRecon_registration_period_input_key" ON "FinanceTaxReconciliationSnapshot"("registrationId", "periodId", "inputFingerprint");
CREATE INDEX "FinanceTaxReconciliationSnapshot_periodId_status_capturedAt_idx" ON "FinanceTaxReconciliationSnapshot"("periodId", "status", "capturedAt");
CREATE INDEX "FinanceTaxReconciliationSnapshot_payloadSha256_idx" ON "FinanceTaxReconciliationSnapshot"("payloadSha256");

CREATE UNIQUE INDEX "FinanceCloseRun_companyId_periodId_key" ON "FinanceCloseRun"("companyId", "periodId");
CREATE INDEX "FinanceCloseRun_periodId_status_idx" ON "FinanceCloseRun"("periodId", "status");
CREATE INDEX "FinanceCloseRun_startedByUserId_idx" ON "FinanceCloseRun"("startedByUserId");

CREATE UNIQUE INDEX "FinanceCloseTask_runId_taskKey_key" ON "FinanceCloseTask"("runId", "taskKey");
CREATE INDEX "FinanceCloseTask_runId_status_idx" ON "FinanceCloseTask"("runId", "status");
CREATE INDEX "FinanceCloseTask_contributorKey_idx" ON "FinanceCloseTask"("contributorKey");
CREATE INDEX "FinanceCloseTask_assigneeEmployeeId_idx" ON "FinanceCloseTask"("assigneeEmployeeId");
CREATE INDEX "FinanceCloseTask_ownerResourceKey_idx" ON "FinanceCloseTask"("ownerResourceKey");

CREATE UNIQUE INDEX "FinanceCloseEvidence_task_input_version_key" ON "FinanceCloseEvidenceSnapshot"("taskId", "inputFingerprint", "contributorVersion");
CREATE INDEX "FinanceCloseEvidenceSnapshot_payloadSha256_idx" ON "FinanceCloseEvidenceSnapshot"("payloadSha256");
CREATE INDEX "FinanceCloseEvidenceSnapshot_capturedAt_idx" ON "FinanceCloseEvidenceSnapshot"("capturedAt");

CREATE UNIQUE INDEX "FinanceCloseEvent_reversesEventId_key" ON "FinanceCloseEvent"("reversesEventId");
CREATE UNIQUE INDEX "FinanceCloseEvent_idempotencyKey_key" ON "FinanceCloseEvent"("idempotencyKey");
CREATE INDEX "FinanceCloseEvent_runId_recordedAt_idx" ON "FinanceCloseEvent"("runId", "recordedAt");
CREATE INDEX "FinanceCloseEvent_taskId_recordedAt_idx" ON "FinanceCloseEvent"("taskId", "recordedAt");
CREATE INDEX "FinanceCloseEvent_evidenceSnapshotId_idx" ON "FinanceCloseEvent"("evidenceSnapshotId");
CREATE INDEX "FinanceCloseEvent_actorUserId_idx" ON "FinanceCloseEvent"("actorUserId");

ALTER TABLE "FinanceBankAccount"
  ADD CONSTRAINT "FinanceBankAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceBankAccount_open_period_check" CHECK ("closedOn" IS NULL OR "openedOn" IS NULL OR "closedOn" >= "openedOn"),
  ADD CONSTRAINT "FinanceBankAccount_version_check" CHECK ("version" >= 1);

ALTER TABLE "FinanceLoan"
  ADD CONSTRAINT "FinanceLoan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceLoan_lenderPartyId_fkey" FOREIGN KEY ("lenderPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceLoan_period_check" CHECK ("endOn" IS NULL OR "endOn" >= "startOn"),
  ADD CONSTRAINT "FinanceLoan_principal_check" CHECK ("contractPrincipalAmount" >= 0),
  ADD CONSTRAINT "FinanceLoan_currency_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "FinanceLoan_version_check" CHECK ("version" >= 1);

ALTER TABLE "FinanceLoanRateTerm"
  ADD CONSTRAINT "FinanceLoanRateTerm_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "FinanceLoan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceLoanRateTerm_period_check" CHECK ("effectiveThrough" IS NULL OR "effectiveThrough" >= "effectiveFrom");

ALTER TABLE "FinanceLoanPrincipalEvent"
  ADD CONSTRAINT "FinanceLoanPrincipalEvent_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "FinanceLoan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceLoanPrincipalEvent_voucherItemId_fkey" FOREIGN KEY ("voucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceLoanPrincipalEvent_reversesEventId_fkey" FOREIGN KEY ("reversesEventId") REFERENCES "FinanceLoanPrincipalEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceLoanPrincipalEvent_amount_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "FinanceLoanPrincipalEvent_reversal_check" CHECK (("eventKind" = 'reversal' AND "reversesEventId" IS NOT NULL) OR ("eventKind" <> 'reversal' AND "reversesEventId" IS NULL));

ALTER TABLE "FinanceBankReconciliation"
  ADD CONSTRAINT "FinanceBankReconciliation_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "FinanceBankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceBankReconciliation_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceBankReconciliation_version_check" CHECK ("version" >= 1);

ALTER TABLE "FinanceBankReconciliationItem"
  ADD CONSTRAINT "FinanceBankReconciliationItem_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "FinanceBankReconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceBankReconciliationItem_voucherItemId_fkey" FOREIGN KEY ("voucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceBankReconciliationItem_clear_date_check" CHECK ("clearedOn" IS NULL OR "occurredOn" IS NULL OR "clearedOn" >= "occurredOn"),
  ADD CONSTRAINT "FinanceBankReconciliationItem_version_check" CHECK ("version" >= 1);

ALTER TABLE "FinanceInterestWorkpaper"
  ADD CONSTRAINT "FinanceInterestWorkpaper_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "FinanceLoan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceInterestWorkpaper_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceInterestWorkpaper_version_check" CHECK ("version" >= 1);

ALTER TABLE "FinanceInterestWorkpaperLine"
  ADD CONSTRAINT "FinanceInterestWorkpaperLine_workpaperId_fkey" FOREIGN KEY ("workpaperId") REFERENCES "FinanceInterestWorkpaper"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceInterestWorkpaperLine_period_check" CHECK ("accrualThrough" >= "accrualFrom"),
  ADD CONSTRAINT "FinanceInterestWorkpaperLine_day_count_check" CHECK ("dayCount" >= 0);

ALTER TABLE "FinanceInterestVoucherLink"
  ADD CONSTRAINT "FinanceInterestVoucherLink_workpaperId_fkey" FOREIGN KEY ("workpaperId") REFERENCES "FinanceInterestWorkpaper"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceInterestVoucherLink_voucherItemId_fkey" FOREIGN KEY ("voucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceTaxType"
  ADD CONSTRAINT "FinanceTaxType_version_check" CHECK ("version" >= 1);

ALTER TABLE "FinanceTaxRegistration"
  ADD CONSTRAINT "FinanceTaxRegistration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceTaxRegistration_taxTypeId_fkey" FOREIGN KEY ("taxTypeId") REFERENCES "FinanceTaxType"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceTaxRegistration_authorityPartyId_fkey" FOREIGN KEY ("authorityPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceTaxRegistration_period_check" CHECK ("effectiveThrough" IS NULL OR "effectiveThrough" >= "effectiveFrom"),
  ADD CONSTRAINT "FinanceTaxRegistration_version_check" CHECK ("version" >= 1);

ALTER TABLE "FinanceTaxWorkpaper"
  ADD CONSTRAINT "FinanceTaxWorkpaper_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "FinanceTaxRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceTaxWorkpaper_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceTaxWorkpaper_version_check" CHECK ("version" >= 1);

ALTER TABLE "FinanceTaxAccrualLine"
  ADD CONSTRAINT "FinanceTaxAccrualLine_workpaperId_fkey" FOREIGN KEY ("workpaperId") REFERENCES "FinanceTaxWorkpaper"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceTaxAccrualLine_voucherItemId_fkey" FOREIGN KEY ("voucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceTaxFiling"
  ADD CONSTRAINT "FinanceTaxFiling_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "FinanceTaxRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceTaxFiling_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceTaxFiling_currency_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "FinanceTaxFiling_version_check" CHECK ("version" >= 1);

ALTER TABLE "FinanceTaxPayment"
  ADD CONSTRAINT "FinanceTaxPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceTaxPayment_reversesPaymentId_fkey" FOREIGN KEY ("reversesPaymentId") REFERENCES "FinanceTaxPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceTaxPayment_amount_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "FinanceTaxPayment_currency_check" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "FinanceTaxPayment_reversal_check" CHECK (("paymentKind" = 'reversal' AND "reversesPaymentId" IS NOT NULL) OR ("paymentKind" <> 'reversal' AND "reversesPaymentId" IS NULL));

ALTER TABLE "FinanceTaxPaymentAllocation"
  ADD CONSTRAINT "FinanceTaxPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "FinanceTaxPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceTaxPaymentAllocation_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "FinanceTaxFiling"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceTaxPaymentAllocation_voucherItemId_fkey" FOREIGN KEY ("voucherItemId") REFERENCES "FinanceVoucherItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceTaxPaymentAllocation_amount_check" CHECK ("allocatedAmount" >= 0);

ALTER TABLE "FinanceTaxReconciliationSnapshot"
  ADD CONSTRAINT "FinanceTaxReconciliationSnapshot_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "FinanceTaxRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceTaxReconciliationSnapshot_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceCloseRun"
  ADD CONSTRAINT "FinanceCloseRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCloseRun_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "FinancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCloseRun_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCloseRun_completion_check" CHECK ("completedAt" IS NULL OR "completedAt" >= "openedAt"),
  ADD CONSTRAINT "FinanceCloseRun_version_check" CHECK ("version" >= 1);

ALTER TABLE "FinanceCloseTask"
  ADD CONSTRAINT "FinanceCloseTask_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FinanceCloseRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCloseTask_assigneeEmployeeId_fkey" FOREIGN KEY ("assigneeEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCloseTask_version_check" CHECK ("version" >= 1);

ALTER TABLE "FinanceCloseEvidenceSnapshot"
  ADD CONSTRAINT "FinanceCloseEvidenceSnapshot_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "FinanceCloseTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinanceCloseEvent"
  ADD CONSTRAINT "FinanceCloseEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FinanceCloseRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCloseEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "FinanceCloseTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCloseEvent_evidenceSnapshotId_fkey" FOREIGN KEY ("evidenceSnapshotId") REFERENCES "FinanceCloseEvidenceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCloseEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCloseEvent_reversesEventId_fkey" FOREIGN KEY ("reversesEventId") REFERENCES "FinanceCloseEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FinanceCloseEvent_reversal_check" CHECK (("eventKind" = 'reversal' AND "reversesEventId" IS NOT NULL) OR ("eventKind" <> 'reversal' AND "reversesEventId" IS NULL));
