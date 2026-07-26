-- workspace:migration-mode=maintenance

ALTER TABLE "ContractRevision"
  ADD COLUMN "createIdempotencyKey" TEXT,
  ADD COLUMN "createRequestFingerprint" TEXT,
  ADD COLUMN "publishIdempotencyKey" TEXT,
  ADD COLUMN "publishRequestFingerprint" TEXT;

ALTER TABLE "ContractStateEvent"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "requestFingerprint" TEXT;

CREATE UNIQUE INDEX "ContractRevision_createIdempotencyKey_key" ON "ContractRevision"("createIdempotencyKey");
CREATE UNIQUE INDEX "ContractRevision_publishIdempotencyKey_key" ON "ContractRevision"("publishIdempotencyKey");
CREATE UNIQUE INDEX "ContractStateEvent_idempotencyKey_key" ON "ContractStateEvent"("idempotencyKey");
