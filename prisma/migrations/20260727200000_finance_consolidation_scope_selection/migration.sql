-- workspace:migration-mode=expand
-- Store Finance-only, period-scoped consolidation preparation choices.
-- These rows are consumed when a Finance consolidation batch is created and
-- never mutate the Capital Securities ownership ledger or projection.
CREATE TABLE "FinanceConsolidationScopeSelection" (
    "id" SERIAL NOT NULL,
    "parentCompanyId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "periodKind" TEXT NOT NULL DEFAULT 'month',
    "companyId" INTEGER NOT NULL,
    "relationId" INTEGER NOT NULL,
    "relationVersion" INTEGER NOT NULL,
    "included" BOOLEAN NOT NULL,
    "selectedBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceConsolidationScopeSelection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FinanceConsolidationScopeSelection_year_check" CHECK ("year" BETWEEN 1900 AND 2099),
    CONSTRAINT "FinanceConsolidationScopeSelection_month_check" CHECK ("month" BETWEEN 1 AND 12),
    CONSTRAINT "FinanceConsolidationScopeSelection_period_kind_check" CHECK ("periodKind" IN ('year', 'quarter', 'month')),
    CONSTRAINT "FinanceConsolidationScopeSelection_relation_version_check" CHECK ("relationVersion" > 0)
);

CREATE UNIQUE INDEX "FinanceConsolidationScopeSelection_scope_company_key"
    ON "FinanceConsolidationScopeSelection"("parentCompanyId", "year", "month", "periodKind", "companyId");
CREATE INDEX "FinanceConsolidationScopeSelection_scope_idx"
    ON "FinanceConsolidationScopeSelection"("parentCompanyId", "year", "month", "periodKind");
