"use client";

import { useState } from "react";
import DocumentsTab from "./components/DocumentsTab";
import DueDiligencePanel from "./due-diligence/components/DueDiligencePanel";

interface Props {
  rootLabel: string;
  canWrite?: boolean;
  canDelete?: boolean;
  canAdmin?: boolean;
}

export default function LibraryClient({ rootLabel, canWrite, canDelete, canAdmin }: Props) {
  const [activeTab, setActiveTab] = useState<"documents" | "due-diligence">("documents");

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      <div className="border-b bg-white px-6 pt-4">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab("documents")}
            className={`pb-2 text-sm font-medium border-b-2 transition ${
              activeTab === "documents"
                ? "border-emerald-500 text-emerald-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {rootLabel}
          </button>
          <button
            onClick={() => setActiveTab("due-diligence")}
            className={`pb-2 text-sm font-medium border-b-2 transition ${
              activeTab === "due-diligence"
                ? "border-emerald-500 text-emerald-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            尽调问卷
          </button>
        </div>
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
