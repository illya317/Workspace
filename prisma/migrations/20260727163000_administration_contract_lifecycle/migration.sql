-- workspace:migration-mode=maintenance
-- Administration Contract lifecycle: immutable legal revisions plus append-only state transitions.

CREATE TABLE "ContractRevision" (
    "id" SERIAL NOT NULL,
    "revisionUid" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "contractId" INTEGER NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "recordState" TEXT NOT NULL DEFAULT 'draft',
    "changeKind" TEXT NOT NULL DEFAULT 'revision',
    "effectiveOn" DATE NOT NULL,
    "effectiveThrough" DATE,
    "snapshotSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "snapshotJson" JSONB NOT NULL,
    "reason" TEXT,
    "sourceRevisionId" INTEGER,
    "supersededByRevisionId" INTEGER,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedBy" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "cancelledBy" INTEGER,
    "cancelledAt" TIMESTAMP(3),
    CONSTRAINT "ContractRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContractStateEvent" (
    "id" SERIAL NOT NULL,
    "eventUid" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "contractId" INTEGER NOT NULL,
    "axis" TEXT NOT NULL,
    "eventKind" TEXT NOT NULL DEFAULT 'transition',
    "fromState" TEXT,
    "toState" TEXT NOT NULL,
    "effectiveOn" DATE NOT NULL,
    "recordState" TEXT NOT NULL DEFAULT 'confirmed',
    "reason" TEXT,
    "sourceRevisionId" INTEGER,
    "reversesEventId" INTEGER,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedBy" INTEGER,
    "reversedAt" TIMESTAMP(3),
    CONSTRAINT "ContractStateEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Contract" ADD COLUMN "currentRevisionId" INTEGER;

CREATE UNIQUE INDEX "ContractRevision_revisionUid_key" ON "ContractRevision"("revisionUid");
CREATE UNIQUE INDEX "ContractRevision_contractId_revisionNo_key" ON "ContractRevision"("contractId", "revisionNo");
CREATE UNIQUE INDEX "ContractRevision_supersededByRevisionId_key" ON "ContractRevision"("supersededByRevisionId");
CREATE INDEX "ContractRevision_contractId_recordState_effectiveOn_idx" ON "ContractRevision"("contractId", "recordState", "effectiveOn");
CREATE INDEX "ContractRevision_sourceRevisionId_idx" ON "ContractRevision"("sourceRevisionId");
CREATE INDEX "ContractRevision_createdAt_idx" ON "ContractRevision"("createdAt");
CREATE UNIQUE INDEX "ContractStateEvent_eventUid_key" ON "ContractStateEvent"("eventUid");
CREATE UNIQUE INDEX "ContractStateEvent_reversesEventId_key" ON "ContractStateEvent"("reversesEventId");
CREATE INDEX "ContractStateEvent_contractId_axis_effectiveOn_createdAt_idx" ON "ContractStateEvent"("contractId", "axis", "effectiveOn", "createdAt");
CREATE INDEX "ContractStateEvent_contractId_recordState_createdAt_idx" ON "ContractStateEvent"("contractId", "recordState", "createdAt");
CREATE INDEX "ContractStateEvent_sourceRevisionId_idx" ON "ContractStateEvent"("sourceRevisionId");

ALTER TABLE "ContractRevision"
    ADD CONSTRAINT "ContractRevision_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "ContractRevision_sourceRevisionId_fkey" FOREIGN KEY ("sourceRevisionId") REFERENCES "ContractRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "ContractRevision_supersededByRevisionId_fkey" FOREIGN KEY ("supersededByRevisionId") REFERENCES "ContractRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "ContractRevision_recordState_check" CHECK ("recordState" IN ('draft', 'confirmed', 'superseded', 'cancelled')),
    ADD CONSTRAINT "ContractRevision_changeKind_check" CHECK ("changeKind" IN ('initial', 'revision', 'correction')),
    ADD CONSTRAINT "ContractRevision_period_check" CHECK ("effectiveThrough" IS NULL OR "effectiveThrough" >= "effectiveOn"),
    ADD CONSTRAINT "ContractRevision_confirmation_check" CHECK (
        ("recordState" = 'draft' AND "confirmedAt" IS NULL)
        OR ("recordState" <> 'draft')
    );

ALTER TABLE "ContractStateEvent"
    ADD CONSTRAINT "ContractStateEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "ContractStateEvent_sourceRevisionId_fkey" FOREIGN KEY ("sourceRevisionId") REFERENCES "ContractRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "ContractStateEvent_reversesEventId_fkey" FOREIGN KEY ("reversesEventId") REFERENCES "ContractStateEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "ContractStateEvent_axis_check" CHECK ("axis" IN ('lifecycle', 'signature', 'performance')),
    ADD CONSTRAINT "ContractStateEvent_eventKind_check" CHECK ("eventKind" IN ('baseline', 'transition', 'reversal')),
    ADD CONSTRAINT "ContractStateEvent_recordState_check" CHECK ("recordState" IN ('confirmed', 'reversed')),
    ADD CONSTRAINT "ContractStateEvent_reversal_check" CHECK (
        ("eventKind" = 'reversal' AND "reversesEventId" IS NOT NULL)
        OR ("eventKind" <> 'reversal' AND "reversesEventId" IS NULL)
    );

INSERT INTO "ContractRevision" (
    "revisionUid", "contractId", "revisionNo", "recordState", "changeKind",
    "effectiveOn", "snapshotJson", "reason", "createdBy", "createdAt", "confirmedBy", "confirmedAt"
)
SELECT
    substr(uid_hash, 1, 8) || '-' || substr(uid_hash, 9, 4) || '-4' || substr(uid_hash, 14, 3) || '-8' || substr(uid_hash, 18, 3) || '-' || substr(uid_hash, 21, 12),
    contract."id",
    1,
    CASE WHEN contract."lifecycleStatus" = 'draft' THEN 'draft' ELSE 'confirmed' END,
    'initial',
    COALESCE(contract."signedOn", contract."createdAt"::date),
    jsonb_build_object(
        'contractNo', contract."contractNo",
        'name', contract."name",
        'partyA', contract."partyA",
        'partyB', contract."partyB",
        'shareholder', contract."shareholder",
        'categoryId', contract."categoryId",
        'content', contract."content",
        'owningCompanyId', contract."owningCompanyId",
        'ownerDepartmentId', contract."ownerDepartmentId",
        'partyAId', contract."partyAId",
        'partyBId', contract."partyBId",
        'handlerEmployeeId', contract."handlerEmployeeId",
        'signedOn', contract."signedOn",
        'expiresOn', contract."expiresOn",
        'amount', contract."amount",
        'executedAmount', contract."executedAmount",
        'currencyCode', contract."currencyCode",
        'confidentialityLevel', contract."confidentialityLevel",
        'location', contract."location",
        'remark', contract."remark"
    ),
    'lifecycle baseline',
    contract."editedBy",
    contract."createdAt",
    CASE WHEN contract."lifecycleStatus" = 'draft' THEN NULL ELSE contract."editedBy" END,
    CASE WHEN contract."lifecycleStatus" = 'draft' THEN NULL ELSE contract."updatedAt" END
FROM "Contract" contract
CROSS JOIN LATERAL (SELECT md5('workspace-contract-revision:' || contract."id"::text) AS uid_hash) identity;

UPDATE "Contract" contract
SET "currentRevisionId" = revision."id"
FROM "ContractRevision" revision
WHERE revision."contractId" = contract."id"
  AND revision."recordState" = 'confirmed';

INSERT INTO "ContractStateEvent" (
    "eventUid", "contractId", "axis", "eventKind", "fromState", "toState",
    "effectiveOn", "recordState", "reason", "sourceRevisionId", "createdBy", "createdAt"
)
SELECT
    substr(uid_hash, 1, 8) || '-' || substr(uid_hash, 9, 4) || '-4' || substr(uid_hash, 14, 3) || '-8' || substr(uid_hash, 18, 3) || '-' || substr(uid_hash, 21, 12),
    contract."id",
    axis.axis,
    'baseline',
    NULL,
    CASE axis.axis
        WHEN 'lifecycle' THEN contract."lifecycleStatus"
        WHEN 'signature' THEN contract."signatureStatus"
        ELSE contract."performanceStatus"
    END,
    revision."effectiveOn",
    'confirmed',
    'lifecycle baseline',
    revision."id",
    contract."editedBy",
    contract."createdAt"
FROM "Contract" contract
JOIN "ContractRevision" revision ON revision."contractId" = contract."id" AND revision."recordState" = 'confirmed'
CROSS JOIN (VALUES ('lifecycle'), ('signature'), ('performance')) AS axis(axis)
CROSS JOIN LATERAL (
    SELECT md5('workspace-contract-state:' || contract."id"::text || ':' || axis.axis) AS uid_hash
) identity;

CREATE UNIQUE INDEX "Contract_currentRevisionId_key" ON "Contract"("currentRevisionId");

ALTER TABLE "Contract"
    ADD CONSTRAINT "Contract_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "ContractRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
