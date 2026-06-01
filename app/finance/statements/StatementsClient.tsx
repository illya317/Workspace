"use client";

import { useState } from "react";
import TabBar from "@/app/components/TabBar";
import ReportTab from "./ReportTab";
import MappingTab from "./MappingTab";

const tabs = [
  { key: "report", label: "财务报表" },
  { key: "mapping", label: "科目映射" },
];

export default function StatementsClient() {
  const [activeTab, setActiveTab] = useState("report");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />
      {activeTab === "report" && <ReportTab />}
      {activeTab === "mapping" && <MappingTab />}
    </main>
  );
}
