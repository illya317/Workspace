-- CreateTable
CREATE TABLE "MutationImpactBatch" (
    "id" TEXT NOT NULL,
    "actorUserId" INTEGER,
    "actorLabel" TEXT,
    "scopeType" TEXT,
    "scopeId" TEXT,
    "requestId" TEXT,
    "rootEntityType" TEXT NOT NULL,
    "rootEntityId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "policyRevision" TEXT NOT NULL,
    "impactFingerprint" TEXT NOT NULL,
    "resolutionsJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resultCode" TEXT,
    "resultMessage" TEXT,
    "sourceBatchId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MutationImpactBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MutationImpactEffect" (
    "id" SERIAL NOT NULL,
    "batchId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "relationKey" TEXT NOT NULL,
    "relationPathJson" TEXT NOT NULL DEFAULT '[]',
    "policyKey" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "beforeRevision" TEXT,
    "afterRevision" TEXT,
    "beforeSummaryJson" TEXT,
    "afterSummaryJson" TEXT,
    "changedInBatch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MutationImpactEffect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MutationImpactBatch_rootEntityType_rootEntityId_intent_stat_idx"
ON "MutationImpactBatch"("rootEntityType", "rootEntityId", "intent", "status", "finishedAt");

-- CreateIndex
CREATE INDEX "MutationImpactBatch_actorUserId_startedAt_idx"
ON "MutationImpactBatch"("actorUserId", "startedAt");

-- CreateIndex
CREATE INDEX "MutationImpactBatch_requestId_idx"
ON "MutationImpactBatch"("requestId");

-- CreateIndex
CREATE INDEX "MutationImpactBatch_sourceBatchId_idx"
ON "MutationImpactBatch"("sourceBatchId");

-- CreateIndex
CREATE INDEX "MutationImpactEffect_batchId_changedInBatch_sequence_idx"
ON "MutationImpactEffect"("batchId", "changedInBatch", "sequence");

-- CreateIndex
CREATE INDEX "MutationImpactEffect_entityType_entityId_createdAt_idx"
ON "MutationImpactEffect"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "MutationImpactEffect_relationKey_operation_createdAt_idx"
ON "MutationImpactEffect"("relationKey", "operation", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MutationImpactEffect_batchId_sequence_key"
ON "MutationImpactEffect"("batchId", "sequence");

-- AddForeignKey
ALTER TABLE "MutationImpactBatch"
ADD CONSTRAINT "MutationImpactBatch_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutationImpactBatch"
ADD CONSTRAINT "MutationImpactBatch_sourceBatchId_fkey"
FOREIGN KEY ("sourceBatchId") REFERENCES "MutationImpactBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutationImpactEffect"
ADD CONSTRAINT "MutationImpactEffect_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "MutationImpactBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Work pilot confirmation freshness requires a revision that changes for every WorkItem write.
ALTER TABLE "WorkItem"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
