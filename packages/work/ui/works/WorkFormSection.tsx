"use client";

import { CommandButton, EmptyStateCard, SectionCard } from "@workspace/core/ui";
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
  return <SectionCard title="部门工作计划" className="mb-6" actions={isAdmin && !showForm && !editingWork ? <CommandButton variant="primary" onClick={onAddClick} className="ml-auto">
            + 添加工作项
          </CommandButton> : null}>
      {!isAdmin && <EmptyStateCard compact className="mb-4">
          仅部门管理员可编辑工作计划
        </EmptyStateCard>}

      {showForm && <div className="mb-6">
          <WorkForm onSave={onSave} onCancel={onCancelForm} />
        </div>}
    </SectionCard>;
}
