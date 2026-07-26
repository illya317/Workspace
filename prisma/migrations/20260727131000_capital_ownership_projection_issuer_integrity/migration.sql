-- workspace:migration-mode=expand
-- Projection runs belong to one stable legal-company anchor. The event ledger
-- remains authoritative; this FK only protects projection provenance.

ALTER TABLE "OwnershipProjectionRun"
  ADD CONSTRAINT "OwnershipProjectionRun_issuerCompanyId_fkey"
  FOREIGN KEY ("issuerCompanyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
