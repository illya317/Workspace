-- Add docId to LibraryDocument and create LibraryDocumentTag table

-- AddColumn: docId (nullable, unique index created separately)
ALTER TABLE "LibraryDocument" ADD COLUMN "docId" TEXT;

-- AddColumn: directoryPath (also missing from original migration, added by db push)
ALTER TABLE "LibraryDocument" ADD COLUMN "directoryPath" TEXT;

-- CreateTable: LibraryDocumentTag
CREATE TABLE "LibraryDocumentTag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "documentId" INTEGER NOT NULL,
    "tag" TEXT NOT NULL,
    CONSTRAINT "LibraryDocumentTag_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex: LibraryDocument docId unique
CREATE UNIQUE INDEX "LibraryDocument_docId_key" ON "LibraryDocument"("docId");

-- CreateIndex: LibraryDocumentTag composite unique
CREATE UNIQUE INDEX "LibraryDocumentTag_documentId_tag_key" ON "LibraryDocumentTag"("documentId", "tag");

-- CreateIndex: LibraryDocumentTag tag index for filtering
CREATE INDEX "LibraryDocumentTag_tag_idx" ON "LibraryDocumentTag"("tag");
