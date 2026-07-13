-- Add version-scoped Library processing, governance, evaluation and export facts.
-- Originals remain owned by LibraryDocumentVersion; every table below is rebuildable or review-owned.

CREATE TABLE "LibraryProcessingJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobUid" TEXT NOT NULL,
    "versionId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "idempotencyKey" TEXT NOT NULL,
    "inputChecksum" TEXT NOT NULL,
    "pipelineVersion" TEXT NOT NULL,
    "providerKey" TEXT,
    "modelKey" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metricsJson" TEXT,
    "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryProcessingJob_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "LibraryArtifact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "artifactUid" TEXT NOT NULL,
    "versionId" INTEGER NOT NULL,
    "jobId" INTEGER,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "pageCount" INTEGER,
    "locatorSchemaVersion" TEXT NOT NULL DEFAULT 'v1',
    "toolchainJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryArtifact_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LibraryArtifact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "LibraryProcessingJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "LibraryContentChunk" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chunkUid" TEXT NOT NULL,
    "versionId" INTEGER NOT NULL,
    "artifactId" INTEGER,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "locatorJson" TEXT NOT NULL,
    "headingPathJson" TEXT,
    "tokenCount" INTEGER,
    "language" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryContentChunk_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LibraryContentChunk_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "LibraryArtifact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "LibrarySearchIndex" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "indexUid" TEXT NOT NULL,
    "versionId" INTEGER NOT NULL,
    "artifactId" INTEGER,
    "kind" TEXT NOT NULL,
    "engineKey" TEXT NOT NULL,
    "modelKey" TEXT,
    "embeddingDimensions" INTEGER,
    "generation" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'building',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "indexChecksum" TEXT,
    "builtAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibrarySearchIndex_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LibrarySearchIndex_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "LibraryArtifact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "LibraryExportJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "exportUid" TEXT NOT NULL,
    "requestedBy" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "selectionJson" TEXT NOT NULL,
    "optionsJson" TEXT NOT NULL,
    "manifestSha256" TEXT,
    "storagePath" TEXT,
    "fileSizeBytes" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "expiresAt" DATETIME,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryExportJob_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "LibraryTagCandidate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "candidateUid" TEXT NOT NULL,
    "documentId" INTEGER NOT NULL,
    "versionId" INTEGER NOT NULL,
    "tagId" INTEGER,
    "dimension" TEXT NOT NULL,
    "proposedKey" TEXT NOT NULL,
    "proposedName" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" INTEGER,
    "reviewedAt" DATETIME,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryTagCandidate_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LibraryDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LibraryTagCandidate_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LibraryTagCandidate_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "LibraryTag" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LibraryTagCandidate_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "LibraryEntityMention" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mentionUid" TEXT NOT NULL,
    "versionId" INTEGER NOT NULL,
    "chunkId" INTEGER,
    "entityType" TEXT NOT NULL,
    "canonicalValue" TEXT NOT NULL,
    "observedText" TEXT NOT NULL,
    "locatorJson" TEXT NOT NULL,
    "confidence" REAL,
    "source" TEXT NOT NULL,
    "providerKey" TEXT,
    "modelKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'extracted',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryEntityMention_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LibraryEntityMention_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "LibraryContentChunk" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "LibraryEvaluationCase" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "caseUid" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "expectedAnswer" TEXT,
    "expectedBehavior" TEXT NOT NULL DEFAULT 'answer',
    "minConfidentiality" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" INTEGER NOT NULL,
    "reviewedBy" INTEGER,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryEvaluationCase_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LibraryEvaluationCase_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "LibraryEvaluationEvidence" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "evidenceUid" TEXT NOT NULL,
    "caseId" INTEGER NOT NULL,
    "versionId" INTEGER NOT NULL,
    "locatorJson" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryEvaluationEvidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "LibraryEvaluationCase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LibraryEvaluationEvidence_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "LibraryDocumentVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LibraryProcessingJob_jobUid_key" ON "LibraryProcessingJob"("jobUid");
