"use client";

import { useState } from "react";
import { SessionUser } from "@/lib/types";
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
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">成本管理</h1>
        <p className="text-sm text-gray-500">生产成本归集与成本核算</p>
      </div>

      <CostFilters filters={filters} onChange={setFilters} />

      <div className="flex gap-2 border-b border-gray-200 pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium ${
              tab === t.key
                ? "border-b-2 border-emerald-600 text-emerald-700"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="pt-2">
        {tab === "overview" && <CostSummary filters={filters} />}
        {tab === "shipments" && <ShipmentTable filters={filters} />}
        {tab === "cost-analysis" && <CostAnalysisTable filters={filters} />}
        {tab === "cost-structure" && <CostStructureTable filters={filters} />}
        {tab === "workshop" && <WorkshopReportTable filters={filters} />}
        {tab === "salary" && <SalesSalaryTable filters={filters} />}
        {tab === "imports" && <ImportHistoryTable filters={filters} />}
      </div>
    </main>
  );
}
