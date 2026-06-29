"use client";

import { createMessageSection, createPageBody, createSectionSection, PageSurface } from "@workspace/core/ui";
import { useWorkFormSection } from "./WorkForm";
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
  const formSection = useWorkFormSection({ initial: editingWork, onSave, onCancel: onCancelForm });

  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([createSectionSection("department-work-plan", {
        title: "部门 OKR 计划",
        actions: isAdmin && !showForm && !editingWork ? [{
          key: "add",
          label: "添加节点",
          variant: "primary",
          onClick: onAddClick,
        }] : undefined,

        sections: [
          ...(!isAdmin ? [createMessageSection("admin-only", { tone: "muted", content: "仅部门管理员可编辑 OKR 计划" })] : []),
          ...(showForm ? [formSection] : []),
        ],
      })])}
    />
  );
}
