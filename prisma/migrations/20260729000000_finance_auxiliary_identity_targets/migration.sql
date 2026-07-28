ALTER TABLE "FinanceAuxiliaryMember"
  ADD COLUMN "linkedEmployeeId" INTEGER,
  ADD COLUMN "linkedPartyId" INTEGER,
  ADD COLUMN "identityLinkMethod" TEXT,
  ADD COLUMN "identityLinkEvidence" TEXT,
  ADD COLUMN "identityLinkedAt" TIMESTAMP(3),
  ADD COLUMN "identityLinkedBy" INTEGER;

CREATE TABLE "EmployeePartyIdentityLink" (
  "id" SERIAL NOT NULL,
  "employeeId" INTEGER NOT NULL,
  "partyId" INTEGER NOT NULL,
  "recordStatus" TEXT NOT NULL DEFAULT 'confirmed',
  "linkMethod" TEXT NOT NULL,
  "linkEvidence" TEXT NOT NULL,
  "confirmedBy" INTEGER,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeePartyIdentityLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeePartyIdentityLink_employeeId_key" ON "EmployeePartyIdentityLink"("employeeId");
CREATE UNIQUE INDEX "EmployeePartyIdentityLink_partyId_key" ON "EmployeePartyIdentityLink"("partyId");
CREATE INDEX "EmployeePartyIdentityLink_recordStatus_idx" ON "EmployeePartyIdentityLink"("recordStatus");
CREATE INDEX "FinanceAuxiliaryMember_linkedEmployeeId_idx" ON "FinanceAuxiliaryMember"("linkedEmployeeId");
CREATE INDEX "FinanceAuxiliaryMember_linkedPartyId_idx" ON "FinanceAuxiliaryMember"("linkedPartyId");

ALTER TABLE "EmployeePartyIdentityLink"
  ADD CONSTRAINT "EmployeePartyIdentityLink_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeePartyIdentityLink"
  ADD CONSTRAINT "EmployeePartyIdentityLink_partyId_fkey"
  FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAuxiliaryMember"
  ADD CONSTRAINT "FinanceAuxiliaryMember_linkedEmployeeId_fkey"
  FOREIGN KEY ("linkedEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAuxiliaryMember"
  ADD CONSTRAINT "FinanceAuxiliaryMember_linkedPartyId_fkey"
  FOREIGN KEY ("linkedPartyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmployeePartyIdentityLink"
  ADD CONSTRAINT "EmployeePartyIdentityLink_record_status_check"
  CHECK ("recordStatus" IN ('confirmed', 'revoked'));
ALTER TABLE "EmployeePartyIdentityLink"
  ADD CONSTRAINT "EmployeePartyIdentityLink_evidence_check"
  CHECK (btrim("linkMethod") <> '' AND btrim("linkEvidence") <> '');
ALTER TABLE "FinanceAuxiliaryMember"
  ADD CONSTRAINT "FinanceAuxiliaryMember_single_identity_target_check"
  CHECK (num_nonnulls("linkedCompanyId", "linkedEmployeeId", "linkedPartyId") <= 1);
ALTER TABLE "FinanceAuxiliaryMember"
  ADD CONSTRAINT "FinanceAuxiliaryMember_identity_link_evidence_check"
  CHECK (
    ("linkedEmployeeId" IS NULL AND "linkedPartyId" IS NULL)
    OR (
      NULLIF(btrim("identityLinkMethod"), '') IS NOT NULL
      AND NULLIF(btrim("identityLinkEvidence"), '') IS NOT NULL
      AND "identityLinkedAt" IS NOT NULL
    )
  );
