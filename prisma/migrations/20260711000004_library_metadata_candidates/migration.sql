-- Preserve legacy index and Agent-generated enrichment as reviewable candidates.
-- Formal document metadata/tags remain separate and require explicit approval.

ALTER TABLE "LibraryTag" ADD COLUMN "dimension" TEXT NOT NULL DEFAULT 'theme';
ALTER TABLE "LibraryTag" ADD COLUMN "taxonomyVersion" TEXT NOT NULL DEFAULT 'v1';

CREATE TABLE "LibraryMetadataCandidate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "candidateUid" TEXT NOT NULL,
    "documentId" INTEGER NOT NULL,
    "versionId" INTEGER NOT NULL,
    "title" TEXT,
    "summary" TEXT,
    "keywordsJson" TEXT NOT NULL,
    "entitiesJson" TEXT NOT NULL,
    "keyPassagesJson" TEXT NOT NULL,
    "fileFactsJson" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" INTEGER,
    "reviewedAt" DATETIME,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryMetadataCandidate_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LibraryMetadataCandidate_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LibraryMetadataCandidate_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LibraryMetadataCandidate_candidateUid_key" ON "LibraryMetadataCandidate"("candidateUid");
CREATE UNIQUE INDEX "LibraryMetadataCandidate_versionId_promptVersion_key" ON "LibraryMetadataCandidate"("versionId", "promptVersion");
CREATE INDEX "LibraryMetadataCandidate_documentId_status_idx" ON "LibraryMetadataCandidate"("documentId", "status");
CREATE INDEX "LibraryMetadataCandidate_versionId_status_idx" ON "LibraryMetadataCandidate"("versionId", "status");
CREATE INDEX "LibraryMetadataCandidate_reviewedBy_idx" ON "LibraryMetadataCandidate"("reviewedBy");
