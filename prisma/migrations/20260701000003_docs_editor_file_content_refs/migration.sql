ALTER TABLE "DocumentTemplate" ADD COLUMN "documentContentRef" TEXT;
ALTER TABLE "DocumentTemplate" ADD COLUMN "documentContentHash" TEXT;
ALTER TABLE "DocumentTemplate" ADD COLUMN "documentContentBytes" INTEGER;
ALTER TABLE "DocumentTemplate" ADD COLUMN "fieldModelContentRef" TEXT;
ALTER TABLE "DocumentTemplate" ADD COLUMN "fieldModelContentHash" TEXT;
ALTER TABLE "DocumentTemplate" ADD COLUMN "fieldModelContentBytes" INTEGER;

CREATE INDEX "DocumentTemplate_documentContentRef_idx" ON "DocumentTemplate"("documentContentRef");
