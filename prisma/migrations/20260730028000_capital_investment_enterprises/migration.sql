-- workspace:migration-mode=expand
CREATE TABLE "InvestmentEnterpriseProfile" (
    "id" SERIAL NOT NULL,
    "profileUid" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "portfolioCode" TEXT NOT NULL,
    "investmentStatus" TEXT NOT NULL DEFAULT 'active',
    "investmentStage" TEXT,
    "industry" TEXT,
    "investmentDate" TIMESTAMP(3),
    "exitDate" TIMESTAMP(3),
    "investmentCurrency" TEXT NOT NULL DEFAULT 'CNY',
    "investedAmount" DECIMAL(20,2),
    "currentValuation" DECIMAL(20,2),
    "valuationDate" TIMESTAMP(3),
    "investmentLead" TEXT,
    "dealTeam" TEXT,
    "boardSeat" TEXT,
    "investmentThesis" TEXT,
    "keyRisks" TEXT,
    "exitPlan" TEXT,
    "nextReviewDate" TIMESTAMP(3),
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestmentEnterpriseProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvestmentEnterpriseProfile_profileUid_key" ON "InvestmentEnterpriseProfile"("profileUid");
CREATE UNIQUE INDEX "InvestmentEnterpriseProfile_companyId_key" ON "InvestmentEnterpriseProfile"("companyId");
CREATE UNIQUE INDEX "InvestmentEnterpriseProfile_portfolioCode_key" ON "InvestmentEnterpriseProfile"("portfolioCode");
CREATE INDEX "InvestmentEnterpriseProfile_investmentStatus_nextReviewDate_idx" ON "InvestmentEnterpriseProfile"("investmentStatus", "nextReviewDate");
CREATE INDEX "InvestmentEnterpriseProfile_industry_idx" ON "InvestmentEnterpriseProfile"("industry");
ALTER TABLE "InvestmentEnterpriseProfile" ADD CONSTRAINT "InvestmentEnterpriseProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InvestmentEnterpriseMeeting" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "meetingType" TEXT NOT NULL DEFAULT 'shareholders',
    "title" TEXT NOT NULL,
    "meetingDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'planned',
    "decisionSummary" TEXT,
    "votingResult" TEXT,
    "followUpOwner" TEXT,
    "followUpDueDate" TIMESTAMP(3),
    "notes" TEXT,
    "sourceReference" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestmentEnterpriseMeeting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvestmentEnterpriseMeeting_profileId_meetingDate_idx" ON "InvestmentEnterpriseMeeting"("profileId", "meetingDate");
CREATE INDEX "InvestmentEnterpriseMeeting_profileId_status_idx" ON "InvestmentEnterpriseMeeting"("profileId", "status");
ALTER TABLE "InvestmentEnterpriseMeeting" ADD CONSTRAINT "InvestmentEnterpriseMeeting_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "InvestmentEnterpriseProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InvestmentEnterpriseDiligenceItem" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "workstream" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "finding" TEXT,
    "recommendation" TEXT,
    "ownerName" TEXT,
    "dueDate" TIMESTAMP(3),
    "remediationStatus" TEXT NOT NULL DEFAULT 'not_started',
    "remediationEvidence" TEXT,
    "sourceReference" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestmentEnterpriseDiligenceItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvestmentEnterpriseDiligenceItem_profileId_workstream_status_idx" ON "InvestmentEnterpriseDiligenceItem"("profileId", "workstream", "status");
CREATE INDEX "InvestmentEnterpriseDiligenceItem_profileId_riskLevel_dueDate_idx" ON "InvestmentEnterpriseDiligenceItem"("profileId", "riskLevel", "dueDate");
ALTER TABLE "InvestmentEnterpriseDiligenceItem" ADD CONSTRAINT "InvestmentEnterpriseDiligenceItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "InvestmentEnterpriseProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InvestmentEnterpriseContract" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "contractType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "counterparty" TEXT,
    "signedDate" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "noticeDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "amount" DECIMAL(20,2),
    "keyTerms" TEXT,
    "obligationSummary" TEXT,
    "sourceReference" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestmentEnterpriseContract_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvestmentEnterpriseContract_profileId_contractType_status_idx" ON "InvestmentEnterpriseContract"("profileId", "contractType", "status");
CREATE INDEX "InvestmentEnterpriseContract_profileId_expiryDate_noticeDate_idx" ON "InvestmentEnterpriseContract"("profileId", "expiryDate", "noticeDate");
ALTER TABLE "InvestmentEnterpriseContract" ADD CONSTRAINT "InvestmentEnterpriseContract_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "InvestmentEnterpriseProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InvestmentEnterpriseMonitoringRecord" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "revenue" DECIMAL(20,2),
    "netProfit" DECIMAL(20,2),
    "cashBalance" DECIMAL(20,2),
    "valuation" DECIMAL(20,2),
    "headcount" INTEGER,
    "highlights" TEXT,
    "risks" TEXT,
    "sourceReference" TEXT,
    "editedBy" INTEGER,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestmentEnterpriseMonitoringRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvestmentEnterpriseMonitoringRecord_profileId_periodEnd_key" ON "InvestmentEnterpriseMonitoringRecord"("profileId", "periodEnd");
CREATE INDEX "InvestmentEnterpriseMonitoringRecord_profileId_status_periodEnd_idx" ON "InvestmentEnterpriseMonitoringRecord"("profileId", "status", "periodEnd");
ALTER TABLE "InvestmentEnterpriseMonitoringRecord" ADD CONSTRAINT "InvestmentEnterpriseMonitoringRecord_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "InvestmentEnterpriseProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InvestmentEnterpriseDocumentLink" (
    "id" SERIAL NOT NULL,
    "linkUid" TEXT NOT NULL,
    "profileId" INTEGER NOT NULL,
    "libraryDocumentUid" TEXT,
    "documentCategory" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "uploadStatus" TEXT NOT NULL DEFAULT 'pending',
    "failureReason" TEXT,
    "linkedBy" INTEGER,
    "linkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvestmentEnterpriseDocumentLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvestmentEnterpriseDocumentLink_linkUid_key" ON "InvestmentEnterpriseDocumentLink"("linkUid");
CREATE UNIQUE INDEX "InvestmentEnterpriseDocumentLink_profileId_libraryDocumentUid_key" ON "InvestmentEnterpriseDocumentLink"("profileId", "libraryDocumentUid");
CREATE INDEX "InvestmentEnterpriseDocumentLink_profileId_documentCategory_idx" ON "InvestmentEnterpriseDocumentLink"("profileId", "documentCategory");
CREATE INDEX "InvestmentEnterpriseDocumentLink_uploadStatus_createdAt_idx" ON "InvestmentEnterpriseDocumentLink"("uploadStatus", "createdAt");
ALTER TABLE "InvestmentEnterpriseDocumentLink" ADD CONSTRAINT "InvestmentEnterpriseDocumentLink_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "InvestmentEnterpriseProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LibraryContentEmbedding" (
    "id" SERIAL NOT NULL,
    "indexId" INTEGER NOT NULL,
    "chunkId" INTEGER NOT NULL,
    "modelKey" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "values" DOUBLE PRECISION[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryContentEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LibraryContentEmbedding_indexId_chunkId_key" ON "LibraryContentEmbedding"("indexId", "chunkId");
CREATE INDEX "LibraryContentEmbedding_chunkId_idx" ON "LibraryContentEmbedding"("chunkId");
CREATE INDEX "LibraryContentEmbedding_modelKey_dimensions_idx" ON "LibraryContentEmbedding"("modelKey", "dimensions");
ALTER TABLE "LibraryContentEmbedding" ADD CONSTRAINT "LibraryContentEmbedding_indexId_fkey" FOREIGN KEY ("indexId") REFERENCES "LibrarySearchIndex"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryContentEmbedding" ADD CONSTRAINT "LibraryContentEmbedding_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "LibraryContentChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
