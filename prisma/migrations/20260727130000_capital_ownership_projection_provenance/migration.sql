-- workspace:migration-mode=expand
-- Expand: legacy projection rows remain readable with nullable provenance.
-- A controlled per-issuer rebuild will replace them with fully sourced rows;
-- this migration deliberately does not invent an opening or closing event.
ALTER TABLE "OwnershipInterest"
  ADD COLUMN "sourceEventId" INTEGER,
  ADD COLUMN "closedByEventId" INTEGER,
  ADD COLUMN "projectionRunId" INTEGER,
  ADD COLUMN "projectionGeneration" INTEGER;

CREATE TABLE "OwnershipProjectionRun" (
  "id" SERIAL NOT NULL,
  "issuerCompanyId" INTEGER NOT NULL,
  "generation" INTEGER NOT NULL,
  "projectorKey" TEXT NOT NULL,
  "projectorVersion" INTEGER NOT NULL,
  "ledgerHash" TEXT NOT NULL,
  "sourceEventCount" INTEGER NOT NULL,
  "projectionRowCount" INTEGER NOT NULL,
  "triggerReason" TEXT,
  "triggeredBy" INTEGER,
  "projectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OwnershipProjectionRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OwnershipProjectionRun_issuer_generation_key"
  ON "OwnershipProjectionRun"("issuerCompanyId", "generation");
CREATE INDEX "OwnershipProjectionRun_issuer_projected_at_idx"
  ON "OwnershipProjectionRun"("issuerCompanyId", "projectedAt");
CREATE INDEX "OwnershipProjectionRun_ledger_hash_idx"
  ON "OwnershipProjectionRun"("ledgerHash");
CREATE INDEX "OwnershipInterest_source_event_idx"
  ON "OwnershipInterest"("sourceEventId");
CREATE INDEX "OwnershipInterest_closed_by_event_idx"
  ON "OwnershipInterest"("closedByEventId");
CREATE INDEX "OwnershipInterest_projection_run_idx"
  ON "OwnershipInterest"("projectionRunId");

ALTER TABLE "OwnershipInterest"
  ADD CONSTRAINT "OwnershipInterest_sourceEventId_fkey"
  FOREIGN KEY ("sourceEventId") REFERENCES "ShareCapitalEvent"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OwnershipInterest"
  ADD CONSTRAINT "OwnershipInterest_closedByEventId_fkey"
  FOREIGN KEY ("closedByEventId") REFERENCES "ShareCapitalEvent"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OwnershipInterest"
  ADD CONSTRAINT "OwnershipInterest_projectionRunId_fkey"
  FOREIGN KEY ("projectionRunId") REFERENCES "OwnershipProjectionRun"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
