"use client";

import { Toolbar } from "@workspace/core/ui";
import type { ToolbarItem } from "@workspace/core/ui";

export interface ProjectDetailToolbarProps {
  editorTitle: string;
  dirty: boolean;
  creating: boolean;
  hasDraft: boolean;
  hasSelectedProject: boolean;
  saving: boolean;
  canSave: boolean;
  canDeleteCurrent: boolean;
  onSave: () => void;
  onCancelCreate: () => void;
  onDeleteProject: () => void;
}

export default function ProjectDetailToolbar({
  editorTitle,
  dirty,
  creating,
  hasDraft,
  hasSelectedProject,
  saving,
  canSave,
  canDeleteCurrent,
  onSave,
  onCancelCreate,
  onDeleteProject,
}: ProjectDetailToolbarProps) {
  const items: ToolbarItem[] = [
    {
      kind: "custom",
      key: "title",
      section: "view",
      content: (
        <div>
          <div className="text-sm font-semibold text-slate-900">{editorTitle}</div>
          {dirty && <p className="mt-1 text-xs text-amber-600">有未保存修改</p>}
        </div>
      ),
    },
    ...(!creating && hasSelectedProject && canDeleteCurrent
      ? [{
          kind: "icon-button" as const,
          key: "delete-project",
          section: "action" as const,
          icon: "delete-bin" as const,
          label: "删除项目",
          variant: "danger" as const,
          disabled: saving,
          onClick: onDeleteProject,
        }]
      : []),
    ...(creating
      ? [{
          kind: "icon-button" as const,
          key: "cancel-create",
          section: "action" as const,
          icon: "cancel" as const,
          label: "取消",
          onClick: onCancelCreate,
        }]
      : []),
    ...(hasDraft && (hasSelectedProject || creating)
      ? [{
          kind: "icon-button" as const,
          key: "save-project",
          section: "action" as const,
          icon: creating ? "add" as const : "save" as const,
          label: saving ? "保存中..." : creating ? "创建项目" : "保存项目",
          variant: "primary" as const,
          disabled: !canSave,
          onClick: onSave,
        }]
      : []),
  ];

  return <Toolbar className="mb-4 p-4" items={items} />;
}
