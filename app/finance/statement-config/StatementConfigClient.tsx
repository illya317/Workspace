"use client";

import { useState } from "react";
import TabBar from "@/app/components/TabBar";
import MappingTab from "./MappingTab";
import ConfigTab from "./ConfigTab";
import BalanceCheckTab from "./BalanceCheckTab";

const tabs = [
  { key: "mapping", label: "科目映射" },
  { key: "lines", label: "报表项目" },
  { key: "balance", label: "余额校对" },
];

export default function StatementConfigClient() {
  const [activeTab, setActiveTab] = useState("mapping");

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />
      {activeTab === "mapping" && <MappingTab />}
      {activeTab === "lines" && <ConfigTab />}
      {activeTab === "balance" && <BalanceCheckTab />}
    </main>
  );
}
