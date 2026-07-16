-- workspace:migration-mode=maintenance
BEGIN;

ALTER TABLE "CompanyRelation"
ADD COLUMN "effectiveFrom" TIMESTAMP(3),
ADD COLUMN "effectiveTo" TIMESTAMP(3),
ADD COLUMN "editedBy" INTEGER,
ADD COLUMN "editedAt" TIMESTAMP(3),
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "CompanyRelation"
ADD CONSTRAINT "CompanyRelation_shareRatio_check"
CHECK ("shareRatio" IS NULL OR ("shareRatio" >= 0 AND "shareRatio" <= 1)),
ADD CONSTRAINT "CompanyRelation_effective_period_check"
CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveFrom" <= "effectiveTo");

DROP INDEX "CompanyRelation_parentId_childId_key";

CREATE INDEX "CompanyRelation_parent_child_period_idx"
ON "CompanyRelation"("parentId", "childId", "effectiveFrom", "effectiveTo");

CREATE INDEX "CompanyRelation_child_consolidation_period_idx"
ON "CompanyRelation"("childId", "isConsolidated", "effectiveFrom", "effectiveTo");

COMMIT;
