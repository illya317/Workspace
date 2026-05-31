"use client";

import { useEffect, useState } from "react";
import FinanceFilters from "../components/FinanceFilters";
import ReclassTab from "./ReclassTab";

type ScheduleTab = "reclass" | "depreciation";

const TABS: { key: ScheduleTab; label: string }[] = [
  { key: "reclass", label: "重分类表" },
  { key: "depreciation", label: "资产折旧表" },
];

export default function SchedulesClient() {
  const [companyFilter, setCompanyFilter] = useState("02");
  const [yearFilter, setYearFilter] = useState("2025");
  const [monthFilter, setMonthFilter] = useState("12");
  const [activeTab, setActiveTab] = useState<ScheduleTab>("reclass");

  return (
    <div className="space-y-4">
      <FinanceFilters
        companyFilter={companyFilter}
        yearFilter={yearFilter}
        monthFilter={monthFilter}
        onCompanyChange={setCompanyFilter}
        onYearChange={setYearFilter}
        onMonthChange={setMonthFilter}
        showPageSize={false}
        extra={
          <div className="flex gap-1 rounded-md border border-gray-200 p-0.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`rounded px-2.5 py-1 text-xs transition-colors ${
                  activeTab === t.key ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      />

      {activeTab === "reclass" && (
        <ReclassTab companyCode={companyFilter} year={yearFilter} month={monthFilter} />
      )}
      {activeTab === "depreciation" && (
        <div className="rounded-lg bg-white p-8 text-center shadow-sm">
          <p className="text-gray-400">资产折旧表——开发中</p>
        </div>
      )}
    </div>
  );
}
