-- workspace:migration-mode=online
-- Contract P1: post-approval reference, immutable materials and append-only archive records.

ALTER TABLE "Contract"
    ADD COLUMN "approvalSourceKey" TEXT,
    ADD COLUMN "approvalRecordId" TEXT,
    ADD COLUMN "approvalRecordUrl" TEXT,
    ADD COLUMN "approvalStatusSnapshot" TEXT,
    ADD COLUMN "approvedOn" DATE,
    ADD COLUMN "approvalSyncedAt" TIMESTAMP(3);

CREATE TABLE "ContractAttachment" (
    "id" SERIAL NOT NULL,
    "attachmentUid" TEXT NOT NULL,
    "contractId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'signed_contract',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "originalStoragePath" TEXT NOT NULL,
    "originalSizeBytes" INTEGER NOT NULL,
    "originalChecksumSha256" TEXT NOT NULL,
    "optimizedStoragePath" TEXT,
    "optimizedSizeBytes" INTEGER,
    "optimizedChecksumSha256" TEXT,
    "optimizationStatus" TEXT NOT NULL DEFAULT 'not_applicable',
    "optimizationError" TEXT,
    "compressionSavingsRatio" DECIMAL(8,6),
    "pageCount" INTEGER,
    "note" TEXT,
    "uploadedBy" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedBy" INTEGER,
    "removedAt" TIMESTAMP(3),
    "removalReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ContractAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContractRecord" (
    "id" SERIAL NOT NULL,
    "recordUid" TEXT NOT NULL,
    "contractId" INTEGER NOT NULL,
    "recordType" TEXT NOT NULL,
    "occurredOn" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "sourceKey" TEXT,
    "externalRecordId" TEXT,
    "externalUrl" TEXT,
    "statusSnapshot" TEXT,
    "attachmentUid" TEXT,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Contract_approvalSourceKey_approvalRecordId_key"
    ON "Contract"("approvalSourceKey", "approvalRecordId");
CREATE INDEX "Contract_approvedOn_idx" ON "Contract"("approvedOn");
CREATE UNIQUE INDEX "ContractAttachment_attachmentUid_key" ON "ContractAttachment"("attachmentUid");
CREATE INDEX "ContractAttachment_contractId_removedAt_uploadedAt_idx"
    ON "ContractAttachment"("contractId", "removedAt", "uploadedAt");
CREATE INDEX "ContractAttachment_optimizationStatus_idx" ON "ContractAttachment"("optimizationStatus");
CREATE UNIQUE INDEX "ContractRecord_recordUid_key" ON "ContractRecord"("recordUid");
CREATE INDEX "ContractRecord_contractId_occurredOn_createdAt_idx"
    ON "ContractRecord"("contractId", "occurredOn", "createdAt");
CREATE INDEX "ContractRecord_sourceKey_externalRecordId_idx"
    ON "ContractRecord"("sourceKey", "externalRecordId");
CREATE INDEX "ContractRecord_attachmentUid_idx" ON "ContractRecord"("attachmentUid");

ALTER TABLE "Contract"
    ADD CONSTRAINT "Contract_approvalReference_check" CHECK (
        ("approvalSourceKey" IS NULL AND "approvalRecordId" IS NULL)
        OR (nullif(trim("approvalSourceKey"), '') IS NOT NULL AND nullif(trim("approvalRecordId"), '') IS NOT NULL)
    );

ALTER TABLE "ContractAttachment"
    ADD CONSTRAINT "ContractAttachment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ContractAttachment_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "ContractAttachment_removedBy_fkey" FOREIGN KEY ("removedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "ContractAttachment_kind_check" CHECK ("kind" IN ('signed_contract', 'approval_record', 'supplement', 'supporting_material', 'other')),
    ADD CONSTRAINT "ContractAttachment_optimizationStatus_check" CHECK ("optimizationStatus" IN ('not_applicable', 'optimized', 'retained_original', 'failed')),
    ADD CONSTRAINT "ContractAttachment_sizes_check" CHECK (
        "originalSizeBytes" > 0
        AND ("optimizedSizeBytes" IS NULL OR "optimizedSizeBytes" > 0)
    ),
    ADD CONSTRAINT "ContractAttachment_removal_check" CHECK (
        ("removedAt" IS NULL AND "removedBy" IS NULL AND "removalReason" IS NULL)
        OR ("removedAt" IS NOT NULL AND nullif(trim("removalReason"), '') IS NOT NULL)
    );

ALTER TABLE "ContractRecord"
    ADD CONSTRAINT "ContractRecord_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ContractRecord_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "ContractRecord_recordType_check" CHECK ("recordType" IN ('approval', 'filing', 'supplement', 'note', 'attachment_added', 'attachment_removed')),
    ADD CONSTRAINT "ContractRecord_externalReference_check" CHECK (
        ("sourceKey" IS NULL AND "externalRecordId" IS NULL)
        OR (nullif(trim("sourceKey"), '') IS NOT NULL AND nullif(trim("externalRecordId"), '') IS NOT NULL)
    );
