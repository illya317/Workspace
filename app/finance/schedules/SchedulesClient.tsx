"use client";

import { useState } from "react";
import ReclassTab from "./ReclassTab";

type ScheduleTab = "reclass" | "depreciation";

const tabs: { key: ScheduleTab; label: string }[] = [
  { key: "reclass", label: "重分类表" },
  { key: "depreciation", label: "资产折旧表" },
];

export default function SchedulesClient() {
  const [activeTab, setActiveTab] = useState<ScheduleTab>("reclass");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex gap-2 overflow-x-auto border-b border-gray-200 pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? "border-b-2 border-emerald-500 text-emerald-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "reclass" && <ReclassTab />}
      {activeTab === "depreciation" && (
        <div className="rounded-lg bg-white p-8 text-center shadow-sm">
          <p className="text-gray-400">资产折旧表——开发中</p>
        </div>
      )}
    </main>
  );
}
