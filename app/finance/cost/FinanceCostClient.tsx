"use client";

import { useState } from "react";
import { SessionUser } from "@workspace/platform/types";
import { PageContent, TabBar } from "@workspace/core/ui";
import CostFilters from "./components/CostFilters";
import CostSummary from "./components/CostSummary";
import ShipmentTable from "./components/ShipmentTable";
import CostAnalysisTable from "./components/CostAnalysisTable";
import CostStructureTable from "./components/CostStructureTable";
import WorkshopReportTable from "./components/WorkshopReportTable";
import SalesSalaryTable from "./components/SalesSalaryTable";
import ImportHistoryTable from "./components/ImportHistoryTable";
import type { CostFiltersState, CostTab } from "./types";

const TABS: { key: CostTab; label: string }[] = [
  { key: "overview", label: "总览" },
  { key: "shipments", label: "发货与回款" },
  { key: "cost-analysis", label: "成本分析" },
  { key: "cost-structure", label: "成本构成" },
  { key: "workshop", label: "车间工分" },
  { key: "salary", label: "业务员工资" },
  { key: "imports", label: "导入记录" },
];

export default function FinanceCostClient({ user: _user }: { user: SessionUser }) {
  const [tab, setTab] = useState<CostTab>("overview");
  const [filters, setFilters] = useState<CostFiltersState>({
    year: undefined,
    month: undefined,
    productName: "",
    customerName: "",
  });

  return (
    <PageContent className="max-w-6xl space-y-4">
      <TabBar tabs={TABS} active={tab} onChange={(key) => setTab(key as CostTab)} />
      <CostFilters filters={filters} onChange={setFilters} />

      <div className="pt-2">
        {tab === "overview" && <CostSummary filters={filters} />}
        {tab === "shipments" && <ShipmentTable filters={filters} />}
        {tab === "cost-analysis" && <CostAnalysisTable filters={filters} />}
        {tab === "cost-structure" && <CostStructureTable filters={filters} />}
        {tab === "workshop" && <WorkshopReportTable filters={filters} />}
        {tab === "salary" && <SalesSalaryTable filters={filters} />}
        {tab === "imports" && <ImportHistoryTable filters={filters} />}
      </div>
    </PageContent>
  );
}
