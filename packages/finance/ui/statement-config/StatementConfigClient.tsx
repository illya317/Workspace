"use client";

import { useState } from "react";
import LineConfigTab from "./LineConfigTab";
import UnmappedTab from "./UnmappedTab";
import BalanceCheckTab from "./BalanceCheckTab";
import { StatementConfigProvider, useStatementConfig } from "./StatementConfigContext";
import { SelectField, Toolbar, ToolbarItem } from "@workspace/core/ui";
import { useCompanyOptions } from "@workspace/platform/hooks";
import { getPageViewTabs } from "@workspace/platform/view-registry";
import { DatabasePageFrame } from "@workspace/core/ui";

const tabs = getPageViewTabs("/finance/statement-config");

function SharedFilters() {
  const { company, setCompany, year, setYear, availablePairs, loading } = useStatementConfig();
  const years = [...new Set(availablePairs.map((p) => p.year))].sort((a, b) => b - a).map(String);
  const companyOptions = useCompanyOptions();
  const toolbarItems: ToolbarItem[] = [
    {
      kind: "custom",
      key: "filters",
      section: "filter",
      content: (
        <>
          <SelectField
            label="公司"
            options={companyOptions}
            value={company}
            onChange={setCompany}
            placeholder="—"
            className="min-w-max"
            triggerClassName="min-w-44"
          />
          <SelectField
            label="年度"
            options={years.map((y) => ({ value: y, label: y }))}
            value={year}
            onChange={setYear}
            placeholder="—"
            className="min-w-max"
            triggerClassName="min-w-36"
          />
          <span className="whitespace-nowrap text-sm text-slate-400">
            {loading ? "加载可用期间…" : `全部 tab 共享，已加载 ${availablePairs.length} 个（公司、年度）组合`}
          </span>
        </>
      ),
    },
  ];

  return <Toolbar items={toolbarItems} />;
}

function TabContent() {
  const [activeTab, setActiveTab] = useState("lines");
  return (
    <DatabasePageFrame
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      toolbar={<SharedFilters />}
    >
      <div>
        {activeTab === "lines" && <LineConfigTab />}
        {activeTab === "unmapped" && <UnmappedTab />}
        {activeTab === "balance" && <BalanceCheckTab />}
      </div>
    </DatabasePageFrame>
  );
}

export default function StatementConfigClient() {
  return (
    <StatementConfigProvider>
      <TabContent />
    </StatementConfigProvider>
  );
}
