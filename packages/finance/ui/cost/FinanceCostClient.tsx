"use client";

import { useState } from "react";
import { SessionUser } from "@workspace/platform/types";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import { DatabasePageFrame } from "@workspace/core/ui";
import CostFilters from "./components/CostFilters";
import CostSummary from "./components/CostSummary";
import ShipmentTable from "./components/ShipmentTable";
import CostAnalysisTable from "./components/CostAnalysisTable";
import CostStructureTable from "./components/CostStructureTable";
import WorkshopReportTable from "./components/WorkshopReportTable";
import SalesSalaryTable from "./components/SalesSalaryTable";
import ImportHistoryTable from "./components/ImportHistoryTable";
import type { CostFiltersState, CostTab } from "./types";

const TABS = getPageViewTabs("/finance/cost") as { key: CostTab; label: string }[];

export default function FinanceCostClient({ user: _user }: { user: SessionUser }) {
  const [tab, setTab] = useState<CostTab>("overview");
  const [filters, setFilters] = useState<CostFiltersState>({
    year: undefined,
    month: undefined,
    productName: "",
    customerName: "",
  });

  return (
    <DatabasePageFrame
      tabs={TABS}
      activeTab={tab}
      onTabChange={(key) => setTab(key as CostTab)}
      toolbar={<CostFilters filters={filters} onChange={setFilters} />}
    >
      <div>
        {tab === "overview" && <CostSummary filters={filters} />}
        {tab === "shipments" && <ShipmentTable filters={filters} />}
        {tab === "cost-analysis" && <CostAnalysisTable filters={filters} />}
        {tab === "cost-structure" && <CostStructureTable filters={filters} />}
        {tab === "workshop" && <WorkshopReportTable filters={filters} />}
        {tab === "salary" && <SalesSalaryTable filters={filters} />}
        {tab === "imports" && <ImportHistoryTable filters={filters} />}
      </div>
    </DatabasePageFrame>
  );
}
