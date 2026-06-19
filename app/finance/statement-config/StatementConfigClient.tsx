"use client";

import { useState } from "react";
import TabBar from "@/app/components/TabBar";
import LineConfigTab from "./LineConfigTab";
import UnmappedTab from "./UnmappedTab";
import BalanceCheckTab from "./BalanceCheckTab";
import { StatementConfigProvider, useStatementConfig } from "./StatementConfigContext";
import { SelectField } from "@workspace/core/ui";
import { useCompanyOptions } from "@workspace/platform/hooks";

const tabs = [
  { key: "lines", label: "报表项目配置" },
  { key: "unmapped", label: "遗漏科目" },
  { key: "balance", label: "余额校对" },
];

function SharedFilters() {
  const { company, setCompany, year, setYear, availablePairs, loading } = useStatementConfig();
  const years = [...new Set(availablePairs.map((p) => p.year))].sort((a, b) => b - a).map(String);
  const companyOptions = useCompanyOptions();
  return (
    <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
      <SelectField
        label="公司（全部 tab 共享）"
        options={companyOptions}
        value={company}
        onChange={setCompany}
        placeholder="—"
      />
      <SelectField
        label="年度（全部 tab 共享）"
        options={years.map((y) => ({ value: y, label: y }))}
        value={year}
        onChange={setYear}
        placeholder="—"
      />
      <span className="ml-2 text-[11px] text-gray-400">
        {loading ? "加载可用期间…" : `已加载 ${availablePairs.length} 个 (公司, 年度) 组合`}
      </span>
    </div>
  );
}

function TabContent() {
  const [activeTab, setActiveTab] = useState("lines");
  return (
    <>
      <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <SharedFilters />
      <div className="mt-4">
        {activeTab === "lines" && <LineConfigTab />}
        {activeTab === "unmapped" && <UnmappedTab />}
        {activeTab === "balance" && <BalanceCheckTab />}
      </div>
    </>
  );
}

export default function StatementConfigClient() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <StatementConfigProvider>
        <TabContent />
      </StatementConfigProvider>
    </main>
  );
}
