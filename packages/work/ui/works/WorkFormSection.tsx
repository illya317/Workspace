"use client";

import { PageSurface, createPageFieldsBlock } from "@workspace/core/ui";
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
  return (
    <PageSurface
      embedded
      kind="detail"
      className="mb-6"
      blocks={[createPageFieldsBlock("department-work-plan", [{
        kind: "section",
        key: "department-work-plan",
        title: "部门工作计划",
        actions: isAdmin && !showForm && !editingWork ? [{
          key: "add",
          label: "添加工作项",
          variant: "primary",
          onClick: onAddClick,
        }] : undefined,
        fields: [
          ...(!isAdmin ? [{ kind: "note" as const, key: "admin-only", content: "仅部门管理员可编辑工作计划", className: "mb-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500" }] : []),
          ...(showForm ? [{ kind: "note" as const, key: "form", content: <div className="mb-6"><WorkForm onSave={onSave} onCancel={onCancelForm} /></div> }] : []),
        ],
      }], { className: "mb-6" })]}
    />
  );
}
