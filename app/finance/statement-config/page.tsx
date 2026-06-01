"use client";

import { useState } from "react";
import TabBar from "@/app/components/TabBar";
import ConfigTab from "./ConfigTab";
import MappingTab from "./MappingTab";

const tabs = [
  { key: "lines", label: "报表项目" },
  { key: "mapping", label: "科目映射" },
];

export default function StatementConfigPage() {
  const [activeTab, setActiveTab] = useState("lines");

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-800 mb-4">报表配置</h1>
      <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />
      {activeTab === "lines" && <ConfigTab />}
      {activeTab === "mapping" && <MappingTab />}
    </main>
  );
}
