BEGIN;

ALTER TABLE "FinanceStatementWorkpaper"
ADD COLUMN "sourcePackageId" INTEGER,
ADD COLUMN "sourcePackageRevision" INTEGER,
ADD COLUMN "sourceChecksum" TEXT;

CREATE INDEX "FinanceStatementWorkpaper_sourcePackageId_idx"
ON "FinanceStatementWorkpaper"("sourcePackageId");

CREATE TABLE "FinanceStatementSourcePackage" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "companyCode" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileChecksum" TEXT NOT NULL,
    "fileContent" BYTEA NOT NULL,
    "parsedCompanyName" TEXT NOT NULL,
    "note" TEXT,
    "uploadedBy" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedBy" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "rejectedBy" INTEGER,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceStatementSourcePackage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceStatementSourceSheet" (
    "id" SERIAL NOT NULL,
    "packageId" INTEGER NOT NULL,
    "reportType" TEXT NOT NULL,
    "previousYear" INTEGER NOT NULL,
    "currentYear" INTEGER NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceStatementSourceSheet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceStatementSourceLine" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "lineCode" TEXT NOT NULL,
    "previousAmount" DECIMAL(20,2) NOT NULL,
    "currentAmount" DECIMAL(20,2) NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceStatementSourceLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceStatementSourcePackage_companyId_year_month_revision_key"
ON "FinanceStatementSourcePackage"("companyId", "year", "month", "revision");
CREATE INDEX "FinanceStatementSourcePackage_companyId_year_month_status_idx"
ON "FinanceStatementSourcePackage"("companyId", "year", "month", "status");
CREATE INDEX "FinanceStatementSourcePackage_fileChecksum_idx"
ON "FinanceStatementSourcePackage"("fileChecksum");
CREATE UNIQUE INDEX "FinanceStatementSourceSheet_packageId_reportType_key"
ON "FinanceStatementSourceSheet"("packageId", "reportType");
CREATE INDEX "FinanceStatementSourceSheet_packageId_idx"
ON "FinanceStatementSourceSheet"("packageId");
CREATE UNIQUE INDEX "FinanceStatementSourceLine_sheetId_lineCode_key"
ON "FinanceStatementSourceLine"("sheetId", "lineCode");
CREATE INDEX "FinanceStatementSourceLine_sheetId_sortOrder_idx"
ON "FinanceStatementSourceLine"("sheetId", "sortOrder");

ALTER TABLE "FinanceStatementSourceSheet"
ADD CONSTRAINT "FinanceStatementSourceSheet_packageId_fkey"
FOREIGN KEY ("packageId") REFERENCES "FinanceStatementSourcePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinanceStatementSourceLine"
ADD CONSTRAINT "FinanceStatementSourceLine_sheetId_fkey"
FOREIGN KEY ("sheetId") REFERENCES "FinanceStatementSourceSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinanceStatementWorkpaper"
ADD CONSTRAINT "FinanceStatementWorkpaper_sourcePackageId_fkey"
FOREIGN KEY ("sourcePackageId") REFERENCES "FinanceStatementSourcePackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
