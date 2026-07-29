CREATE TABLE "BusinessCodeSequence" (
    "ruleKey" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessCodeSequence_pkey" PRIMARY KEY ("ruleKey", "scopeKey")
);

CREATE TABLE "BusinessCodeRule" (
    "id" SERIAL NOT NULL,
    "objectKey" TEXT NOT NULL,
    "configJson" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessCodeRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessCodeAllocation" (
    "id" SERIAL NOT NULL,
    "objectKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "inputFingerprint" TEXT NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessCodeAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessCodeRule_objectKey_key"
ON "BusinessCodeRule"("objectKey");

CREATE UNIQUE INDEX "BusinessCodeAllocation_objectKey_idempotencyKey_key"
ON "BusinessCodeAllocation"("objectKey", "idempotencyKey");

CREATE UNIQUE INDEX "BusinessCodeAllocation_objectKey_code_key"
ON "BusinessCodeAllocation"("objectKey", "code");

CREATE UNIQUE INDEX "BusinessCodeAllocation_ruleId_ruleVersion_scopeKey_sequence_key"
ON "BusinessCodeAllocation"("ruleId", "ruleVersion", "scopeKey", "sequence");

CREATE INDEX "BusinessCodeAllocation_ruleId_scopeKey_idx"
ON "BusinessCodeAllocation"("ruleId", "scopeKey");

ALTER TABLE "BusinessCodeAllocation"
ADD CONSTRAINT "BusinessCodeAllocation_ruleId_fkey"
FOREIGN KEY ("ruleId") REFERENCES "BusinessCodeRule"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "BusinessCodeRule" ("objectKey", "configJson")
VALUES (
  'finance.asset',
  '{"separator":"-","sequenceLength":5,"sequenceStart":1}'::jsonb
);
