-- workspace:migration-mode=expand
-- Add immutable Finance statement comparison evidence persistence (plan section 6, Package 4).
-- New tables only; legacy FinanceStatementSource*/FinanceStatementWorkpaper* tables are untouched.

-- CreateTable
CREATE TABLE "FinanceStatementComparisonPackage" (
    "id" SERIAL NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "payload" BYTEA NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "workbookSnapshot" JSONB NOT NULL,
    "scanSummary" JSONB NOT NULL,
    "lifecycle" TEXT NOT NULL DEFAULT 'parsed',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "uploadedBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceStatementComparisonPackage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FinanceStatementComparisonPackage_lifecycle_check" CHECK ("lifecycle" IN ('parsed', 'mappingRequired', 'ready', 'failed', 'archived')),
    CONSTRAINT "FinanceStatementComparisonPackage_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

-- CreateTable
CREATE TABLE "FinanceStatementComparisonMapping" (
    "id" SERIAL NOT NULL,
    "packageId" INTEGER NOT NULL,
    "targetKind" TEXT NOT NULL,
    "targetCompanyId" INTEGER,
    "targetCompanyCode" TEXT,
    "targetCompanyName" TEXT,
    "targetParentCompanyId" INTEGER,
    "targetParentCompanyCode" TEXT,
    "targetParentCompanyName" TEXT,
    "targetBatchId" INTEGER,
    "targetOutputSnapshotId" INTEGER,
    "year" INTEGER,
    "month" INTEGER,
    "periodKind" TEXT,
    "reportType" TEXT NOT NULL,
    "targetFingerprint" TEXT NOT NULL,
    "workbookSha256" TEXT NOT NULL,
    "structureMapping" JSONB NOT NULL,
    "lineMapping" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "inputFingerprint" TEXT NOT NULL,
    "confirmedBy" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceStatementComparisonMapping_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FinanceStatementComparisonMapping_targetKind_check" CHECK ("targetKind" IN ('entity', 'consolidated')),
    CONSTRAINT "FinanceStatementComparisonMapping_status_check" CHECK ("status" IN ('draft', 'confirmed', 'invalidated', 'archived')),
    CONSTRAINT "FinanceStatementComparisonMapping_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "FinanceStatementComparisonMapping_reportType_check" CHECK ("reportType" IN ('balance', 'income', 'cashflow')),
    CONSTRAINT "FinanceStatementComparisonMapping_periodKind_check" CHECK ("periodKind" IS NULL OR "periodKind" IN ('monthly', 'cumulative')),
    CONSTRAINT "FinanceStatementComparisonMapping_workbookSha256_check" CHECK ("workbookSha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "FinanceStatementComparisonMapping_target_shape_check" CHECK (
        (
            "targetKind" = 'entity'
            AND "targetCompanyId" IS NOT NULL
            AND "year" IS NOT NULL
            AND "month" IS NOT NULL
            AND "periodKind" IS NOT NULL
            AND "targetParentCompanyId" IS NULL
            AND "targetBatchId" IS NULL
            AND "targetOutputSnapshotId" IS NULL
        )
        OR (
            "targetKind" = 'consolidated'
            AND "targetParentCompanyId" IS NOT NULL
            AND "targetBatchId" IS NOT NULL
            AND "targetOutputSnapshotId" IS NOT NULL
            AND "targetCompanyId" IS NULL
            AND "year" IS NULL
            AND "month" IS NULL
            AND "periodKind" IS NULL
        )
    )
);

-- CreateTable
CREATE TABLE "FinanceStatementComparisonRun" (
    "id" SERIAL NOT NULL,
    "mappingId" INTEGER NOT NULL,
    "targetFingerprint" TEXT NOT NULL,
    "orchestratorId" TEXT NOT NULL,
    "orchestratorVersion" TEXT NOT NULL,
    "formulaAdapterId" TEXT,
    "formulaAdapterVersion" TEXT,
    "solverAdapterId" TEXT,
    "solverAdapterVersion" TEXT,
    "configFingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "inputFingerprint" TEXT NOT NULL,
    "outputFingerprint" TEXT,
    "summary" JSONB,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FinanceStatementComparisonRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FinanceStatementComparisonRun_status_check" CHECK ("status" IN ('running', 'completed', 'failed')),
    CONSTRAINT "FinanceStatementComparisonRun_fingerprints_nonempty_check" CHECK (
        length(btrim("targetFingerprint")) > 0
        AND length(btrim("configFingerprint")) > 0
        AND length(btrim("inputFingerprint")) > 0
    ),
    CONSTRAINT "FinanceStatementComparisonRun_completion_check" CHECK (
        (
            "status" = 'running'
            AND "completedAt" IS NULL
            AND "outputFingerprint" IS NULL
            AND "failureCode" IS NULL
        )
        OR (
            "status" = 'completed'
            AND "completedAt" IS NOT NULL
            AND "outputFingerprint" IS NOT NULL
        )
        OR (
            "status" = 'failed'
            AND "completedAt" IS NOT NULL
            AND "failureCode" IS NOT NULL
        )
    )
);

-- CreateTable
CREATE TABLE "FinanceStatementComparisonLine" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "lineCode" TEXT NOT NULL,
    "lineLabel" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "sourceSheet" TEXT,
    "sourceCell" TEXT,
    "externalAmount" DECIMAL(20,2),
    "systemAmount" DECIMAL(20,2),
    "differenceAmount" DECIMAL(20,2),
    "explainedAmount" DECIMAL(20,2),
    "residualAmount" DECIMAL(20,2),
    "explanationStatus" TEXT NOT NULL,
    "explanationMethod" TEXT,
    "evidence" JSONB,
    "alternatives" JSONB,
    "diagnostics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceStatementComparisonLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FinanceStatementComparisonLine_explanationStatus_check" CHECK ("explanationStatus" IN ('exact', 'near', 'ambiguous', 'notFound', 'truncated', 'notEvaluated')),
    CONSTRAINT "FinanceStatementComparisonLine_explanationMethod_check" CHECK ("explanationMethod" IS NULL OR "explanationMethod" IN ('direct', 'formula', 'combination', 'rollforward')),
    CONSTRAINT "FinanceStatementComparisonLine_source_cell_check" CHECK (("sourceSheet" IS NULL) = ("sourceCell" IS NULL))
);

