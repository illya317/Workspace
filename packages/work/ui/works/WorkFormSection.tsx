"use client";

import { EmptyStateCard, SectionCard, getToolbarActionClassName } from "@workspace/core/ui";
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
  onSave
}: WorkFormSectionProps) {
  return <SectionCard title="部门工作计划" className="mb-6" actions={isAdmin && !showForm && !editingWork ? <button type="button" onClick={onAddClick} className={[getToolbarActionClassName("primary"), "ml-auto"].filter(Boolean).join(" ")}>
            + 添加工作项
          </button> : null}>
      {!isAdmin && <EmptyStateCard compact className="mb-4">
          仅部门管理员可编辑工作计划
        </EmptyStateCard>}

      {showForm && <div className="mb-6">
          <WorkForm onSave={onSave} onCancel={onCancelForm} />
        </div>}
    </SectionCard>;
}
