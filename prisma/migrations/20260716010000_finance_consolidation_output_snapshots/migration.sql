-- workspace:migration-mode=maintenance
BEGIN;

CREATE TABLE "FinanceConsolidationOutputSnapshot" (
  "id" SERIAL NOT NULL,
  "batchId" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "inputFingerprint" TEXT NOT NULL,
  "outputFingerprint" TEXT NOT NULL,
  "reportPayload" JSONB NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinanceConsolidationOutputSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceConsolidationOutputSnapshot_batchId_key"
ON "FinanceConsolidationOutputSnapshot"("batchId");

CREATE INDEX "FinanceConsolidationOutputSnapshot_outputFingerprint_idx"
ON "FinanceConsolidationOutputSnapshot"("outputFingerprint");

ALTER TABLE "FinanceConsolidationOutputSnapshot"
ADD CONSTRAINT "FinanceConsolidationOutputSnapshot_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "FinanceConsolidationBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION "_workspace_prevent_finance_consolidation_output_snapshot_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'FinanceConsolidationOutputSnapshot is immutable';
END;
$$;

CREATE TRIGGER "FinanceConsolidationOutputSnapshot_immutable"
BEFORE UPDATE OR DELETE ON "FinanceConsolidationOutputSnapshot"
FOR EACH ROW
EXECUTE FUNCTION "_workspace_prevent_finance_consolidation_output_snapshot_mutation"();

COMMIT;