-- CreateIndex
CREATE INDEX "FinanceStatementComparisonPackage_sha256_idx" ON "FinanceStatementComparisonPackage"("sha256");

-- CreateIndex
CREATE INDEX "FinanceStatementComparisonPackage_lifecycle_createdAt_idx" ON "FinanceStatementComparisonPackage"("lifecycle", "createdAt");

-- CreateIndex
CREATE INDEX "FinanceStatementComparisonPackage_uploadedBy_createdAt_idx" ON "FinanceStatementComparisonPackage"("uploadedBy", "createdAt");

-- CreateIndex
CREATE INDEX "FinanceStatementComparisonMapping_packageId_status_idx" ON "FinanceStatementComparisonMapping"("packageId", "status");

-- CreateIndex
CREATE INDEX "FinanceStatementComparisonMapping_targetKind_targetCompanyI_idx" ON "FinanceStatementComparisonMapping"("targetKind", "targetCompanyId", "year", "month", "reportType");

-- CreateIndex
CREATE INDEX "FinanceStatementComparisonMapping_targetBatchId_idx" ON "FinanceStatementComparisonMapping"("targetBatchId");

-- CreateIndex
CREATE INDEX "FinanceStatementComparisonMapping_targetFingerprint_idx" ON "FinanceStatementComparisonMapping"("targetFingerprint");

-- CreateIndex
CREATE INDEX "FinanceStatementComparisonRun_mappingId_createdAt_idx" ON "FinanceStatementComparisonRun"("mappingId", "createdAt");

-- CreateIndex
CREATE INDEX "FinanceStatementComparisonRun_status_createdAt_idx" ON "FinanceStatementComparisonRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FinanceStatementComparisonRun_outputFingerprint_idx" ON "FinanceStatementComparisonRun"("outputFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceStatementComparisonLine_runId_lineCode_key" ON "FinanceStatementComparisonLine"("runId", "lineCode");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceStatementComparisonLine_runId_sourceSheet_sourceCell_key" ON "FinanceStatementComparisonLine"("runId", "sourceSheet", "sourceCell");

-- CreateIndex
CREATE INDEX "FinanceStatementComparisonLine_runId_sortOrder_idx" ON "FinanceStatementComparisonLine"("runId", "sortOrder");

-- AddForeignKey
ALTER TABLE "FinanceStatementComparisonPackage" ADD CONSTRAINT "FinanceStatementComparisonPackage_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceStatementComparisonMapping" ADD CONSTRAINT "FinanceStatementComparisonMapping_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "FinanceStatementComparisonPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceStatementComparisonMapping" ADD CONSTRAINT "FinanceStatementComparisonMapping_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceStatementComparisonMapping" ADD CONSTRAINT "FinanceStatementComparisonMapping_targetParentCompanyId_fkey" FOREIGN KEY ("targetParentCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceStatementComparisonMapping" ADD CONSTRAINT "FinanceStatementComparisonMapping_targetBatchId_fkey" FOREIGN KEY ("targetBatchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceStatementComparisonMapping" ADD CONSTRAINT "FinanceStatementComparisonMapping_targetOutputSnapshotId_fkey" FOREIGN KEY ("targetOutputSnapshotId") REFERENCES "FinanceConsolidationOutputSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceStatementComparisonMapping" ADD CONSTRAINT "FinanceStatementComparisonMapping_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceStatementComparisonRun" ADD CONSTRAINT "FinanceStatementComparisonRun_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "FinanceStatementComparisonMapping"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceStatementComparisonRun" ADD CONSTRAINT "FinanceStatementComparisonRun_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceStatementComparisonLine" ADD CONSTRAINT "FinanceStatementComparisonLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FinanceStatementComparisonRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
