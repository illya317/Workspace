-- Keep immutable source/version facts separate from the compact file retained
-- in the deployable Library runtime. Existing rows are backfilled by the
-- runtime normalization/compaction command after this additive migration.
ALTER TABLE "LibraryDocumentVersion" ADD COLUMN "storageFileName" TEXT;
ALTER TABLE "LibraryDocumentVersion" ADD COLUMN "storageMimeType" TEXT;
ALTER TABLE "LibraryDocumentVersion" ADD COLUMN "storageFileSizeBytes" INTEGER;
ALTER TABLE "LibraryDocumentVersion" ADD COLUMN "storageChecksumSha256" TEXT;
