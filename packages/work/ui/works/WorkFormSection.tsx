"use client";

import { createBlockSurfaceBlock, createPageBody, PageSurface } from "@workspace/core/ui";
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
      body={createPageBody([createBlockSurfaceBlock("department-work-plan", {
        kind: "section",
        title: "部门 OKR 计划",
        actions: isAdmin && !showForm && !editingWork ? [{
          key: "add",
          label: "添加节点",
          variant: "primary",
          onClick: onAddClick,
        }] : undefined,

        blocks: [
          ...(!isAdmin ? [{ kind: "message" as const, key: "admin-only", tone: "muted" as const, content: "仅部门管理员可编辑 OKR 计划" }] : []),
          ...(showForm ? [{ kind: "content" as const, key: "form", content: <WorkForm onSave={onSave} onCancel={onCancelForm} /> }] : []),
        ],
      })])}
    />
  );
}
