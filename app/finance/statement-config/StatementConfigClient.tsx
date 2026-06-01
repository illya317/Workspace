"use client";

import { useState } from "react";
import TabBar from "@/app/components/TabBar";
import ConfigTab from "./ConfigTab";
import MappingTab from "./MappingTab";

const tabs = [
  { key: "lines", label: "报表项目" },
  { key: "mapping", label: "科目映射" },
];

export default function StatementConfigClient() {
  const [activeTab, setActiveTab] = useState("lines");

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />
      {activeTab === "lines" && <ConfigTab />}
      {activeTab === "mapping" && <MappingTab />}
    </main>
  );
}
