"use client";

import { useState } from "react";
import TabBar from "@/app/components/TabBar";
import ReclassTab from "./ReclassTab";

const tabs = [
  { key: "reclass", label: "重分类表" },
  { key: "depreciation", label: "资产折旧表" },
];

export default function SchedulesClient() {
  const [activeTab, setActiveTab] = useState("reclass");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "reclass" && <ReclassTab />}
      {activeTab === "depreciation" && (
        <div className="rounded-lg bg-white p-8 text-center shadow-sm">
          <p className="text-gray-400">资产折旧表——开发中</p>
        </div>
      )}
    </main>
  );
}
