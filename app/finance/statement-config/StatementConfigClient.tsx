"use client";

import { useState } from "react";
import LineConfigTab from "./LineConfigTab";
import UnmappedTab from "./UnmappedTab";
import BalanceCheckTab from "./BalanceCheckTab";
import { StatementConfigProvider, useStatementConfig } from "./StatementConfigContext";
import { FilterBar, PageContent, SelectField, TabBar } from "@workspace/core/ui";
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
    <div className="mt-4">
      <FilterBar>
        <SelectField
          label="公司"
          options={companyOptions}
          value={company}
          onChange={setCompany}
          placeholder="—"
          size="toolbar"
          selectClassName="min-w-44"
        />
        <SelectField
          label="年度"
          options={years.map((y) => ({ value: y, label: y }))}
          value={year}
          onChange={setYear}
          placeholder="—"
          size="toolbar"
          selectClassName="min-w-36"
        />
        <span className="text-sm text-slate-400">
          {loading ? "加载可用期间…" : `已加载 ${availablePairs.length} 个 (公司, 年度) 组合`}
        </span>
      </FilterBar>
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
    <PageContent className="max-w-6xl">
      <StatementConfigProvider>
        <TabContent />
      </StatementConfigProvider>
    </PageContent>
  );
}