CREATE UNIQUE INDEX "LibraryProcessingJob_idempotencyKey_key" ON "LibraryProcessingJob"("idempotencyKey");
CREATE INDEX "LibraryProcessingJob_versionId_idx" ON "LibraryProcessingJob"("versionId");
CREATE INDEX "LibraryProcessingJob_kind_status_idx" ON "LibraryProcessingJob"("kind", "status");
CREATE INDEX "LibraryProcessingJob_status_priority_queuedAt_idx" ON "LibraryProcessingJob"("status", "priority", "queuedAt");
CREATE UNIQUE INDEX "LibraryArtifact_artifactUid_key" ON "LibraryArtifact"("artifactUid");
CREATE INDEX "LibraryArtifact_versionId_kind_status_idx" ON "LibraryArtifact"("versionId", "kind", "status");
CREATE INDEX "LibraryArtifact_jobId_idx" ON "LibraryArtifact"("jobId");
CREATE UNIQUE INDEX "LibraryArtifact_versionId_kind_checksumSha256_key" ON "LibraryArtifact"("versionId", "kind", "checksumSha256");
CREATE UNIQUE INDEX "LibraryContentChunk_chunkUid_key" ON "LibraryContentChunk"("chunkUid");
CREATE INDEX "LibraryContentChunk_versionId_idx" ON "LibraryContentChunk"("versionId");
CREATE INDEX "LibraryContentChunk_artifactId_idx" ON "LibraryContentChunk"("artifactId");
CREATE UNIQUE INDEX "LibraryContentChunk_versionId_ordinal_key" ON "LibraryContentChunk"("versionId", "ordinal");
CREATE UNIQUE INDEX "LibrarySearchIndex_indexUid_key" ON "LibrarySearchIndex"("indexUid");
CREATE INDEX "LibrarySearchIndex_kind_status_active_idx" ON "LibrarySearchIndex"("kind", "status", "active");
CREATE INDEX "LibrarySearchIndex_artifactId_idx" ON "LibrarySearchIndex"("artifactId");
CREATE UNIQUE INDEX "LibrarySearchIndex_versionId_kind_generation_key" ON "LibrarySearchIndex"("versionId", "kind", "generation");
CREATE UNIQUE INDEX "LibraryExportJob_exportUid_key" ON "LibraryExportJob"("exportUid");
CREATE INDEX "LibraryExportJob_requestedBy_createdAt_idx" ON "LibraryExportJob"("requestedBy", "createdAt");
CREATE INDEX "LibraryExportJob_status_createdAt_idx" ON "LibraryExportJob"("status", "createdAt");
CREATE INDEX "LibraryExportJob_expiresAt_idx" ON "LibraryExportJob"("expiresAt");
CREATE UNIQUE INDEX "LibraryTagCandidate_candidateUid_key" ON "LibraryTagCandidate"("candidateUid");
CREATE INDEX "LibraryTagCandidate_documentId_status_idx" ON "LibraryTagCandidate"("documentId", "status");
CREATE INDEX "LibraryTagCandidate_versionId_status_idx" ON "LibraryTagCandidate"("versionId", "status");
CREATE INDEX "LibraryTagCandidate_tagId_idx" ON "LibraryTagCandidate"("tagId");
CREATE INDEX "LibraryTagCandidate_reviewedBy_idx" ON "LibraryTagCandidate"("reviewedBy");
CREATE UNIQUE INDEX "LibraryTagCandidate_versionId_proposedKey_promptVersion_key" ON "LibraryTagCandidate"("versionId", "proposedKey", "promptVersion");
CREATE UNIQUE INDEX "LibraryEntityMention_mentionUid_key" ON "LibraryEntityMention"("mentionUid");
CREATE INDEX "LibraryEntityMention_versionId_entityType_idx" ON "LibraryEntityMention"("versionId", "entityType");
CREATE INDEX "LibraryEntityMention_chunkId_idx" ON "LibraryEntityMention"("chunkId");
CREATE INDEX "LibraryEntityMention_entityType_canonicalValue_idx" ON "LibraryEntityMention"("entityType", "canonicalValue");
CREATE UNIQUE INDEX "LibraryEvaluationCase_caseUid_key" ON "LibraryEvaluationCase"("caseUid");
CREATE INDEX "LibraryEvaluationCase_kind_status_idx" ON "LibraryEvaluationCase"("kind", "status");
CREATE INDEX "LibraryEvaluationCase_createdBy_idx" ON "LibraryEvaluationCase"("createdBy");
CREATE INDEX "LibraryEvaluationCase_reviewedBy_idx" ON "LibraryEvaluationCase"("reviewedBy");
CREATE UNIQUE INDEX "LibraryEvaluationEvidence_evidenceUid_key" ON "LibraryEvaluationEvidence"("evidenceUid");
CREATE INDEX "LibraryEvaluationEvidence_versionId_idx" ON "LibraryEvaluationEvidence"("versionId");
CREATE UNIQUE INDEX "LibraryEvaluationEvidence_caseId_versionId_evidenceUid_key" ON "LibraryEvaluationEvidence"("caseId", "versionId", "evidenceUid");
