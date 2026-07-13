-- Add library schema: documents, versions, due diligence, and generated source tables

-- CreateTable
CREATE TABLE "LibraryDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stableKey" TEXT NOT NULL,
    "rootKey" TEXT NOT NULL DEFAULT 'default',
    "relativePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "extension" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "fileMtime" DATETIME,
    "checksumSha256" TEXT,
    "categoryCode" TEXT,
    "categoryName" TEXT,
    "subcategoryPath" TEXT,
    "title" TEXT,
    "summary" TEXT,
    "confidentialityLevel" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'active',
    "origin" TEXT NOT NULL DEFAULT 'uploaded',
    "generatorKey" TEXT,
    "versionLabel" TEXT,
    "gitRepo" TEXT,
    "gitCommit" TEXT,
    "gitPath" TEXT,
    "editedBy" INTEGER,
    "editedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryDocument_editedBy_fkey" FOREIGN KEY ("editedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "chk_doc_confidentiality" CHECK ("confidentialityLevel" >= 0 AND "confidentialityLevel" <= 4)
);

-- CreateTable
CREATE TABLE "LibraryDocumentVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "documentId" INTEGER NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "relativePath" TEXT NOT NULL,
    "fileSizeBytes" INTEGER,
    "fileMtime" DATETIME,
    "checksumSha256" TEXT,
    "gitCommit" TEXT,
    "changeNote" TEXT,
    "createdBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DueDiligenceParty" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "type" TEXT,
    "ndaStatus" TEXT NOT NULL DEFAULT 'none',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DueDiligenceRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "partyId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "receivedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "defaultConfidentialityLevel" INTEGER NOT NULL DEFAULT 2,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DueDiligenceRequest_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "DueDiligenceParty" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chk_dd_confidentiality" CHECK ("defaultConfidentialityLevel" >= 0 AND "defaultConfidentialityLevel" <= 4)
);

-- CreateTable
CREATE TABLE "DueDiligenceQuestion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "categoryHint" TEXT,
    "answerDraft" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DueDiligenceQuestion_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DueDiligenceRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DueDiligenceMaterialSelection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "questionId" INTEGER NOT NULL,
    "documentId" INTEGER NOT NULL,
    "documentVersionId" INTEGER,
    "matchScore" REAL,
    "reason" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "selectedBy" INTEGER,
    "selectedAt" DATETIME,
    CONSTRAINT "DueDiligenceMaterialSelection_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "DueDiligenceQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DueDiligenceMaterialSelection_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DueDiligenceMaterialSelection_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "LibraryDocumentVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LibraryGeneratedSource" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "outputCategory" TEXT,
    "defaultConfidentialityLevel" INTEGER NOT NULL DEFAULT 2,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chk_gen_confidentiality" CHECK ("defaultConfidentialityLevel" >= 0 AND "defaultConfidentialityLevel" <= 4)
);

-- CreateIndex
CREATE UNIQUE INDEX "LibraryDocument_stableKey_key" ON "LibraryDocument"("stableKey");

-- CreateIndex
CREATE INDEX "LibraryDocument_stableKey_idx" ON "LibraryDocument"("stableKey");

-- CreateIndex
CREATE INDEX "LibraryDocument_rootKey_idx" ON "LibraryDocument"("rootKey");

-- CreateIndex
CREATE INDEX "LibraryDocument_categoryCode_idx" ON "LibraryDocument"("categoryCode");

-- CreateIndex
CREATE INDEX "LibraryDocument_status_idx" ON "LibraryDocument"("status");

-- CreateIndex
CREATE INDEX "LibraryDocument_confidentialityLevel_idx" ON "LibraryDocument"("confidentialityLevel");

-- CreateIndex
CREATE INDEX "LibraryDocument_origin_idx" ON "LibraryDocument"("origin");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryDocumentVersion_documentId_versionNo_key" ON "LibraryDocumentVersion"("documentId", "versionNo");

-- CreateIndex
CREATE INDEX "LibraryDocumentVersion_documentId_idx" ON "LibraryDocumentVersion"("documentId");

-- CreateIndex
CREATE INDEX "LibraryDocumentVersion_versionNo_idx" ON "LibraryDocumentVersion"("versionNo");

-- CreateIndex
CREATE INDEX "DueDiligenceRequest_partyId_idx" ON "DueDiligenceRequest"("partyId");

-- CreateIndex
CREATE INDEX "DueDiligenceRequest_status_idx" ON "DueDiligenceRequest"("status");

-- CreateIndex
CREATE INDEX "DueDiligenceQuestion_requestId_idx" ON "DueDiligenceQuestion"("requestId");

-- CreateIndex
CREATE INDEX "DueDiligenceQuestion_status_idx" ON "DueDiligenceQuestion"("status");

-- CreateIndex
CREATE INDEX "DueDiligenceMaterialSelection_questionId_idx" ON "DueDiligenceMaterialSelection"("questionId");

-- CreateIndex
CREATE INDEX "DueDiligenceMaterialSelection_documentId_idx" ON "DueDiligenceMaterialSelection"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryGeneratedSource_key_key" ON "LibraryGeneratedSource"("key");

-- CreateIndex
CREATE INDEX "LibraryGeneratedSource_key_idx" ON "LibraryGeneratedSource"("key");
