"use client";

import WorkForm from "./WorkForm";
import type { WorkItem } from "./types";

export interface WorkFormData {
  category: string;
  content: string;
  importance: number;
  urgency: number;
  participants: string;
  sortOrder: number;
}

interface WorkFormSectionProps {
  isAdmin: boolean;
  showForm: boolean;
  editingWork: WorkItem | null;
  onAddClick: () => void;
  onCancelForm: () => void;
  onSave: (data: WorkFormData) => Promise<void>;
}

export default function WorkFormSection({
  isAdmin,
  showForm,
  editingWork,
  onAddClick,
  onCancelForm,
  onSave,
}: WorkFormSectionProps) {
  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">部门工作清单</h2>
        {isAdmin && !showForm && !editingWork && (
          <button
            type="button"
            onClick={onAddClick}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
          >
            + 添加工作项
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className="mb-4 rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-500">
          仅部门管理员可编辑工作清单
        </div>
      )}

      {showForm && (
        <div className="mb-6">
          <WorkForm
            onSave={onSave}
            onCancel={onCancelForm}
          />
        </div>
      )}
    </>
  );
}
