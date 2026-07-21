ALTER TABLE "FinanceAuxiliaryMember"
  ADD COLUMN "linkedCompanyId" INTEGER,
  ADD COLUMN "companyLinkMethod" TEXT,
  ADD COLUMN "companyLinkEvidence" TEXT;

CREATE INDEX "FinanceAuxiliaryMember_linkedCompanyId_idx"
  ON "FinanceAuxiliaryMember"("linkedCompanyId");

ALTER TABLE "FinanceAuxiliaryMember"
  ADD CONSTRAINT "FinanceAuxiliaryMember_linkedCompanyId_fkey"
    FOREIGN KEY ("linkedCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "FinanceAuxiliaryMember" AS member
SET
  "linkedCompanyId" = company.id,
  "companyLinkMethod" = 'verified_source_name',
  "companyLinkEvidence" = '2025 ERP auxiliary master matched to canonical Company during consolidation automation migration'
FROM "Company" AS company
WHERE
  (member."sourceName" = '上海丰华天力通生物医药有限公司' AND company.code = '02')
  OR (member."sourceName" = '丰华悦通国际医药科技有限公司' AND company.code = '03')
  OR (member."sourceName" IN ('ThePalaceInstituteofMedicalBiologyCo.,Ltd', 'The Palace Institute of Medical Biology Co Ltd') AND company.code = '05')
  OR (member."sourceName" = '江苏丰华生物制药有限公司' AND company.code = '01');

ALTER TABLE "FinanceConsolidationEntry"
  ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "generationKey" TEXT,
  ADD COLUMN "generationFingerprint" TEXT,
  ADD COLUMN "generatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "FinanceConsolidationEntry_batchId_generationKey_key"
  ON "FinanceConsolidationEntry"("batchId", "generationKey");
