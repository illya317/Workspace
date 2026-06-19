"use client";

import { useState } from "react";
import { TabBar } from "@workspace/core/ui";
import DocumentsTab from "./components/DocumentsTab";
import DueDiligencePanel from "./due-diligence/components/DueDiligencePanel";

interface Props {
  rootLabel: string;
  canWrite?: boolean;
  canDelete?: boolean;
  canAdmin?: boolean;
}

const tabs = [
  { key: "documents", label: "资料库" },
  { key: "due-diligence", label: "尽调问卷" },
];

export default function LibraryClient({ rootLabel, canWrite, canDelete, canAdmin }: Props) {
  const [activeTab, setActiveTab] = useState<"documents" | "due-diligence">("documents");

  return (
    <div className="flex h-[calc(100vh-48px)] flex-col">
      <div className="bg-white px-6 pt-4">
        <TabBar
          tabs={tabs.map((tab) => (tab.key === "documents" ? { ...tab, label: rootLabel } : tab))}
          active={activeTab}
          onChange={(key) => setActiveTab(key as typeof activeTab)}
        />
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === "documents" ? (
          <DocumentsTab canWrite={canWrite} canDelete={canDelete} canAdmin={canAdmin} />
        ) : (
          <DueDiligencePanel />
        )}
      </div>
    </div>
  );
}
